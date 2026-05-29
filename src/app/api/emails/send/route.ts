import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, isEmailConfigured, sanitizeTelLinks, addTrackingPixel, type EmailAttachment } from "@/lib/email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";
const replyDomain = process.env.EMAIL_REPLY_DOMAIN || "maisontoa.com";

type EmailAttachmentRow = {
  id: string;
  email_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
};

type InlineAttachment = {
  filename: string;
  content: string;
  encoding?: string;
  contentType?: string;
};

export async function POST(request: Request) {
  try {
    // Runtime check for required environment variables
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 503 },
      );
    }

    const { to, subject, html, fromUserEmail, fromUserName, emailId, patientId, inlineAttachments } = (await request.json()) as {
      to?: string;
      subject?: string;
      html?: string;
      fromUserEmail?: string | null;
      fromUserName?: string | null;
      emailId?: string | null;
      patientId?: string | null;
      inlineAttachments?: InlineAttachment[];
    };

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, html" },
        { status: 400 },
      );
    }

    const trimmedTo = to.trim();
    const trimmedSubject = subject.trim();
    const trimmedHtml = html.trim();

    if (!trimmedTo || !trimmedSubject || !trimmedHtml) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, html" },
        { status: 400 },
      );
    }

    // Determine sender info
    let fromAddress: string | undefined;
    let fromName: string | undefined;
    
    if (fromUserEmail && fromUserEmail.trim().length > 0) {
      fromAddress = fromUserEmail.trim();
      if (fromUserName && fromUserName.trim().length > 0) {
        fromName = fromUserName.trim();
      } else {
        const emailPrefix = fromUserEmail.split("@")[0];
        fromName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
      }
    }

    // Sanitize tel: links for iPhone compatibility
    let processedHtml = sanitizeTelLinks(trimmedHtml);
    
    // Add tracking pixel if emailId is provided
    if (emailId) {
      processedHtml = addTrackingPixel(processedHtml, emailId, appUrl);
    }

    // Create reply-to address for tracking
    let replyToAddress = `clinic@${replyDomain}`;
    if (emailId && patientId) {
      replyToAddress = `reply+${emailId}+${patientId}@${replyDomain}`;
    } else if (emailId) {
      replyToAddress = `reply+${emailId}@${replyDomain}`;
    }

    // Collect attachments
    const attachments: EmailAttachment[] = [];

    // Handle inline attachments (base64 encoded files passed directly in request)
    if (inlineAttachments && inlineAttachments.length > 0) {
      for (const att of inlineAttachments) {
        try {
          attachments.push({
            filename: att.filename,
            content: att.content,
            contentType: att.contentType || "application/octet-stream",
          });
        } catch (attError) {
          console.error("Error processing inline attachment:", att.filename, attError);
        }
      }
    }

    // Fetch and attach files from Supabase Storage if emailId is provided
    if (emailId && supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        const { data: dbAttachments, error: attachmentsError } = await supabase
          .from("email_attachments")
          .select("id, email_id, file_name, storage_path, mime_type, file_size")
          .eq("email_id", emailId);

        if (!attachmentsError && dbAttachments && dbAttachments.length > 0) {
          for (const att of dbAttachments as EmailAttachmentRow[]) {
            try {
              const { data: fileData, error: downloadError } = await supabase.storage
                .from("email-attachments")
                .download(att.storage_path);

              if (!downloadError && fileData) {
                // Convert Blob to base64
                const arrayBuffer = await fileData.arrayBuffer();
                const base64Content = Buffer.from(arrayBuffer).toString("base64");
                attachments.push({
                  filename: att.file_name,
                  content: base64Content,
                  contentType: att.mime_type || "application/octet-stream",
                });
              } else {
                console.error("Error downloading attachment:", att.file_name, downloadError);
              }
            } catch (dlError) {
              console.error("Error processing attachment:", att.file_name, dlError);
            }
          }
        }
      } catch (attError) {
        console.error("Error fetching attachments:", attError);
      }
    }

    // If patientId is provided but no emailId, create an email record in CRM
    let createdEmailId: string | null = null;
    if (patientId && !emailId && supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const nowIso = new Date().toISOString();
        
        const { data: insertedEmail, error: insertError } = await supabase
          .from("emails")
          .insert({
            patient_id: patientId,
            to_address: trimmedTo,
            from_address: fromAddress || process.env.EMAIL_FROM_ADDRESS || "info@mail.maisontoa.com",
            subject: trimmedSubject,
            body: trimmedHtml,
            direction: "outbound",
            status: "sent",
            sent_at: nowIso,
          })
          .select("id")
          .single();

        if (!insertError && insertedEmail) {
          createdEmailId = insertedEmail.id;
          // Add tracking pixel with the new email ID
          if (createdEmailId) {
            processedHtml = addTrackingPixel(processedHtml, createdEmailId, appUrl);
          }
        } else {
          console.error("Error creating email record:", insertError);
        }
      } catch (emailRecordError) {
        console.error("Error creating email record:", emailRecordError);
      }
    }

    // Send email via Resend
    const result = await sendEmail({
      to: trimmedTo,
      subject: trimmedSubject,
      html: processedHtml,
      from: fromAddress,
      fromName,
      replyTo: replyToAddress,
      attachments: attachments.length > 0 ? attachments : undefined,
      tags: [
        ...(emailId ? [{ name: "email_id", value: emailId }] : []),
        ...(patientId ? [{ name: "patient_id", value: patientId }] : []),
        ...(fromUserEmail ? [{ name: "sent_by", value: fromUserEmail }] : []),
      ],
    });

    if (!result.success) {
      // If we created an email record, mark it as failed
      if (createdEmailId && supabaseUrl && supabaseServiceKey) {
        try {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          await supabase
            .from("emails")
            .update({ status: "failed" })
            .eq("id", createdEmailId);
        } catch (updateError) {
          console.error("Error updating email status to failed:", updateError);
        }
      }
      
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 502 },
      );
    }

    return NextResponse.json({ 
      ok: true, 
      messageId: result.messageId, 
      emailId: createdEmailId || emailId 
    });
  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 },
    );
  }
}
