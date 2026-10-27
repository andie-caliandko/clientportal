import { describe, expect, it } from "vitest";
import { cleanPlan, lines, newSetup, planIsEmpty, samePlan, usedFor } from "./shootPlan";

describe("cleanPlan", () => {
  it("keeps setups with content and drops blank rows", () => {
    const s = { ...newSetup(1), id: "a1", name: " Storefront ", shots: [{ type: "Stills", shots: " Wide of the door " }, { type: "", shots: "" }] };
    const p = cleanPlan({ purpose: " Spring launch ", setups: [s, { id: "b2" }], timeline: [{ time: "9:00", text: "Set up" }, { time: "10", text: " " }] });
    expect(p.purpose).toBe("Spring launch");
    expect(p.setups).toHaveLength(1);
    expect(p.setups[0]).toMatchObject({ id: "a1", name: "Storefront", shots: [{ type: "Stills", shots: "Wide of the door" }] });
    expect(p.timeline).toEqual([{ time: "9:00", text: "Set up" }]);
  });
  it("keeps models tied only to setups that exist", () => {
    const p = cleanPlan({ needsModels: true, setups: [{ id: "a1", name: "Look 1" }], models: [{ id: "m1", name: "Sam", setupIds: ["a1", "gone"], waiverSigned: true }, { name: "" }] });
    expect(p.models).toEqual([{ id: "m1", name: "Sam", setupIds: ["a1"], size: "", waiverSigned: true, notes: "" }]);
  });
  it("copes with junk", () => {
    expect(planIsEmpty(cleanPlan(null))).toBe(true);
    expect(planIsEmpty(cleanPlan({ setups: "nope", models: [null, 3] }))).toBe(true);
  });
  it("compares plans after tidying", () => {
    expect(samePlan(cleanPlan({ purpose: "a " }), cleanPlan({ purpose: "a", timeline: [{ time: "", text: "" }] }))).toBe(true);
  });
});

describe("helpers", () => {
  it("splits lines and strips typed bullets", () => {
    expect(lines("• Santa hats\n- Ornaments\n\n2) Candy canes")).toEqual(["Santa hats", "Ornaments", "Candy canes"]);
  });
  it("finds the setups at a venue", () => {
    const p = cleanPlan({ setups: [{ id: "a", name: "Softball", location: "The Yard – infield" }, { id: "b", name: "Winter", location: "Wire Park" }] });
    expect(usedFor(p, "the yard")).toEqual(["Softball"]);
  });
});
