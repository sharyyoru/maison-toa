import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MediDataClient } from "@/lib/medidataClient";

type MediDataConfigRow = {
  medidata_endpoint_url: string | null;
  medidata_client_id: string | null;
  medidata_username: string | null;
  medidata_password_encrypted: string | null;
  is_test_mode: boolean;
};

/**
 * GET /api/medidata/downloads
 * Fetch incoming messages (responses from insurers) from MediData
 */
export async function GET() {
  try {
    // Get MediData config
    const { data: configData } = await supabaseAdmin
      .from("medidata_config")
      .select("medidata_endpoint_url, medidata_client_id, medidata_username, medidata_password_encrypted, is_test_mode")
      .limit(1)
      .single();

    const config = configData as MediDataConfigRow | null;

    if (!config?.medidata_endpoint_url || !config?.medidata_client_id || 
        !config?.medidata_username || !config?.medidata_password_encrypted) {
      return NextResponse.json({
        success: false,
        error: "MediData not configured",
        downloads: [],
      });
    }

    // Create MediData client
    const medidataClient = new MediDataClient({
      baseUrl: config.medidata_endpoint_url,
      clientId: config.medidata_client_id,
      username: config.medidata_username,
      password: config.medidata_password_encrypted,
      isTestMode: config.is_test_mode,
    });

    const downloads = await medidataClient.getDownloads();

    return NextResponse.json({
      success: true,
      count: downloads.length,
      downloads,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching downloads:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", downloads: [] },
      { status: 500 }
    );
  }
}

/**
 * POST /api/medidata/downloads
 * Process and acknowledge downloaded messages
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, messageId } = body;

    if (!action || !messageId) {
      return NextResponse.json(
        { error: "action and messageId are required" },
        { status: 400 }
      );
    }

    // Get MediData config
    const { data: configData } = await supabaseAdmin
      .from("medidata_config")
      .select("medidata_endpoint_url, medidata_client_id, medidata_username, medidata_password_encrypted, is_test_mode")
      .limit(1)
      .single();

    const config = configData as MediDataConfigRow | null;

    if (!config?.medidata_endpoint_url || !config?.medidata_client_id || 
        !config?.medidata_username || !config?.medidata_password_encrypted) {
      return NextResponse.json(
        { error: "MediData not configured" },
        { status: 400 }
      );
    }

    // Create MediData client
    const medidataClient = new MediDataClient({
      baseUrl: config.medidata_endpoint_url,
      clientId: config.medidata_client_id,
      username: config.medidata_username,
      password: config.medidata_password_encrypted,
      isTestMode: config.is_test_mode,
    });

    if (action === "acknowledge") {
      // Acknowledge (delete) the message from MediData
      const success = await medidataClient.acknowledgeDownload(messageId);

      return NextResponse.json({
        success,
        messageId,
        action: "acknowledged",
        acknowledgedAt: success ? new Date().toISOString() : null,
      });
    } else if (action === "process") {
      // Fetch the message first
      const downloads = await medidataClient.getDownloads();
      const message = downloads.find((d) => d.id === messageId);

      if (!message) {
        return NextResponse.json(
          { error: "Message not found" },
          { status: 404 }
        );
      }

      // Parse the message content to determine response type
      let responseType = "unknown";
      let invoiceNumber: string | null = null;
      let accepted = false;
      let rejectionReason: string | null = null;

      // Try to parse XML content if available
      if (message.content) {
        // Simple parsing - in production, use proper XML parser
        if (message.content.includes("<accepted") || message.content.includes("status=\"accepted\"")) {
          responseType = "acceptance";
          accepted = true;
        } else if (message.content.includes("<rejected") || message.content.includes("status=\"rejected\"")) {
          responseType = "rejection";
          accepted = false;
          // Try to extract rejection reason
          const reasonMatch = message.content.match(/<reason[^>]*>([^<]+)<\/reason>/i);
          if (reasonMatch) {
            rejectionReason = reasonMatch[1];
          }
        } else if (message.content.includes("<reminder") || message.type === "reminder") {
          responseType = "reminder";
        } else if (message.content.includes("<payment") || message.type === "payment") {
          responseType = "payment";
          accepted = true;
        }

        // Try to extract invoice number
        const invoiceMatch = message.content.match(/invoice[_-]?number[=\s:"']+([A-Z0-9-]+)/i) ||
                            message.content.match(/request_id[=\s:"']+([A-Z0-9-]+)/i);
        if (invoiceMatch) {
          invoiceNumber = invoiceMatch[1];
        }
      }

      // Find related submission in database
      let submissionId: string | null = null;
      if (invoiceNumber) {
        const { data: submission } = await supabaseAdmin
          .from("medidata_submissions")
          .select("id, status")
          .eq("invoice_number", invoiceNumber)
          .single();

        if (submission) {
          submissionId = submission.id;

          // Update submission status based on response
          let newStatus = submission.status;
          if (responseType === "acceptance" || responseType === "payment") {
            newStatus = accepted ? "accepted" : "rejected";
          } else if (responseType === "rejection") {
            newStatus = "rejected";
          }

          if (newStatus !== submission.status) {
            await supabaseAdmin
              .from("medidata_submissions")
              .update({
                status: newStatus,
                medidata_response_message: rejectionReason || responseType,
                updated_at: new Date().toISOString(),
              })
              .eq("id", submission.id);

            await supabaseAdmin.from("medidata_submission_history").insert({
              submission_id: submission.id,
              previous_status: submission.status,
              new_status: newStatus,
              changed_by: null,
              notes: `Response from insurer: ${responseType}${rejectionReason ? ` - ${rejectionReason}` : ""}`,
            });
          }
        }
      }

      // Store the raw response for audit (table may not exist yet)
      try {
        await supabaseAdmin.from("medidata_responses").insert({
          medidata_message_id: messageId,
          submission_id: submissionId,
          response_type: responseType,
          sender_gln: message.sender,
          content: message.content,
          raw_data: message.rawData,
          received_at: message.timestamp,
          processed_at: new Date().toISOString(),
        });
      } catch {
        console.log("Could not store response in medidata_responses table - table may not exist");
      }

      // Acknowledge the message
      await medidataClient.acknowledgeDownload(messageId);

      return NextResponse.json({
        success: true,
        messageId,
        action: "processed",
        responseType,
        invoiceNumber,
        submissionId,
        accepted,
        rejectionReason,
        processedAt: new Date().toISOString(),
      });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'acknowledge' or 'process'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error processing download:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
