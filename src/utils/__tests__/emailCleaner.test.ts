import { describe, it, expect } from "vitest";
import {
  stripEmailSignature,
  extractReplyContent,
  sanitizeEmailHtml,
} from "../emailCleaner";

describe("stripEmailSignature", () => {
  describe("HTML mode", () => {
    it("returns empty string for empty input", () => {
      expect(stripEmailSignature("")).toBe("");
      expect(stripEmailSignature("", true)).toBe("");
    });

    it("removes Gmail quoted reply sections", () => {
      const html =
        '<p>Hello</p><div class="gmail_quote">On Jan 1, someone wrote: old text</div>';
      const result = stripEmailSignature(html, true);
      expect(result).toContain("Hello");
      expect(result).not.toContain("gmail_quote");
    });

    it("removes blockquote tags", () => {
      const html =
        "<p>Reply here</p><blockquote>Previous message</blockquote>";
      const result = stripEmailSignature(html, true);
      expect(result).toContain("Reply here");
      expect(result).not.toContain("Previous message");
    });

    it('removes "On ... wrote:" patterns', () => {
      const html =
        "<p>Thanks!</p>On January 5, 2024, Alice wrote: some quoted text";
      const result = stripEmailSignature(html, true);
      expect(result).toContain("Thanks!");
      expect(result).not.toContain("Alice wrote");
    });

    it("removes confidentiality disclaimers", () => {
      const html =
        "<p>Content</p>CONFIDENTIAL: This message is prohibited to share.";
      const result = stripEmailSignature(html, true);
      expect(result).not.toContain("CONFIDENTIAL");
    });

    it("removes long tracking URLs", () => {
      const longUrl = "https://example.com/" + "a".repeat(101);
      const html = `<p>Hi</p><a href="${longUrl}">link</a>`;
      const result = stripEmailSignature(html, true);
      expect(result).toContain("[long URL removed]");
    });

    it("collapses excessive line breaks", () => {
      const html = "<p>A</p><br><br><br><br><br><p>B</p>";
      const result = stripEmailSignature(html, true);
      expect(result).not.toMatch(/(<br\s*\/?>\s*){3,}/);
    });
  });

  describe("plain text mode", () => {
    it("removes quoted lines starting with >", () => {
      const text = "My reply\n> Previous message\n> More quote";
      const result = stripEmailSignature(text, false);
      expect(result).toContain("My reply");
      expect(result).not.toContain("Previous message");
    });

    it("removes signature separator and everything after", () => {
      const text = "My reply\n-- \nJohn Doe\nCEO, Company";
      const result = stripEmailSignature(text, false);
      expect(result).toContain("My reply");
      expect(result).not.toContain("John Doe");
      expect(result).not.toContain("CEO");
    });

    it("removes disclaimer text", () => {
      const text =
        "Content\nThis email and any attachments are confidential.";
      const result = stripEmailSignature(text, false);
      expect(result).not.toContain("confidential");
    });

    it("collapses excessive newlines", () => {
      const text = "Line 1\n\n\n\n\nLine 2";
      const result = stripEmailSignature(text, false);
      expect(result).not.toMatch(/\n{3,}/);
    });
  });
});

describe("extractReplyContent", () => {
  describe("HTML mode", () => {
    it("returns empty for empty input", () => {
      expect(extractReplyContent("")).toBe("");
    });

    it("extracts content before Gmail quote", () => {
      const html =
        '<p>Thanks for the info!</p><div class="gmail_quote">Quoted text</div>';
      const result = extractReplyContent(html, true);
      expect(result).toContain("Thanks for the info!");
      expect(result).not.toContain("Quoted text");
    });

    it("removes trailing empty tags", () => {
      const html = "<p>Content</p><br><br>";
      const result = extractReplyContent(html, true);
      expect(result).not.toMatch(/<br\s*\/?>\s*$/);
    });
  });

  describe("plain text mode", () => {
    it("stops at quote indicator >", () => {
      const text = "My reply\n> old message";
      const result = extractReplyContent(text, false);
      expect(result).toBe("My reply");
    });

    it("stops at signature separator", () => {
      const text = "My reply\n-- \nSignature";
      const result = extractReplyContent(text, false);
      expect(result).toBe("My reply");
    });

    it("strips 'On ... wrote:' line via signature removal", () => {
      const text = "Thanks!\nOn Jan 1, Alice wrote:\nold content";
      const result = extractReplyContent(text, false);
      // stripEmailSignature removes the "On...wrote:" line first;
      // extractReplyContent then sees "Thanks!" and "old content" as separate lines
      expect(result).toContain("Thanks!");
      expect(result).not.toContain("Alice wrote");
    });

    it("stops at Outlook-style From: Sent: pattern", () => {
      const text = "My reply\nFrom: Alice Sent: Jan 1";
      const result = extractReplyContent(text, false);
      expect(result).toBe("My reply");
    });

    it("stops at underscore separator", () => {
      const text = "My reply\n__________\nOld thread";
      const result = extractReplyContent(text, false);
      expect(result).toBe("My reply");
    });
  });
});

describe("sanitizeEmailHtml", () => {
  it("returns empty for empty input", () => {
    expect(sanitizeEmailHtml("")).toBe("");
  });

  it("removes script tags", () => {
    const html = '<p>Hi</p><script>alert("xss")</script>';
    const result = sanitizeEmailHtml(html);
    expect(result).toContain("<p>Hi</p>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  it("removes inline event handlers", () => {
    const html = '<img src="x" onerror="alert(1)">';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert");
  });

  it("neutralizes javascript: protocol in href", () => {
    const html = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("javascript:");
    expect(result).toContain('href="#"');
  });

  it("preserves safe HTML content", () => {
    const html =
      '<p style="color:red">Hello <strong>World</strong></p>';
    const result = sanitizeEmailHtml(html);
    expect(result).toBe(html);
  });
});
