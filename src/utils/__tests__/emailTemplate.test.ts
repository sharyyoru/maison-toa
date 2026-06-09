import { describe, it, expect } from "vitest";
import { LOGO_URL, brandedEmail, infoRow, infoTable } from "../emailTemplate";

describe("LOGO_URL", () => {
  it("points to a valid CDN URL", () => {
    expect(LOGO_URL).toMatch(/^https:\/\/cdn\.jsdelivr\.net\//);
    expect(LOGO_URL).toContain("maisontoa-logo.png");
  });
});

describe("brandedEmail", () => {
  it("wraps body in HTML document structure", () => {
    const result = brandedEmail("<p>Hello</p>");
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<html");
    expect(result).toContain("</html>");
  });

  it("includes the logo", () => {
    const result = brandedEmail("<p>Test</p>");
    expect(result).toContain(LOGO_URL);
    expect(result).toContain('alt="Maison Tóā"');
  });

  it("includes body content", () => {
    const body = "<p>Your appointment is confirmed.</p>";
    const result = brandedEmail(body);
    expect(result).toContain(body);
  });

  it("includes signature with address", () => {
    const result = brandedEmail("<p>Hi</p>");
    expect(result).toContain("Maison Tóā");
    expect(result).toContain("Voie du Chariot 6");
    expect(result).toContain("1003 Lausanne");
  });

  it("sets French language", () => {
    const result = brandedEmail("<p>Bonjour</p>");
    expect(result).toContain('lang="fr"');
  });

  it("includes charset meta tag", () => {
    const result = brandedEmail("<p>Test</p>");
    expect(result).toContain('charset="utf-8"');
  });
});

describe("infoRow", () => {
  it("renders label and value in table row", () => {
    const result = infoRow("Date", "15 June 2024");
    expect(result).toContain("<tr>");
    expect(result).toContain("</tr>");
    expect(result).toContain("Date");
    expect(result).toContain("15 June 2024");
  });

  it("applies uppercase styling to label", () => {
    const result = infoRow("Service", "Botox");
    expect(result).toContain("text-transform: uppercase");
  });
});

describe("infoTable", () => {
  it("wraps rows in a table element", () => {
    const rows = infoRow("A", "1") + infoRow("B", "2");
    const result = infoTable(rows);
    expect(result).toContain("<table");
    expect(result).toContain("</table>");
    expect(result).toContain("A");
    expect(result).toContain("B");
  });

  it("uses border-collapse styling", () => {
    const result = infoTable(infoRow("X", "Y"));
    expect(result).toContain("border-collapse: collapse");
  });
});
