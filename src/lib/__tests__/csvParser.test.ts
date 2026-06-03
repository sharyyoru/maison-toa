import { describe, it, expect } from "vitest";
import {
  detectServiceFromFilename,
  detectServiceFromForm,
  parseLeadsCSV,
  isValidEmail,
  generateLeadsSummary,
} from "../csvParser";

describe("detectServiceFromFilename", () => {
  it("detects Breast Augmentation", () => {
    expect(detectServiceFromFilename("leads BREAST AUGMENT 2 January.csv")).toBe(
      "Breast Augmentation"
    );
  });

  it("detects Face Fillers", () => {
    expect(
      detectServiceFromFilename("Lead FACE FILLERS Geneva 2 January.csv")
    ).toBe("Face Fillers");
  });

  it("detects Liposuction", () => {
    expect(detectServiceFromFilename("liposuction-leads.csv")).toBe(
      "Liposuction"
    );
  });

  it("detects Rhinoplasty", () => {
    expect(detectServiceFromFilename("rhinoplasty_jan.csv")).toBe(
      "Rhinoplasty"
    );
  });

  it("detects Botox / Botulinum toxin", () => {
    expect(detectServiceFromFilename("botox-leads-2024.csv")).toBe(
      "Botulinum toxin"
    );
  });

  it("detects Hyperbaric Oxygen Therapy", () => {
    expect(detectServiceFromFilename("HBOT-geneva.csv")).toBe(
      "Hyperbaric Oxygen Therapy"
    );
  });

  it("detects HIFU", () => {
    expect(detectServiceFromFilename("hifu leads.csv")).toBe("HIFU");
  });

  it("returns null for unrecognized filenames", () => {
    expect(detectServiceFromFilename("random-data.csv")).toBeNull();
    expect(detectServiceFromFilename("")).toBeNull();
  });
});

describe("detectServiceFromForm", () => {
  it("detects service from form value", () => {
    expect(
      detectServiceFromForm("FACE FILLERS EN - cities Geneva|Montreux")
    ).toBe("Face Fillers");
    expect(detectServiceFromForm("Liposuccion FR+cities!")).toBe("Liposuction");
    expect(detectServiceFromForm("TRAITEMENT DE RIDES FR")).toBe(
      "Wrinkle Treatment"
    );
    expect(
      detectServiceFromForm("Hyperbaric Oxygen Therapy (HBOT)")
    ).toBe("Hyperbaric Oxygen Therapy");
    expect(detectServiceFromForm("longevity")).toBe("Longevity");
  });

  it("returns null for empty/whitespace input", () => {
    expect(detectServiceFromForm("")).toBeNull();
    expect(detectServiceFromForm("   ")).toBeNull();
  });

  it("ignores Black Friday promo forms", () => {
    expect(detectServiceFromForm("Black Friday")).toBeNull();
  });

  it("ignores untitled forms", () => {
    expect(detectServiceFromForm("Untitled form")).toBeNull();
  });

  it("returns raw form value when no pattern matches", () => {
    expect(detectServiceFromForm("Custom service XYZ")).toBe(
      "Custom service XYZ"
    );
  });
});

describe("isValidEmail", () => {
  it("returns true for valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user.name@domain.co")).toBe(true);
    expect(isValidEmail("a@b.c")).toBe(true);
  });

  it("returns false for invalid emails", () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("@domain.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("user @domain.com")).toBe(false);
  });
});

describe("parseLeadsCSV", () => {
  it("parses a simple CSV with standard headers", () => {
    const csv = [
      "Name,Email,Phone",
      "Alice Smith,alice@example.com,0791234567",
      "Bob Jones,bob@test.com,0799876543",
    ].join("\n");

    const leads = parseLeadsCSV(csv, "test.csv");
    expect(leads).toHaveLength(2);
    expect(leads[0].name).toBe("Alice Smith");
    expect(leads[0].email).toBe("alice@example.com");
    expect(leads[0].phones.primary).toBe("0791234567");
    expect(leads[1].name).toBe("Bob Jones");
  });

  it("maps multilingual column headers", () => {
    const csv = [
      "Nom,Téléphone,E-mail",
      "Jean Dupont,0791234567,jean@test.fr",
    ].join("\n");

    const leads = parseLeadsCSV(csv, "test.csv");
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("Jean Dupont");
    expect(leads[0].email).toBe("jean@test.fr");
  });

  it("throws for empty CSV", () => {
    expect(() => parseLeadsCSV("", "test.csv")).toThrow();
  });

  it("throws for header-only CSV", () => {
    expect(() => parseLeadsCSV("Name,Email", "test.csv")).toThrow(
      "empty or has no data rows"
    );
  });

  it("throws if Name column is missing", () => {
    const csv = ["Email,Phone", "a@b.com,0791234567"].join("\n");
    expect(() => parseLeadsCSV(csv, "test.csv")).toThrow("Missing required column: Name");
  });

  it("throws if neither Email nor Phone column exists", () => {
    const csv = ["Name,Source", "Alice,Google"].join("\n");
    expect(() => parseLeadsCSV(csv, "test.csv")).toThrow(
      "Missing contact information"
    );
  });

  it("detects service from filename", () => {
    const csv = ["Name,Email", "Alice,a@b.com"].join("\n");
    const leads = parseLeadsCSV(csv, "botox-leads.csv");
    expect(leads[0].detectedService).toBe("Botulinum toxin");
  });

  it("detects service from Form column per-lead", () => {
    const csv = [
      "Name,Email,Form",
      "Alice,a@b.com,FACE FILLERS EN - Geneva",
    ].join("\n");
    const leads = parseLeadsCSV(csv, "generic.csv");
    expect(leads[0].detectedService).toBe("Face Fillers");
  });

  it("handles quoted CSV values with commas", () => {
    const csv = [
      "Name,Email,Phone",
      '"Smith, Alice",alice@example.com,0791234567',
    ].join("\n");
    const leads = parseLeadsCSV(csv, "test.csv");
    expect(leads[0].name).toBe("Smith, Alice");
  });

  it("adds validation issues for missing name", () => {
    const csv = ["Name,Email", ",test@test.com"].join("\n");
    const leads = parseLeadsCSV(csv, "test.csv");
    expect(leads[0].validationIssues).toContain("Missing name");
  });

  it("defaults stage to Intake and owner to Unassigned", () => {
    const csv = ["Name,Email", "Alice,a@b.com"].join("\n");
    const leads = parseLeadsCSV(csv, "test.csv");
    expect(leads[0].stage).toBe("Intake");
    expect(leads[0].owner).toBe("Unassigned");
  });
});

describe("generateLeadsSummary", () => {
  it("calculates summary stats", () => {
    const csv = [
      "Name,Email,Phone",
      "Alice,alice@test.com,0791234567",
      "Bob,,",
      "Charlie,invalid,0792345678",
    ].join("\n");

    const leads = parseLeadsCSV(csv, "test.csv");
    const summary = generateLeadsSummary(leads);

    expect(summary.total).toBe(3);
    expect(summary.withoutPhone).toBeGreaterThanOrEqual(0);
    expect(typeof summary.serviceBreakdown).toBe("object");
  });

  it("handles empty lead list", () => {
    const summary = generateLeadsSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.valid).toBe(0);
  });
});
