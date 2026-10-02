import { describe, expect, it } from "vitest";
import { nextDue, showFrom } from "./recurring";

describe("recurring tasks", () => {
  it("works out the next due date", () => {
    const d = new Date("2026-10-02T21:00:00Z");
    expect(nextDue(d, "weekly").toISOString()).toBe("2026-10-09T21:00:00.000Z");
    expect(nextDue(d, "biweekly").toISOString()).toBe("2026-10-16T21:00:00.000Z");
    expect(nextDue(d, "monthly").toISOString()).toBe("2026-11-02T21:00:00.000Z");
    expect(nextDue(d, "quarterly").toISOString()).toBe("2027-01-02T21:00:00.000Z");
    expect(nextDue(d, "yearly").toISOString()).toBe("2027-10-02T21:00:00.000Z");
  });
  it("keeps month ends sensible", () => {
    expect(nextDue(new Date("2026-01-31T12:00:00Z"), "monthly").toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(nextDue(new Date("2026-11-30T12:00:00Z"), "quarterly").toISOString()).toBe("2027-02-28T12:00:00.000Z");
  });
  it("shows up ahead of time", () => {
    expect(showFrom(new Date("2027-01-15T12:00:00Z"), "quarterly").toISOString()).toBe("2027-01-01T12:00:00.000Z");
  });
});
