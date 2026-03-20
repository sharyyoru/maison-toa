import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractReplyContent } from "@/utils/emailCleaner";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Mailgun configuration for forwarding emails
const mailgunApiKey = process.env.MAILGUN_API_KEY;
const mailgunDomain = process.env.MAILGUN_DOMAIN;
const mailgunApiBaseUrl = process.env.MAILGUN_API_BASE_URL || "https://api.eu.mailgun.net";

type AttachmentInfo = {
  fileName: string;
  contentType: string;
  data: ArrayBuffer;
  size: number;
};

export async function POST(request: Request) {
  // Log that webhook was hit - this helps debug if Mailgun is reaching us
  console.log("=== MAILGUN INBOUND WEBHOOK HIT ===");
  console.log("Timestamp:", new Date().toISOString());
  
  try {
    // Parse the incoming webhook data from Mailgun
    const formData = await request.formData();
    
    // Log all form data keys for debugging
    const formDataKeys = Array.from(formData.keys());
    console.log("Form data keys received:", formDataKeys);
    
    const from = formData.get("from")?.toString() || formData.get("From")?.toString() || "";
    const to = formData.get("To")?.toString() || formData.get("to")?.toString() || formData.get("recipient")?.toString() || "";
    const subject = formData.get("Subject")?.toString() || formData.get("subject")?.toString() || "";
    const bodyPlain = formData.get("body-plain")?.toString() || "";
    const bodyHtml = formData.get("body-html")?.toString() || "";
    const timestamp = formData.get("timestamp")?.toString() || "";
    const inReplyTo = formData.get("In-Reply-To")?.toString() || "";
    const references = formData.get("References")?.toString() || "";
    const messageId = formData.get("Message-Id")?.toString() || formData.get("message-id")?.toString() || "";
    
    // Log key email details
    console.log("INBOUND EMAIL DETAILS:");
    console.log("  From:", from);
    console.log("  To:", to);
    console.log("  Subject:", subject);
    console.log("  Message-Id:", messageId);
    console.log("  Body length:", (bodyPlain || bodyHtml).length);
    
    // Initialize Supabase client early for deduplication check
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // DEDUPLICATION: Check if we've already processed this email
    // Method 1: Check by message-id (most reliable)
    if (messageId) {
      const { data: existingEmail } = await supabase
        .from("emails")
        .select("id")
        .eq("message_id", messageId)
        .maybeSingle();
      
      if (existingEmail) {
        console.log("Skipping duplicate email - already processed message-id:", messageId);
        return NextResponse.json({ 
          ok: true, 
          message: "Skipped duplicate email",
          reason: "duplicate_message_id",
          existingEmailId: existingEmail.id
        });
      }
    }
    
    // Method 2: Fallback deduplication using sender + timestamp + subject hash
    // This catches duplicates even when message-id is missing or Mailgun retries
    const dedupEmailMatch = from.match(/<([^>]+)>/) || [null, from];
    const senderEmailForDedup = dedupEmailMatch[1]?.trim().toLowerCase() || from.trim().toLowerCase();
    const timestampMs = timestamp ? parseInt(timestamp) * 1000 : Date.now();
    // Check for emails from same sender with same subject within 60 seconds
    const windowStart = new Date(timestampMs - 60000).toISOString();
    const windowEnd = new Date(timestampMs + 60000).toISOString();
    
    const { data: recentDuplicate } = await supabase
      .from("emails")
      .select("id")
      .ilike("from_address", senderEmailForDedup)
      .eq("subject", subject)
      .gte("sent_at", windowStart)
      .lte("sent_at", windowEnd)
      .maybeSingle();
    
    if (recentDuplicate) {
      console.log("Skipping duplicate email - found recent email with same sender/subject:", recentDuplicate.id);
      return NextResponse.json({ 
        ok: true, 
        message: "Skipped duplicate email",
        reason: "duplicate_sender_subject_window",
        existingEmailId: recentDuplicate.id
      });
    }
    
    // Get custom variables we set when sending
    const emailId = formData.get("email-id")?.toString() || "";
    const patientId = formData.get("patient-id")?.toString() || "";
    const sentByEmail = formData.get("sent-by")?.toString() || "";
    const forwardedReply = formData.get("forwarded-reply")?.toString() || "";
    
    console.log("  Custom vars - emailId:", emailId, "patientId:", patientId, "sentBy:", sentByEmail, "forwardedReply:", forwardedReply);
    
    // DEDUPLICATION Method 3: If emailId is set, this is an email WE sent - it already exists in DB
    // This catches the race condition where webhook receives the email before message_id is updated
    if (emailId && !forwardedReply) {
      // Check if this email ID exists in our DB
      const { data: existingByEmailId } = await supabase
        .from("emails")
        .select("id")
        .eq("id", emailId)
        .maybeSingle();
      
      if (existingByEmailId) {
        console.log("Skipping - this is our own outbound email, already in DB:", emailId);
        return NextResponse.json({ 
          ok: true, 
          message: "Skipped own outbound email",
          reason: "own_outbound_email",
          existingEmailId: emailId
        });
      }
    }
    
    // Mailgun sends attachment count and individual attachments
    const attachmentCountStr = formData.get("attachment-count")?.toString() || "0";
    const attachmentCount = parseInt(attachmentCountStr, 10) || 0;
    
    // Collect attachments from form data
    const attachments: AttachmentInfo[] = [];
    
    // Mailgun sends attachments as "attachment-1", "attachment-2", etc. or just "attachment"
    for (let i = 1; i <= Math.max(attachmentCount, 10); i++) {
      const attachment = formData.get(`attachment-${i}`) as File | null;
      if (attachment && attachment instanceof File) {
        try {
          const arrayBuffer = await attachment.arrayBuffer();
          attachments.push({
            fileName: attachment.name || `attachment-${i}`,
            contentType: attachment.type || "application/octet-stream",
            data: arrayBuffer,
            size: attachment.size,
          });
        } catch (err) {
          console.error(`Error reading attachment-${i}:`, err);
        }
      }
    }
    
    // Also check for generic "attachment" field (some Mailgun configurations)
    const genericAttachment = formData.get("attachment") as File | null;
    if (genericAttachment && genericAttachment instanceof File) {
      try {
        const arrayBuffer = await genericAttachment.arrayBuffer();
        attachments.push({
          fileName: genericAttachment.name || "attachment",
          contentType: genericAttachment.type || "application/octet-stream",
          data: arrayBuffer,
          size: genericAttachment.size,
        });
      } catch (err) {
        console.error("Error reading generic attachment:", err);
      }
    }
    
    let targetPatientId = patientId;
    let targetEmailId = emailId;
    let originalSubject = subject;
    
    // Method 0: Parse smart CC/Reply-To address (format: reply+{emailId}+{patientId}@domain)
    // Check both "to" and "cc" fields for the tracking address
    const allRecipients = `${to} ${formData.get("Cc")?.toString() || ""}`;
    const smartAddressMatch = allRecipients.match(/reply\+([a-f0-9-]+)\+([a-f0-9-]+)@/i);
    if (smartAddressMatch) {
      targetEmailId = smartAddressMatch[1];
      targetPatientId = smartAddressMatch[2];
      console.log("Parsed smart address - emailId:", targetEmailId, "patientId:", targetPatientId);
    } else {
      // Try format with just emailId: reply+{emailId}@domain
      const simpleMatch = allRecipients.match(/reply\+([a-f0-9-]+)@/i);
      if (simpleMatch) {
        targetEmailId = simpleMatch[1];
        console.log("Parsed simple smart address - emailId:", targetEmailId);
      }
    }
    
    // If we found emailId from smart address, look up the patient
    if (targetEmailId && !targetPatientId) {
      const { data: originalEmail } = await supabase
        .from("emails")
        .select("patient_id, subject")
        .eq("id", targetEmailId)
        .single();
      
      if (originalEmail) {
        targetPatientId = originalEmail.patient_id;
        originalSubject = originalEmail.subject;
        console.log("Found patient from emailId:", targetPatientId);
      }
    }
    
    // Try to find the original email using multiple methods if still not found
    if (!targetPatientId) {
      // Method 1: Check if this is a reply using In-Reply-To header
      if (inReplyTo) {
        const { data: originalEmail } = await supabase
          .from("emails")
          .select("patient_id, subject")
          .eq("message_id", inReplyTo)
          .single();
        
        if (originalEmail) {
          targetPatientId = originalEmail.patient_id;
          originalSubject = originalEmail.subject;
        }
      }
      
      // Method 2: Check References header (thread tracking)
      if (!targetPatientId && references) {
        const messageIds = references.split(/\s+/).filter(Boolean);
        if (messageIds.length > 0) {
          const { data: originalEmail } = await supabase
            .from("emails")
            .select("patient_id, subject")
            .in("message_id", messageIds)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
          
          if (originalEmail) {
            targetPatientId = originalEmail.patient_id;
            originalSubject = originalEmail.subject;
          }
        }
      }
      
      // Method 3: Try to find by matching sender email (the "from" in the reply is the patient)
      if (!targetPatientId) {
        // Extract email from "Name <email@domain.com>" format
        const emailMatch = from.match(/<([^>]+)>/) || [null, from];
        const senderEmail = emailMatch[1]?.trim() || from.trim();
        
        const { data: patient } = await supabase
          .from("patients")
          .select("id")
          .eq("email", senderEmail)
          .single();
        
        if (patient) {
          targetPatientId = patient.id;
        }
      }
    }
    
    // Clean the email body to remove signatures and quoted text
    const rawBody = bodyHtml || bodyPlain;
    const isHtml = !!bodyHtml;
    const cleanedBody = extractReplyContent(rawBody, isHtml);
    
    // Extract sender email
    const emailMatch = from.match(/<([^>]+)>/) || [null, from];
    const senderEmail = emailMatch[1]?.trim() || from.trim();
    
    // IMPORTANT: First check if the sender is the patient we're communicating with
    // This prevents the case where a patient's email is also registered as a clinic user
    let senderIsThePatient = false;
    if (targetPatientId) {
      const { data: targetPatient } = await supabase
        .from("patients")
        .select("id, email")
        .eq("id", targetPatientId)
        .single();
      
      if (targetPatient?.email && targetPatient.email.toLowerCase() === senderEmail.toLowerCase()) {
        senderIsThePatient = true;
        console.log("Sender IS the patient we're communicating with:", senderEmail);
      }
    }
    
    // Check if sender is a clinic user (only relevant if sender is NOT the patient)
    let senderIsClinicUser = null;
    if (!senderIsThePatient) {
      const { data } = await supabase
        .from("users")
        .select("id, email")
        .ilike("email", senderEmail)
        .maybeSingle();
      senderIsClinicUser = data;
    }
    
    // If sender is a clinic user (and NOT the patient) AND this is a reply to a patient thread,
    // treat it as an outbound reply from the clinic user to the patient
    if (senderIsClinicUser && !senderIsThePatient && targetEmailId && targetPatientId) {
      console.log("Clinic user reply detected - processing as outbound to patient");
      
      // Get the patient's email to forward the reply
      const { data: patient } = await supabase
        .from("patients")
        .select("id, email, first_name, last_name")
        .eq("id", targetPatientId)
        .single();
      
      if (patient && patient.email) {
        // Log this as an outbound email from the clinic
        const { data: insertedOutbound, error: outboundError } = await supabase
          .from("emails")
          .insert({
            patient_id: targetPatientId,
            from_address: senderEmail,
            to_address: patient.email,
            subject: subject,
            body: cleanedBody || rawBody,
            status: "sent",
            direction: "outbound",
            message_id: messageId || null,
            sent_at: timestamp ? new Date(parseInt(timestamp) * 1000).toISOString() : new Date().toISOString(),
            created_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        
        if (outboundError) {
          console.error("Error logging clinic user reply:", outboundError);
        } else {
          console.log("Clinic user reply logged as outbound email:", insertedOutbound?.id);
          
          // Forward the reply to the patient
          if (mailgunApiKey && mailgunDomain) {
            try {
              const forwardFormData = new FormData();
              
              // Send from the clinic user's perspective
              const senderName = from.match(/^([^<]+)/) ? from.match(/^([^<]+)/)?.[1]?.trim() : senderEmail.split("@")[0];
              forwardFormData.append("from", `${senderName} <${senderEmail}>`);
              forwardFormData.append("to", patient.email);
              forwardFormData.append("subject", subject || "Re: Your inquiry");
              forwardFormData.append("html", cleanedBody || rawBody);
              
              // Set Reply-To with tracking so patient replies come back to our system
              // NOTE: Do NOT CC the tracking address - it causes an infinite loop!
              const replyToAddress = `reply+${insertedOutbound?.id}+${targetPatientId}@${mailgunDomain}`;
              forwardFormData.append("h:Reply-To", replyToAddress);
              
              // Add tracking metadata
              if (insertedOutbound?.id) {
                forwardFormData.append("v:email-id", insertedOutbound.id);
              }
              forwardFormData.append("v:patient-id", targetPatientId);
              
              const auth = Buffer.from(`api:${mailgunApiKey}`).toString("base64");
              
              const sendResponse = await fetch(`${mailgunApiBaseUrl}/v3/${mailgunDomain}/messages`, {
                method: "POST",
                headers: {
                  Authorization: `Basic ${auth}`,
                },
                body: forwardFormData,
              });
              
              if (sendResponse.ok) {
                console.log("Clinic user reply sent to patient:", patient.email);
              } else {
                const errorText = await sendResponse.text();
                console.error("Failed to send reply to patient:", sendResponse.status, errorText);
              }
            } catch (sendError) {
              console.error("Error sending reply to patient:", sendError);
            }
          }
        }
        
        return NextResponse.json({ 
          ok: true, 
          message: "Clinic user reply processed and sent to patient",
          emailId: insertedOutbound?.id,
          patientId: targetPatientId
        });
      }
    }
    
    // If sender is a clinic user but NOT replying to a patient thread,
    // this is likely a CC'd copy of an outbound email - skip it
    // BUT only if the sender is NOT the patient (patient emails can also be clinic user emails)
    if (senderIsClinicUser && !senderIsThePatient) {
      console.log("Skipping CC'd copy - sender is a clinic user:", senderEmail);
      return NextResponse.json({ 
        ok: true, 
        message: "Skipped CC copy from clinic user",
        reason: "sender_is_clinic_user"
      });
    }
    
    // If no patient found, try to create one from the sender email OR log without patient
    if (!targetPatientId) {
      console.log("No patient found for email from:", from);
      console.log("Attempting to find or create patient record...");
      
      // Try to find existing patient by email one more time
      const { data: existingPatient } = await supabase
        .from("patients")
        .select("id")
        .ilike("email", senderEmail)
        .maybeSingle();
      
      if (existingPatient) {
        targetPatientId = existingPatient.id;
        console.log("Found patient by case-insensitive email match:", targetPatientId);
      } else {
        // Create a new patient from the sender info
        const senderName = from.match(/^([^<]+)/) ? from.match(/^([^<]+)/)?.[1]?.trim() : senderEmail.split("@")[0];
        const nameParts = senderName?.split(" ") || [senderEmail.split("@")[0]];
        
        const { data: newPatient, error: createError } = await supabase
          .from("patients")
          .insert({
            first_name: nameParts[0] || "Unknown",
            last_name: nameParts.slice(1).join(" ") || "",
            email: senderEmail,
            source: "inbound_email",
          })
          .select("id")
          .single();
        
        if (newPatient) {
          targetPatientId = newPatient.id;
          console.log("Created new patient from inbound email:", targetPatientId);
        } else {
          console.error("Failed to create patient:", createError);
          // Still log the email without a patient association
          console.log("Logging email without patient association");
        }
      }
    }
    
    // Log the inbound email in the database
    const { data: insertedEmail, error: insertError } = await supabase
      .from("emails")
      .insert({
        patient_id: targetPatientId || null,
        from_address: senderEmail,
        to_address: to,
        subject: subject,
        body: cleanedBody || rawBody,
        status: "sent", // Use 'sent' for now until 'received' enum value is added
        direction: "inbound",
        message_id: messageId || null,
        sent_at: timestamp ? new Date(parseInt(timestamp) * 1000).toISOString() : new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    
    if (insertError || !insertedEmail) {
      console.error("Error inserting reply email:", insertError);
      return NextResponse.json({ 
        error: "Failed to log reply",
        details: insertError?.message || "Unknown error"
      }, { status: 500 });
    }
    
    const newEmailId = insertedEmail.id as string;
    
    // Store attachments in Supabase Storage and create records
    let attachmentErrors: string[] = [];
    if (attachments.length > 0) {
      console.log(`Processing ${attachments.length} attachments for email ${newEmailId}`);
      
      for (const att of attachments) {
        try {
          // Create a safe file name and unique path
          const safeName = att.fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
          const ext = att.fileName.split(".").pop() || "bin";
          const storagePath = `inbound/${targetPatientId}/${newEmailId}/${Date.now()}-${safeName}`;
          
          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from("email-attachments")
            .upload(storagePath, att.data, {
              contentType: att.contentType,
              upsert: false,
            });
          
          if (uploadError) {
            console.error("Error uploading attachment:", att.fileName, uploadError);
            attachmentErrors.push(`Upload failed for ${att.fileName}: ${uploadError.message}`);
            continue;
          }
          
          // Create record in email_attachments table
          const { error: recordError } = await supabase
            .from("email_attachments")
            .insert({
              email_id: newEmailId,
              file_name: att.fileName,
              storage_path: storagePath,
              mime_type: att.contentType,
              file_size: att.size,
            });
          
          if (recordError) {
            console.error("Error creating attachment record:", att.fileName, recordError);
            attachmentErrors.push(`Record failed for ${att.fileName}: ${recordError.message}`);
          } else {
            console.log("Attachment saved successfully:", att.fileName);
          }
        } catch (attErr) {
          console.error("Unexpected error processing attachment:", att.fileName, attErr);
          attachmentErrors.push(`Error processing ${att.fileName}`);
        }
      }
    }
    
    console.log("Email reply logged successfully for patient:", targetPatientId);
    
    // Create notification and forward patient reply to clinic user
    // Priority order for finding original sender:
    // 1. sentByEmail (v:sent-by custom variable from original email)
    // 2. from_address from the specific email (if targetEmailId exists)
    // 3. from_address from most recent outbound email to this patient
    if (targetPatientId && senderEmail) {
      try {
        let originalEmailData: { id: string; from_address: string | null; subject: string | null } | null = null;
        let forwardToEmail: string | null = null;
        
        // Priority 1: Use sentByEmail from custom variable (most reliable)
        if (sentByEmail) {
          console.log("Using sent-by custom variable for forwarding:", sentByEmail);
          forwardToEmail = sentByEmail;
        }
        
        // Get the original email data for notification and subject
        if (targetEmailId) {
          const { data } = await supabase
            .from("emails")
            .select("id, from_address, subject")
            .eq("id", targetEmailId)
            .single();
          originalEmailData = data;
          // Priority 2: Use from_address from specific email if no sentByEmail
          if (!forwardToEmail && data?.from_address) {
            forwardToEmail = data.from_address;
            console.log("Using from_address from targetEmailId:", forwardToEmail);
          }
        }
        
        // Priority 3: Find most recent outbound email to this patient
        if (!originalEmailData || !forwardToEmail) {
          console.log("Finding most recent outbound email to patient:", targetPatientId);
          const { data } = await supabase
            .from("emails")
            .select("id, from_address, subject")
            .eq("patient_id", targetPatientId)
            .eq("direction", "outbound")
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (data) {
            if (!originalEmailData) originalEmailData = data;
            if (!forwardToEmail && data.from_address) {
              forwardToEmail = data.from_address;
              console.log("Using from_address from most recent outbound:", forwardToEmail);
            }
          }
        }
        
        console.log("Forward decision - forwardToEmail:", forwardToEmail, "originalEmailId:", originalEmailData?.id);
        
        if (forwardToEmail) {
          // Find the user who should receive this reply (case-insensitive)
          const { data: originalSenderUser } = await supabase
            .from("users")
            .select("id, email")
            .ilike("email", forwardToEmail)
            .maybeSingle();
          
          console.log("User lookup result for", forwardToEmail, ":", originalSenderUser ? `found user ${originalSenderUser.id}` : "not found");
          
          if (originalSenderUser) {
            // Create email reply notification
            if (originalEmailData) {
              await supabase
                .from("email_reply_notifications")
                .insert({
                  user_id: originalSenderUser.id,
                  patient_id: targetPatientId,
                  original_email_id: originalEmailData.id,
                  reply_email_id: newEmailId,
                  read_at: null,
                });
              console.log("Email reply notification created for user:", originalSenderUser.id);
            }
            
            // Forward the patient reply to the original sender's work email
            // Use the user's email from the users table (most accurate)
            const userEmail = originalSenderUser.email || forwardToEmail;
            console.log("Forwarding patient reply to:", userEmail);
            
            if (mailgunApiKey && mailgunDomain) {
              try {
                const forwardFormData = new FormData();
                
                // Send from our domain but set Reply-To with tracking
                // so replies go back through our system
                forwardFormData.append("from", `Patient Reply <noreply@${mailgunDomain}>`);
                forwardFormData.append("to", userEmail);
                forwardFormData.append("subject", subject || `Re: ${originalEmailData?.subject || 'No Subject'}`);
                
                // Format the forwarded email body
                const forwardedBody = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; margin-bottom: 16px;">
                      <strong style="color: #166534;">📧 Patient Reply Received</strong>
                      <p style="margin: 8px 0 0 0; color: #374151; font-size: 14px;">From: ${senderEmail}</p>
                    </div>
                    <div style="padding: 16px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
                      ${cleanedBody || rawBody}
                    </div>
                    <div style="margin-top: 16px; padding: 12px; background: #fefce8; border: 1px solid #fef08a; border-radius: 8px;">
                      <p style="margin: 0; color: #854d0e; font-size: 12px;">
                        <strong>💡 Tip:</strong> Reply to this email to respond to the patient. Your reply will be automatically recorded in the CRM.
                      </p>
                    </div>
                  </div>
                `;
                forwardFormData.append("html", forwardedBody);
                
                // Set Reply-To with tracking so replies come back to our system
                const replyToAddress = `reply+${newEmailId}+${targetPatientId}@${mailgunDomain}`;
                forwardFormData.append("h:Reply-To", replyToAddress);
                
                // Add custom headers to track the thread
                forwardFormData.append("v:email-id", newEmailId);
                forwardFormData.append("v:patient-id", targetPatientId);
                forwardFormData.append("v:forwarded-reply", "true");
                
                const auth = Buffer.from(`api:${mailgunApiKey}`).toString("base64");
                
                const forwardResponse = await fetch(`${mailgunApiBaseUrl}/v3/${mailgunDomain}/messages`, {
                  method: "POST",
                  headers: {
                    Authorization: `Basic ${auth}`,
                  },
                  body: forwardFormData,
                });
                
                if (forwardResponse.ok) {
                  console.log("Patient reply forwarded to:", userEmail);
                } else {
                  const errorText = await forwardResponse.text();
                  console.error("Failed to forward reply:", forwardResponse.status, errorText);
                }
              } catch (forwardError) {
                console.error("Error forwarding patient reply:", forwardError);
                // Don't fail the request if forwarding fails
              }
            }
          } else {
            console.log("Original sender is not a clinic user, skipping forward:", forwardToEmail);
          }
        } else {
          console.log("No outbound email found for patient, cannot forward reply");
        }
      } catch (notifError) {
        console.error("Failed to create email reply notification:", notifError);
        // Don't fail the request for notification errors
      }
    }
    
    return NextResponse.json({ 
      ok: true,
      message: "Reply logged successfully",
      patientId: targetPatientId,
      emailId: newEmailId,
      attachmentsProcessed: attachments.length,
      attachmentErrors: attachmentErrors.length > 0 ? attachmentErrors : undefined,
    });
    
  } catch (error) {
    console.error("Error processing email webhook:", error);
    return NextResponse.json(
      { 
        error: "Failed to process webhook",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// Also handle GET requests for webhook verification
export async function GET() {
  return NextResponse.json({ 
    status: "Email webhook endpoint active",
    instructions: "Configure Mailgun to forward incoming emails to this endpoint"
  });
}
