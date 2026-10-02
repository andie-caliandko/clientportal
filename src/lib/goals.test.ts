import { describe, expect, it } from "vitest";
import { goalProgress, periodLabel, periodStart, shiftPeriod } from "./goals";

describe("goals", () => {
  it("finds the start of a month or quarter", () => {
    expect(periodStart("2026-10-02", "month")).toBe("2026-10-01");
    expect(periodStart("2026-10-02", "quarter")).toBe("2026-10-01");
    expect(periodStart("2026-08-20", "quarter")).toBe("2026-07-01");
  });
  it("moves between periods", () => {
    expect(shiftPeriod("2026-10-01", "quarter", 1)).toBe("2027-01-01");
    expect(shiftPeriod("2026-01-01", "month", -1)).toBe("2025-12-01");
    expect(periodLabel("2026-07-01", "quarter")).toBe("Q3 2026");
  });
  it("measures progress", () => {
    expect(goalProgress({ target: 20, progress: 5, done: false })).toBe(0.25);
    expect(goalProgress({ target: 20, progress: 30, done: false })).toBe(1);
    expect(goalProgress({ target: null, progress: 0, done: true })).toBe(1);
  });
});
