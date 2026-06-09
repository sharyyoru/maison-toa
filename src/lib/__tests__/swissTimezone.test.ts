import { describe, it, expect } from "vitest";
import {
  SWISS_TIMEZONE,
  SWISS_LOCALE,
  formatSwissDate,
  formatSwissTime,
  formatSwissDateTime,
  formatSwissMonthYear,
  formatSwissTimeRange,
  formatSwissYmd,
  formatSwissDateWithWeekday,
  formatSwissTimeAmPm,
  formatSwissShortDate,
  getSwissToday,
  parseSwissDate,
  getSwissDayOfWeek,
  getSwissHourMinute,
  getSwissSlotString,
  createSwissDateTime,
  getSwissDayRange,
  parseSwissDateTimeLocal,
  formatSwissAppointmentDateTime,
  getSwissMonthRange,
  getSwissNow,
} from "../swissTimezone";

describe("constants", () => {
  it("exports correct timezone and locale", () => {
    expect(SWISS_TIMEZONE).toBe("Europe/Zurich");
    expect(SWISS_LOCALE).toBe("fr-CH");
  });
});

describe("formatSwissDate", () => {
  it("formats a Date object", () => {
    const result = formatSwissDate(new Date("2024-06-15T10:00:00Z"));
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("formats a date string", () => {
    const result = formatSwissDate("2024-06-15T10:00:00Z");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("returns dash for invalid date", () => {
    expect(formatSwissDate("invalid")).toBe("—");
    expect(formatSwissDate(new Date("invalid"))).toBe("—");
  });

  it("accepts custom options", () => {
    const result = formatSwissDate("2024-06-15T10:00:00Z", {
      month: "short",
    });
    expect(result).toBeTruthy();
  });
});

describe("formatSwissTime", () => {
  it("formats time in HH:MM format", () => {
    const result = formatSwissTime("2024-06-15T10:00:00Z");
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it("returns dash for invalid date", () => {
    expect(formatSwissTime("invalid")).toBe("—");
  });
});

describe("formatSwissDateTime", () => {
  it("includes date and time", () => {
    const result = formatSwissDateTime("2024-06-15T10:00:00Z");
    expect(result).toContain("2024");
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it("returns dash for invalid date", () => {
    expect(formatSwissDateTime("invalid")).toBe("—");
  });
});

describe("formatSwissMonthYear", () => {
  it("returns month and year", () => {
    const result = formatSwissMonthYear("2024-06-15T10:00:00Z");
    expect(result).toContain("2024");
  });

  it("returns dash for invalid date", () => {
    expect(formatSwissMonthYear("invalid")).toBe("—");
  });
});

describe("formatSwissTimeRange", () => {
  it("formats a start-end time range", () => {
    const start = "2024-06-15T10:00:00Z";
    const end = "2024-06-15T11:00:00Z";
    const result = formatSwissTimeRange(start, end);
    expect(result).toContain(" - ");
  });

  it("uses fallback duration when end is null", () => {
    const result = formatSwissTimeRange("2024-06-15T10:00:00Z", null, 60);
    expect(result).toContain(" - ");
  });

  it("uses fallback when end is invalid", () => {
    const result = formatSwissTimeRange("2024-06-15T10:00:00Z", "invalid", 30);
    expect(result).toContain(" - ");
  });

  it("returns empty for invalid start", () => {
    expect(formatSwissTimeRange("invalid", null)).toBe("");
  });
});

describe("formatSwissYmd", () => {
  it("returns YYYY-MM-DD format", () => {
    const result = formatSwissYmd("2024-06-15T10:00:00Z");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns empty for invalid date", () => {
    expect(formatSwissYmd("invalid")).toBe("");
  });
});

describe("formatSwissDateWithWeekday", () => {
  it("includes weekday name", () => {
    // June 15 2024 is a Saturday
    const result = formatSwissDateWithWeekday("2024-06-15T10:00:00Z");
    expect(result).toContain("Saturday");
    expect(result).toContain("June");
    expect(result).toContain("15");
  });

  it("returns dash for invalid date", () => {
    expect(formatSwissDateWithWeekday("invalid")).toBe("—");
  });
});

describe("formatSwissTimeAmPm", () => {
  it("returns time with AM/PM", () => {
    const result = formatSwissTimeAmPm("2024-06-15T10:00:00Z");
    expect(result).toMatch(/\d{2}:\d{2}\s*(AM|PM)/);
  });

  it("returns dash for invalid date", () => {
    expect(formatSwissTimeAmPm("invalid")).toBe("—");
  });
});

describe("formatSwissShortDate", () => {
  it("returns short date", () => {
    const result = formatSwissShortDate("2024-06-15T10:00:00Z");
    expect(result).toContain("15");
  });

  it("returns dash for invalid date", () => {
    expect(formatSwissShortDate("invalid")).toBe("—");
  });
});

describe("getSwissToday", () => {
  it("returns a valid Date set to noon", () => {
    const today = getSwissToday();
    expect(today).toBeInstanceOf(Date);
    expect(today.getHours()).toBe(12);
    expect(today.getMinutes()).toBe(0);
  });
});

describe("parseSwissDate", () => {
  it("parses YYYY-MM-DD string to noon Date", () => {
    const d = parseSwissDate("2024-06-15");
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5); // June = 5 (0-indexed)
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(12);
  });
});

describe("getSwissDayOfWeek", () => {
  it("returns correct day of week (Saturday = 6)", () => {
    // June 15 2024 is a Saturday
    const result = getSwissDayOfWeek("2024-06-15T10:00:00Z");
    expect(result).toBe(6);
  });

  it("returns -1 for invalid date", () => {
    expect(getSwissDayOfWeek("invalid")).toBe(-1);
  });
});

describe("getSwissHourMinute", () => {
  it("extracts hour and minute in Swiss timezone", () => {
    const result = getSwissHourMinute("2024-06-15T10:00:00Z");
    // UTC 10:00 = Swiss 12:00 (CEST = UTC+2)
    expect(result.hour).toBe(12);
    expect(result.minute).toBe(0);
  });

  it("returns 0,0 for invalid date", () => {
    expect(getSwissHourMinute("invalid")).toEqual({ hour: 0, minute: 0 });
  });
});

describe("getSwissSlotString", () => {
  it("returns HH:MM string", () => {
    const result = getSwissSlotString("2024-06-15T10:00:00Z");
    expect(result).toBe("12:00");
  });
});

describe("createSwissDateTime", () => {
  it("creates a Date for a given Swiss date and time", () => {
    const d = createSwissDateTime("2024-06-15", 14, 30);
    expect(d).toBeInstanceOf(Date);
    // Verify it represents 14:30 Swiss time
    const swissTime = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Zurich",
    });
    expect(swissTime).toContain("14");
    expect(swissTime).toContain("30");
  });
});

describe("getSwissDayRange", () => {
  it("returns start and end ISO strings for a day", () => {
    const range = getSwissDayRange("2024-06-15");
    expect(range.start).toBeTruthy();
    expect(range.end).toBeTruthy();
    expect(new Date(range.start).getTime()).toBeLessThan(
      new Date(range.end).getTime()
    );
  });
});

describe("parseSwissDateTimeLocal", () => {
  it("parses datetime-local format", () => {
    const d = parseSwissDateTimeLocal("2024-06-15T14:30");
    expect(d).toBeInstanceOf(Date);
    expect(d.getTime()).not.toBeNaN();
  });

  it("falls back for invalid format", () => {
    const d = parseSwissDateTimeLocal("not-a-datetime");
    expect(d).toBeInstanceOf(Date);
  });

  it("handles missing time part", () => {
    const d = parseSwissDateTimeLocal("2024-06-15");
    expect(d).toBeInstanceOf(Date);
  });
});

describe("formatSwissAppointmentDateTime", () => {
  it("returns date and time strings", () => {
    const result = formatSwissAppointmentDateTime("2024-06-15T10:00:00Z");
    expect(result.date).not.toBe("—");
    expect(result.time).not.toBe("—");
    expect(result.time).toMatch(/\d{2}:\d{2}/);
  });

  it("returns dashes for invalid date", () => {
    const result = formatSwissAppointmentDateTime("invalid");
    expect(result).toEqual({ date: "—", time: "—" });
  });
});

describe("getSwissMonthRange", () => {
  it("returns start and end of a month", () => {
    const range = getSwissMonthRange(2024, 5); // June (0-indexed)
    expect(range.start).toBeTruthy();
    expect(range.end).toBeTruthy();
    const start = new Date(range.start);
    const end = new Date(range.end);
    expect(start.getTime()).toBeLessThan(end.getTime());
  });
});

describe("getSwissNow", () => {
  it("returns current Swiss time components", () => {
    const now = getSwissNow();
    expect(now.year).toBeGreaterThanOrEqual(2024);
    expect(now.month).toBeGreaterThanOrEqual(0);
    expect(now.month).toBeLessThanOrEqual(11);
    expect(now.day).toBeGreaterThanOrEqual(1);
    expect(now.day).toBeLessThanOrEqual(31);
    expect(now.hour).toBeGreaterThanOrEqual(0);
    expect(now.hour).toBeLessThanOrEqual(23);
    expect(now.minute).toBeGreaterThanOrEqual(0);
    expect(now.minute).toBeLessThanOrEqual(59);
  });
});
