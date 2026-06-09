import { describe, it, expect } from "vitest";
import {
  formatSwissPhone,
  isValidSwissPhone,
  formatSwissPhoneDisplay,
  extractLeadPhones,
  getBestPhone,
} from "../phoneFormatter";

describe("formatSwissPhone", () => {
  it("returns null for null/undefined/empty input", () => {
    expect(formatSwissPhone(null)).toBeNull();
    expect(formatSwissPhone(undefined)).toBeNull();
    expect(formatSwissPhone("")).toBeNull();
    expect(formatSwissPhone("   ")).toBeNull();
  });

  it("formats +41 with spaces", () => {
    expect(formatSwissPhone("+41 79 395 31 37")).toBe("+41793953137");
  });

  it("formats +41 without spaces", () => {
    expect(formatSwissPhone("+41793953137")).toBe("+41793953137");
  });

  it("formats local number with leading 0", () => {
    expect(formatSwissPhone("0793953137")).toBe("+41793953137");
  });

  it("formats local number with spaces", () => {
    expect(formatSwissPhone("079 395 31 37")).toBe("+41793953137");
  });

  it("handles +41 with extra leading 0", () => {
    expect(formatSwissPhone("+410793953137")).toBe("+41793953137");
  });

  it("handles 0041 international format", () => {
    expect(formatSwissPhone("0041793953137")).toBe("+41793953137");
  });

  it("handles bare 41 prefix without +", () => {
    expect(formatSwissPhone("41793953137")).toBe("+41793953137");
  });

  it("handles 9 bare digits (no prefix)", () => {
    expect(formatSwissPhone("793953137")).toBe("+41793953137");
  });

  it("handles +33 French number converting to Swiss", () => {
    expect(formatSwissPhone("+33793953137")).toBe("+41793953137");
  });

  it("strips dashes and parentheses", () => {
    expect(formatSwissPhone("+41-(79)-395-31-37")).toBe("+41793953137");
  });

  it("strips dots and apostrophes", () => {
    expect(formatSwissPhone("+41.79.395.31.37")).toBe("+41793953137");
    expect(formatSwissPhone("079'395'31'37")).toBe("+41793953137");
  });

  it("returns null for non-matching formats", () => {
    expect(formatSwissPhone("+1234")).toBeNull();
    expect(formatSwissPhone("abc")).toBeNull();
  });
});

describe("isValidSwissPhone", () => {
  it("returns true for valid Swiss format", () => {
    expect(isValidSwissPhone("+41793953137")).toBe(true);
    expect(isValidSwissPhone("+41812345678")).toBe(true);
  });

  it("returns false for invalid formats", () => {
    expect(isValidSwissPhone(null)).toBe(false);
    expect(isValidSwissPhone("")).toBe(false);
    expect(isValidSwissPhone("0793953137")).toBe(false);
    expect(isValidSwissPhone("+4179395313")).toBe(false); // too short
    expect(isValidSwissPhone("+417939531370")).toBe(false); // too long
  });
});

describe("formatSwissPhoneDisplay", () => {
  it("formats valid Swiss number with spaces", () => {
    expect(formatSwissPhoneDisplay("+41793953137")).toBe("+41 79 395 31 37");
  });

  it("returns empty string for null", () => {
    expect(formatSwissPhoneDisplay(null)).toBe("");
  });

  it("returns original for invalid format", () => {
    expect(formatSwissPhoneDisplay("0793953137")).toBe("0793953137");
  });
});

describe("extractLeadPhones", () => {
  it("extracts all unique phone numbers from lead data", () => {
    const result = extractLeadPhones("0791111111", "0792222222", "0793333333");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      phone: "+41791111111",
      source: "primary",
      original: "0791111111",
    });
    expect(result[1]).toEqual({
      phone: "+41792222222",
      source: "secondary",
      original: "0792222222",
    });
    expect(result[2]).toEqual({
      phone: "+41793333333",
      source: "whatsapp",
      original: "0793333333",
    });
  });

  it("deduplicates identical numbers", () => {
    const result = extractLeadPhones("0791111111", "0791111111", null);
    expect(result).toHaveLength(1);
  });

  it("handles all nulls", () => {
    const result = extractLeadPhones(null, null, null);
    expect(result).toHaveLength(0);
  });

  it("skips invalid phone numbers", () => {
    const result = extractLeadPhones("abc", "0791111111", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("secondary");
  });
});

describe("getBestPhone", () => {
  it("prefers whatsapp over primary and secondary", () => {
    expect(getBestPhone("0791111111", "0792222222", "0793333333")).toBe(
      "+41793333333"
    );
  });

  it("falls back to primary if no whatsapp", () => {
    expect(getBestPhone("0791111111", "0792222222", null)).toBe(
      "+41791111111"
    );
  });

  it("falls back to secondary if no whatsapp or primary", () => {
    expect(getBestPhone(null, "0792222222", null)).toBe("+41792222222");
  });

  it("returns null when all are null", () => {
    expect(getBestPhone(null, null, null)).toBeNull();
  });
});
