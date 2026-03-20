/**
 * Utility functions to clean and format email content
 * Removes signatures, quoted text, and other email jargon
 */

/**
 * Strips email signatures and quoted text from email body
 * @param emailBody - The full email body (HTML or plain text)
 * @param isHtml - Whether the email is HTML formatted
 * @returns Cleaned email content
 */
export function stripEmailSignature(emailBody: string, isHtml: boolean = true): string {
  if (!emailBody) return "";

  let text = emailBody;

  // Convert HTML to text for signature detection if needed
  if (isHtml) {
    // Remove common email signature patterns in HTML
    
    // Remove quoted reply sections (Gmail, Outlook, etc.)
    text = text.replace(/<div class="gmail_quote">[\s\S]*?<\/div>/g, "");
    text = text.replace(/<blockquote[\s\S]*?<\/blockquote>/g, "");
    text = text.replace(/<div class="moz-cite-prefix">[\s\S]*?<\/div>/g, "");
    
    // Remove "On [date], [person] wrote:" patterns
    text = text.replace(/On .+?, .+? wrote:[\s\S]*$/g, "");
    text = text.replace(/On .+? at .+?, .+? wrote:[\s\S]*$/g, "");
    
    // Remove common signature separators
    text = text.replace(/(<br\s*\/?>\s*){2,}--\s*(<br\s*\/?>\s*)[\s\S]*$/g, "");
    text = text.replace(/<div>\s*--\s*<\/div>[\s\S]*$/g, "");
    
    // Remove disclaimer text (common in corporate emails)
    text = text.replace(/The content of this electronic communication[\s\S]*$/g, "");
    text = text.replace(/This email and any attachments[\s\S]*$/g, "");
    text = text.replace(/CONFIDENTIAL[\s\S]*?prohibited[\s\S]*$/g, "");
    
    // Remove long URLs and tracking links
    text = text.replace(/https?:\/\/[^\s<>"]+api\.whatsapp\.com[^\s<>"]+/g, "");
    text = text.replace(/https?:\/\/[^\s<>"]{100,}/g, "[long URL removed]");
    
    // Remove excessive line breaks
    text = text.replace(/(<br\s*\/?>\s*){3,}/g, "<br><br>");
    text = text.replace(/(<p>\s*<\/p>\s*){2,}/g, "<p></p>");
    
  } else {
    // Plain text cleaning
    
    // Remove quoted reply sections
    text = text.replace(/^>.*$/gm, "");
    text = text.replace(/^\s*On .+?, .+? wrote:.*$/gm, "");
    
    // Remove signature separator and everything after
    const sigIndex = text.search(/\n--\s*\n/);
    if (sigIndex !== -1) {
      text = text.substring(0, sigIndex);
    }
    
    // Remove disclaimer text
    text = text.replace(/The content of this electronic communication[\s\S]*$/g, "");
    text = text.replace(/This email and any attachments[\s\S]*$/g, "");
    text = text.replace(/CONFIDENTIAL[\s\S]*?prohibited[\s\S]*$/g, "");
    
    // Remove excessive line breaks
    text = text.replace(/\n{3,}/g, "\n\n");
  }

  return text.trim();
}

/**
 * Extracts the actual reply content from an email by removing signatures and quoted text
 * This is more aggressive and tries to get just what the person typed
 */
export function extractReplyContent(emailBody: string, isHtml: boolean = true): string {
  if (!emailBody) return "";

  let content = stripEmailSignature(emailBody, isHtml);

  if (isHtml) {
    // Try to find the first line of actual content before any quoted section
    const quotePatterns = [
      /<div class="gmail_quote">/,
      /<blockquote/,
      /On .+? wrote:/,
      /<div>\s*--\s*<\/div>/,
    ];

    for (const pattern of quotePatterns) {
      const match = content.search(pattern);
      if (match !== -1) {
        content = content.substring(0, match);
      }
    }

    // Remove empty tags at the end
    content = content.replace(/(<br\s*\/?>\s*)+$/, "");
    content = content.replace(/(<p>\s*<\/p>\s*)+$/, "");
    
  } else {
    // For plain text, split by common quote indicators
    const lines = content.split("\n");
    const cleanLines: string[] = [];
    
    for (const line of lines) {
      // Stop at first quote or signature line
      if (
        line.startsWith(">") ||
        line.match(/^On .+? wrote:/) ||
        line.match(/^--\s*$/) ||
        line.match(/^_{5,}/) ||
        line.match(/^From:.*Sent:/)
      ) {
        break;
      }
      cleanLines.push(line);
    }
    
    content = cleanLines.join("\n");
  }

  return content.trim();
}

/**
 * Safely renders HTML email content by removing potentially dangerous scripts
 * while preserving formatting
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return "";

  let sanitized = html;

  // Remove script tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, "");

  // Remove javascript: protocol
  sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');

  return sanitized;
}
