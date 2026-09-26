import { describe, expect, it } from "vitest";
import { accountHealth, ratingFor, summarize, tierFor, trendFor, weekStart, type Kpi } from "./health";

const engagement: Kpi = { id: "e", name: "Engagement rate", unit: "percent", higher_is_better: true, good: 3, better: 4.5, best: 6, benchmark: null };
const costPerLead: Kpi = { id: "c", name: "Cost per lead", unit: "currency", higher_is_better: false, good: 40, better: 30, best: 20, benchmark: null };

describe("tiers and ratings", () => {
  it("places values against good / better / best", () => {
    expect(tierFor(2.9, engagement)).toBe("below");
    expect(tierFor(3, engagement)).toBe("good");
    expect(tierFor(5, engagement)).toBe("better");
    expect(tierFor(6.2, engagement)).toBe("best");
  });
  it("handles KPIs where lower is better", () => {
    expect(tierFor(45, costPerLead)).toBe("below");
    expect(tierFor(35, costPerLead)).toBe("good");
    expect(tierFor(18, costPerLead)).toBe("best");
  });
  it("maps tiers to red / yellow / green", () => {
    expect(ratingFor("below")).toBe("red");
    expect(ratingFor("good")).toBe("yellow");
    expect(ratingFor("better")).toBe("green");
    expect(ratingFor("best")).toBe("green");
  });
});

describe("trends", () => {
  it("treats small changes as steady", () => {
    expect(trendFor(100, 101, true)).toBe("steady");
  });
  it("reads direction as performance", () => {
    expect(trendFor(4, 4.6, true)).toBe("improving");
    expect(trendFor(4.6, 4, true)).toBe("slipping");
    expect(trendFor(35, 28, false)).toBe("improving"); // cost per lead went down
  });
  it("has no trend for a first reading", () => {
    expect(trendFor(undefined, 4, true)).toBeNull();
  });
});

describe("accountHealth", () => {
  it("is green when KPIs are mostly at Better or Best", () => {
    expect(accountHealth([{ rating: "green", trend: "steady" }, { rating: "green", trend: null }, { rating: "yellow", trend: "improving" }])?.rating).toBe("green");
  });
  it("is yellow when things are mixed", () => {
    expect(accountHealth([{ rating: "green", trend: "slipping" }, { rating: "yellow", trend: "steady" }, { rating: "red", trend: "improving" }])?.rating).toBe("yellow");
  });
  it("is red when KPIs are below Good and slipping", () => {
    expect(accountHealth([{ rating: "red", trend: "slipping" }, { rating: "yellow", trend: "slipping" }])?.rating).toBe("red");
  });
  it("is empty with no KPIs", () => {
    expect(accountHealth([])).toBeNull();
  });
});

describe("summarize and weeks", () => {
  it("summarizes the latest reading", () => {
    expect(summarize(engagement, [4.1, 4.8])).toMatchObject({ latest: 4.8, tier: "better", rating: "green", trend: "improving" });
  });
  it("snaps any date to that week's Monday", () => {
    expect(weekStart("2026-09-26")).toBe("2026-09-21");
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
  });
});
