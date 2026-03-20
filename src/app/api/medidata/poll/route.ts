import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getDownloads,
  getDownload,
  confirmDownload,
  getNotifications,
  confirmNotification,
  getUploadStatus,
} from "@/lib/medidataProxy";

/**
 * POST /api/medidata/poll
 * Polls MediData for new downloads (insurer responses) and notifications,
 * stores them in the local database, and optionally confirms receipt.
 *
 * This is the recommended approach for Swiss medical software:
 * - Store everything locally for audit trail
 * - Confirm receipt on MediData so messages are cleared
 * - Poll every 30 minutes in production (per MediData best practice docs)
 */
export async function POST() {
  try {
    const results = {
      downloads: { found: 0, processed: 0, errors: 0, items: [] as any[] },
      notifications: { found: 0, processed: 0, errors: 0, items: [] as any[] },
      statusUpdates: { checked: 0, updated: 0 },
    };

    // ── 1. Poll pending submission statuses ──
    const { data: pendingSubs } = await supabaseAdmin
      .from("medidata_submissions")
      .select("id, medidata_message_id, status")
      .in("status", ["pending", "transmitted"])
      .not("medidata_message_id", "is", null)
      .limit(20);

    if (pendingSubs && pendingSubs.length > 0) {
      for (const sub of pendingSubs) {
        results.statusUpdates.checked++;
        try {
          const statusResult = await getUploadStatus(sub.medidata_message_id!);
          const rawData = statusResult.rawResponse as any;
          const medidataStatus = rawData?.data?.status;
          const errorReason = rawData?.data?.errorReason;

          let newStatus = sub.status;
          if (medidataStatus === "DONE") newStatus = "transmitted";
          if (medidataStatus === "DELIVERED") newStatus = "delivered";
          if (medidataStatus === "ERROR") newStatus = "rejected";
          // TG invoices use GLN 2000000000008 (no transmission to insurance)
          // They stay at PROCESSING and won't get insurer responses - mark as transmitted
          if (medidataStatus === "PROCESSING" && sub.status === "pending") {
            // Check if this has been processing for >60 seconds (likely a TG invoice)
            const created = rawData?.data?.created;
            if (created) {
              const createdTime = new Date(created).getTime();
              const now = Date.now();
              if (now - createdTime > 60000) { // 60 seconds
                newStatus = "transmitted";
              }
            }
          }

          if (newStatus !== sub.status) {
            await supabaseAdmin
              .from("medidata_submissions")
              .update({
                status: newStatus,
                medidata_response_code: medidataStatus,
                medidata_response_message: errorReason || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", sub.id);

            await supabaseAdmin.from("medidata_submission_history").insert({
              submission_id: sub.id,
              previous_status: sub.status,
              new_status: newStatus,
              response_code: medidataStatus,
              response_message: errorReason || null,
            });

            results.statusUpdates.updated++;
          }
        } catch (e) {
          console.error(`[poll] Status check failed for ${sub.id}:`, e);
        }
      }
    }

    // ── 2. Poll downloads (insurer responses) ──
    const downloads = await getDownloads();
    results.downloads.found = downloads.length;

    for (const dl of downloads) {
      try {
        const ref = dl.transmissionReference;

        // Check if we already stored this response
        const { data: existing } = await supabaseAdmin
          .from("medidata_responses")
          .select("id")
          .eq("medidata_message_id", ref)
          .limit(1)
          .single();

        if (existing) {
          // Already processed — skip
          continue;
        }

        // Download the full content
        const fullDoc = await getDownload(ref);
        const content =
          typeof fullDoc.data === "string"
            ? fullDoc.data
            : JSON.stringify(fullDoc.data);

        // Parse response type from XML
        const parsed = parseResponseXml(content);

        // Try to find the related submission.
        // CRITICAL: Match by transmission reference FIRST (unique per upload),
        // then fall back to invoice_number only if transmission ref not found.
        // This prevents multiple responses for the same invoice from all going to the latest submission.
        const corrRef = (dl as any).correlationReference || (dl as any).documentReference || "";
        const transmissionRef = ref; // The download's transmissionReference is the unique upload ID
        let submissionId: string | null = null;
        let matchedSub: { id: string; status: string } | null = null;

        // First try matching by transmission reference (most reliable - unique per upload)
        const { data: subByRef } = await supabaseAdmin
          .from("medidata_submissions")
          .select("id, status")
          .eq("medidata_message_id", transmissionRef)
          .limit(1)
          .single();

        if (subByRef) {
          matchedSub = subByRef;
        } else if (corrRef) {
          // Fall back to matching by invoice_number (correlation reference)
          // Only use this if transmission ref didn't match
          const { data: subByInv } = await supabaseAdmin
            .from("medidata_submissions")
            .select("id, status")
            .eq("invoice_number", corrRef)
            .not("medidata_message_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (subByInv) {
            matchedSub = subByInv;
          }
        }

        if (matchedSub) {
          submissionId = matchedSub.id;

          // Update submission status based on response
          const newStatus = parsed.type === "accepted" ? "accepted"
            : parsed.type === "rejected" ? "rejected"
            : parsed.type === "pending" ? "pending"
            : matchedSub.status;

          if (newStatus !== matchedSub.status) {
            await supabaseAdmin
              .from("medidata_submissions")
              .update({
                status: newStatus,
                insurance_response_date: new Date().toISOString(),
                insurance_response_code: parsed.statusOut,
                insurance_response_message: parsed.explanation || parsed.type,
                updated_at: new Date().toISOString(),
              })
              .eq("id", matchedSub.id);

            await supabaseAdmin.from("medidata_submission_history").insert({
              submission_id: matchedSub.id,
              previous_status: matchedSub.status,
              new_status: newStatus,
              response_code: parsed.statusOut,
              response_message: `Insurer response: ${parsed.type}${parsed.explanation ? ` — ${parsed.explanation}` : ""}`,
            });
          }
        }

        // Save response XML document to storage
        let responseDocPath: string | null = null;
        if (submissionId && content) {
          try {
            // Look up patient_id for the storage path
            const { data: subData } = await supabaseAdmin
              .from("medidata_submissions")
              .select("patient_id, invoice_number")
              .eq("id", submissionId)
              .single();
            if (subData?.patient_id) {
              const docFileName = `medidata-response-${subData.invoice_number || ref}-${Date.now()}.xml`;
              const storagePath = `${subData.patient_id}/${docFileName}`;
              const { error: storeErr } = await supabaseAdmin.storage
                .from("invoice-pdfs")
                .upload(storagePath, Buffer.from(content, "utf-8"), {
                  contentType: "application/xml",
                  cacheControl: "3600",
                  upsert: true,
                });
              if (!storeErr) {
                responseDocPath = storagePath;
              } else {
                console.warn(`[poll] Response XML storage failed:`, storeErr.message);
              }
            }
          } catch (e) {
            console.warn(`[poll] Failed to store response doc:`, e);
          }
        }

        // Store the response in DB
        await supabaseAdmin.from("medidata_responses").insert({
          medidata_message_id: ref,
          document_reference: (dl as any).documentReference || null,
          correlation_reference: corrRef || null,
          submission_id: submissionId,
          response_type: parsed.type,
          status_in: parsed.statusIn,
          status_out: parsed.statusOut,
          sender_gln: (dl as any).senderGln || null,
          content,
          raw_data: dl,
          explanation: parsed.explanation,
          received_at: (dl as any).created || new Date().toISOString(),
          processed_at: new Date().toISOString(),
          ...(responseDocPath ? { document_path: responseDocPath } : {}),
        });

        // Confirm receipt to MediData
        const confirmed = await confirmDownload(ref);
        if (confirmed) {
          await supabaseAdmin
            .from("medidata_responses")
            .update({ confirmed_at: new Date().toISOString() })
            .eq("medidata_message_id", ref);
        }

        results.downloads.processed++;
        results.downloads.items.push({
          ref,
          type: parsed.type,
          statusOut: parsed.statusOut,
          explanation: parsed.explanation,
          submissionId,
          confirmed,
        });
      } catch (e) {
        console.error(`[poll] Download processing failed for ${dl.transmissionReference}:`, e);
        results.downloads.errors++;
      }
    }

    // ── 3. Poll notifications ──
    const notifResult = await getNotifications();
    const notifications = Array.isArray(notifResult.data) ? notifResult.data : [];
    results.notifications.found = notifications.length;

    for (const n of notifications as any[]) {
      try {
        const notifId = n.id;

        // Check if already stored
        const { data: existing } = await supabaseAdmin
          .from("medidata_notifications_log")
          .select("id")
          .eq("medidata_notification_id", notifId)
          .limit(1)
          .single();

        if (existing) continue;

        // Find related submission
        let submissionId: string | null = null;
        if (n.transmissionReference) {
          const { data: sub } = await supabaseAdmin
            .from("medidata_submissions")
            .select("id")
            .eq("medidata_message_id", n.transmissionReference)
            .limit(1)
            .single();
          if (sub) submissionId = sub.id;
        }

        // Extract message text (MediData sends multilingual object {de, fr, it})
        let messageText: string | null = null;
        let errorCode: string | null = n.errorCode || null;
        if (typeof n.message === "object" && n.message !== null) {
          messageText = n.message.de || n.message.fr || n.message.en || n.message.it || JSON.stringify(n.message);
        } else if (typeof n.message === "string") {
          messageText = n.message;
        }
        // Extract error code from message text if not provided directly
        if (!errorCode && messageText) {
          const codeMatch = messageText.match(/Fehler-Code:\s*(\S+)/);
          if (codeMatch) errorCode = codeMatch[1];
        }

        // Store notification
        await supabaseAdmin.from("medidata_notifications_log").insert({
          medidata_notification_id: notifId,
          severity: n.severity || "INFO",
          error_code: errorCode,
          message: messageText,
          transmission_reference: n.transmissionReference || null,
          submission_id: submissionId,
          medidata_created_at: n.created || null,
        });

        // Confirm notification
        const confirmed = await confirmNotification(notifId);
        if (confirmed) {
          await supabaseAdmin
            .from("medidata_notifications_log")
            .update({ confirmed_at: new Date().toISOString() })
            .eq("medidata_notification_id", notifId);
        }

        results.notifications.processed++;
        results.notifications.items.push({
          id: notifId,
          severity: n.severity,
          message: n.message,
          confirmed,
        });
      } catch (e) {
        console.error(`[poll] Notification processing failed:`, e);
        results.notifications.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      polledAt: new Date().toISOString(),
      ...results,
    });
  } catch (error) {
    console.error("[poll] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}

/**
 * Parse insurer response XML to extract type and explanation.
 */
function parseResponseXml(content: string): {
  type: string;
  statusIn: string;
  statusOut: string;
  explanation: string;
} {
  let type = "unknown";
  let statusIn = "";
  let statusOut = "";
  let explanation = "";

  // Check for accepted/rejected/pending
  const acceptedMatch = content.match(/status_in="([^"]*)"[^>]*status_out="([^"]*)"/);
  if (acceptedMatch) {
    statusIn = acceptedMatch[1];
    statusOut = acceptedMatch[2];
  }

  if (content.includes("<invoice:accepted") || content.includes("status_out=\"granted\"")) {
    type = "accepted";
  } else if (content.includes("<invoice:rejected") || content.includes("status_out=\"refused\"")) {
    type = "rejected";
  } else if (content.includes("<invoice:pending") || content.includes("status_out=\"pending\"")) {
    type = "pending";
  }

  // Extract explanation
  const explMatch = content.match(/<invoice:explanation>([^<]+)<\/invoice:explanation>/);
  if (explMatch) {
    explanation = explMatch[1];
  }

  // Also check for text in status/reason elements
  if (!explanation) {
    const textMatch = content.match(/<invoice:text>([^<]+)<\/invoice:text>/);
    if (textMatch) explanation = textMatch[1];
  }

  return { type, statusIn, statusOut, explanation };
}
