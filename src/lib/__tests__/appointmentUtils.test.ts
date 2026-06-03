import { describe, it, expect } from "vitest";
import {
  getAppointmentNotes,
  getAppointmentTitle,
  getAppointmentDisplayName,
  getAppointmentDoctor,
} from "../appointmentUtils";

describe("getAppointmentNotes", () => {
  it("returns dedicated notes column when present", () => {
    expect(
      getAppointmentNotes({ reason: "Something", notes: "My notes" })
    ).toBe("My notes");
  });

  it("extracts notes from legacy reason field", () => {
    expect(
      getAppointmentNotes({
        reason: "Alice - Botox [Notes: Allergic to lidocaine]",
      })
    ).toBe("Allergic to lidocaine");
  });

  it("returns null when no notes exist", () => {
    expect(getAppointmentNotes({ reason: "Alice - Botox" })).toBeNull();
    expect(getAppointmentNotes({ reason: null })).toBeNull();
  });

  it("prefers dedicated notes over legacy pattern", () => {
    expect(
      getAppointmentNotes({
        reason: "X [Notes: old note]",
        notes: "new note",
      })
    ).toBe("new note");
  });
});

describe("getAppointmentTitle", () => {
  it("returns dedicated title column when present", () => {
    expect(
      getAppointmentTitle({ reason: "legacy reason", title: "My Title" })
    ).toBe("My Title");
  });

  it("strips [Doctor: ...] and [Notes: ...] from legacy reason", () => {
    expect(
      getAppointmentTitle({
        reason:
          "Alice - Botox [Doctor: Dr. Smith] [Notes: Some notes]",
      })
    ).toBe("Alice - Botox");
  });

  it("returns just reason when no brackets present", () => {
    expect(
      getAppointmentTitle({ reason: "Alice - Botox" })
    ).toBe("Alice - Botox");
  });

  it("returns null when reason is null and no title", () => {
    expect(getAppointmentTitle({ reason: null })).toBeNull();
  });

  it("returns null when reason becomes empty after stripping", () => {
    expect(
      getAppointmentTitle({ reason: "[Doctor: Dr. Smith]" })
    ).toBeNull();
  });
});

describe("getAppointmentDisplayName", () => {
  it("uses title if available", () => {
    expect(
      getAppointmentDisplayName({
        reason: "legacy [Doctor: X]",
        title: "Display Title",
      })
    ).toBe("Display Title");
  });

  it("falls back to cleaned reason", () => {
    expect(
      getAppointmentDisplayName({
        reason: "Alice - Botox [Doctor: Dr. Smith]",
      })
    ).toBe("Alice - Botox");
  });

  it("falls back to 'Appointment' when nothing is set", () => {
    expect(getAppointmentDisplayName({ reason: null })).toBe("Appointment");
  });
});

describe("getAppointmentDoctor", () => {
  it("extracts doctor from legacy reason field", () => {
    expect(
      getAppointmentDoctor({
        reason: "Alice - Botox [Doctor: Dr. Smith]",
      })
    ).toBe("Dr. Smith");
  });

  it("returns null when no doctor pattern", () => {
    expect(
      getAppointmentDoctor({ reason: "Alice - Botox" })
    ).toBeNull();
  });

  it("returns null for null reason", () => {
    expect(getAppointmentDoctor({ reason: null })).toBeNull();
  });

  it("handles doctor with extra spaces", () => {
    expect(
      getAppointmentDoctor({
        reason: "[Doctor:   Dr. Maria Rossi  ]",
      })
    ).toBe("Dr. Maria Rossi");
  });
});
