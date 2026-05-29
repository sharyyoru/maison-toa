/**
 * Centralized Email Service using Resend
 * 
 * Resend is a modern email API designed for developers.
 * Key benefits:
 * - Simple REST API
 * - Built-in deliverability
 * - React Email support
 * - Detailed analytics
 * 
 * Environment variables:
 * - RESEND_API_KEY: Your Resend API key
 * - EMAIL_FROM_ADDRESS: Default from address (must be verified domain)
 * - EMAIL_FROM_NAME: Default from name
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_API_URL = "https://api.resend.com/emails";

// Default sender configuration
const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || "info@mail.maisontoa.com";
const DEFAULT_FROM_NAME = process.env.EMAIL_FROM_NAME || "Maison Toa";

export type EmailAttachment = {
  filename: string;
  content: string; // Base64 encoded content
  contentType?: string;
};

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  tags?: { name: string; value: string }[];
  scheduledAt?: Date; // ISO 8601 format for scheduled delivery
};

export type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  scheduled?: boolean;
};

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY;
}

/**
 * Send an email using Resend
 * 
 * @example
 * ```typescript
 * const result = await sendEmail({
 *   to: "patient@example.com",
 *   subject: "Appointment Confirmation",
 *   html: "<h1>Your appointment is confirmed</h1>",
 * });
 * ```
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) {
    console.warn("[Email] Resend not configured (missing RESEND_API_KEY), skipping email send");
    return { success: false, error: "Email service not configured" };
  }

  const {
    to,
    subject,
    html,
    from,
    fromName,
    replyTo,
    attachments,
    tags,
    scheduledAt,
  } = options;

  // Build the from address
  const fromAddress = from || DEFAULT_FROM_EMAIL;
  const senderName = fromName || DEFAULT_FROM_NAME;
  const fromField = `${senderName} <${fromAddress}>`;

  // Build request body
  const body: Record<string, unknown> = {
    from: fromField,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };

  if (replyTo) {
    body.reply_to = replyTo;
  }

  if (attachments && attachments.length > 0) {
    body.attachments = attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
      content_type: att.contentType || "application/octet-stream",
    }));
  }

  if (tags && tags.length > 0) {
    body.tags = tags;
  }

  // Resend supports scheduling up to 72 hours in advance
  if (scheduledAt) {
    const now = Date.now();
    const scheduleTime = scheduledAt.getTime();
    const maxScheduleTime = now + 72 * 60 * 60 * 1000; // 72 hours

    if (scheduleTime > now && scheduleTime <= maxScheduleTime) {
      body.scheduled_at = scheduledAt.toISOString();
    } else if (scheduleTime > maxScheduleTime) {
      // Beyond 72 hours - will be handled by cron job
      console.log(`[Email] Scheduled for ${scheduledAt.toISOString()} is beyond Resend's 72-hour limit`);
      return { success: false, scheduled: true, error: "Beyond 72-hour limit, stored for cron job" };
    }
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[Email] Resend API error:", response.status, data);
      return {
        success: false,
        error: data.message || `Resend error: ${response.status}`,
      };
    }

    console.log("[Email] Sent successfully:", { to, subject, messageId: data.id });
    return {
      success: true,
      messageId: data.id,
      scheduled: !!scheduledAt,
    };
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send a batch of emails (up to 100 at a time)
 * Useful for marketing campaigns
 */
export async function sendBatchEmails(
  emails: SendEmailOptions[]
): Promise<{ success: boolean; results: SendEmailResult[]; sent: number; failed: number }> {
  if (!RESEND_API_KEY) {
    return {
      success: false,
      results: emails.map(() => ({ success: false, error: "Email service not configured" })),
      sent: 0,
      failed: emails.length,
    };
  }

  // Resend batch endpoint supports up to 100 emails
  const BATCH_SIZE = 100;
  const results: SendEmailResult[] = [];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    
    // For batches, we send individually to track results per recipient
    // Resend's batch API doesn't support per-email tracking as well
    const batchPromises = batch.map((email) => sendEmail(email));
    const batchResults = await Promise.all(batchPromises);
    
    for (const result of batchResults) {
      results.push(result);
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < emails.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return {
    success: failed === 0,
    results,
    sent,
    failed,
  };
}

/**
 * Utility to add tracking pixel to HTML email
 */
export function addTrackingPixel(html: string, emailId: string, appUrl: string): string {
  const trackingPixel = `<img src="${appUrl}/api/emails/track?id=${emailId}" width="1" height="1" style="display:none;visibility:hidden;width:1px;height:1px;opacity:0;" alt="" />`;
  
  if (html.includes("</body>")) {
    return html.replace("</body>", `${trackingPixel}</body>`);
  }
  return `${html}${trackingPixel}`;
}

/**
 * Sanitize tel: links for iPhone compatibility
 */
export function sanitizeTelLinks(html: string): string {
  // Decode any URL-encoded tel: protocols
  let result = html.replace(/href\s*=\s*(["'])tel%3A/gi, 'href=$1tel:');
  result = result.replace(/href\s*=\s*(["'])tel:%2B/gi, 'href=$1tel:+');
  
  // Clean phone numbers for iPhone compatibility
  result = result.replace(
    /href\s*=\s*["']tel:([^"']+)["']/gi,
    (_match, phoneNumber) => {
      let decoded = phoneNumber;
      try {
        decoded = decodeURIComponent(phoneNumber);
      } catch {
        // If decoding fails, use original
      }
      decoded = decoded
        .replace(/&nbsp;/gi, '')
        .replace(/&#160;/g, '')
        .replace(/&amp;/gi, '&')
        .replace(/&plus;/gi, '+')
        .replace(/\u00A0/g, '');
      
      const cleaned = decoded.replace(/[^0-9+]/g, '');
      return `href="tel:${cleaned}"`;
    }
  );
  
  return result;
}
