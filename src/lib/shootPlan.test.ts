import { describe, expect, it } from "vitest";
import { cleanPlan, planIsEmpty, samePlan } from "./shootPlan";

describe("cleanPlan", () => {
  it("trims text and drops blank rows", () => {
    const p = cleanPlan({ overview: "  Spring menu  ", shots: [{ text: " Hero dish " }, { text: "  " }], timeline: [{ time: "9:00", text: "Set up" }, { time: "10:00", text: "" }] });
    expect(p).toEqual({ overview: "Spring menu", shots: [{ text: "Hero dish" }], timeline: [{ time: "9:00", text: "Set up" }] });
  });
  it("copes with junk", () => {
    expect(cleanPlan(null)).toEqual({ overview: "", shots: [], timeline: [] });
    expect(cleanPlan({ shots: "nope", timeline: [null, 3] })).toEqual({ overview: "", shots: [], timeline: [] });
  });
  it("knows empty and unchanged plans", () => {
    expect(planIsEmpty(cleanPlan({ shots: [{ text: " " }] }))).toBe(true);
    expect(samePlan({ overview: "a ", shots: [], timeline: [] }, { overview: "a", shots: [{ text: "" }], timeline: [] })).toBe(true);
  });
});
