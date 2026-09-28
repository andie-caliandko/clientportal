import { describe, expect, it } from "vitest";
import { kpiReport, rangeDates } from "./report";

const kpi = { id: "k", name: "Followers", unit: "number" as const, higher_is_better: true, good: 100, better: 150, best: 200, benchmark: null };

describe("rangeDates", () => {
  it("works out this month, last month and day counts", () => {
    expect(rangeDates("month", "2026-09-28")).toEqual({ from: "2026-09-01", to: "2026-09-28" });
    expect(rangeDates("last-month", "2026-09-28")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(rangeDates("last-month", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(rangeDates("30", "2026-09-28")).toEqual({ from: "2026-08-30", to: "2026-09-28" });
    expect(rangeDates("90", "2026-09-28")).toEqual({ from: "2026-07-01", to: "2026-09-28" });
  });
  it("accepts a custom range in either order", () => {
    expect(rangeDates("custom", "2026-09-28", { from: "2026-09-10", to: "2026-08-01" })).toEqual({ from: "2026-08-01", to: "2026-09-10" });
  });
});

describe("kpiReport", () => {
  const history = [
    { week: "2026-08-24", value: 90 },
    { week: "2026-08-31", value: 120 },
    { week: "2026-09-07", value: 160 },
    { week: "2026-09-14", value: 150 },
  ];
  it("measures change over the period", () => {
    const r = kpiReport(kpi, history, "2026-09-01", "2026-09-28");
    // The week of Aug 31 overlaps Sep 1, so it's the starting point.
    expect(r.first).toBe(120);
    expect(r.last).toBe(150);
    expect(r.pct).toBeCloseTo(0.25);
    expect(r.better).toBe(true);
    expect(r.tier).toBe("better");
    expect(r.high).toBe(160);
  });
  it("knows when lower is better", () => {
    const r = kpiReport({ ...kpi, higher_is_better: false }, history, "2026-08-24", "2026-09-28");
    expect(r.better).toBe(false);
  });
  it("handles a period with no readings", () => {
    expect(kpiReport(kpi, history, "2026-01-01", "2026-01-31").last).toBeNull();
  });
});
