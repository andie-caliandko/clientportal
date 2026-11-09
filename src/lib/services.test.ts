import { describe, expect, it } from "vitest";
import { isHealthTracked, isSocial, readServices } from "./services";

describe("services", () => {
  it("treats social clients, and clients not set up yet, as social", () => {
    expect(isSocial(["social", "seo"])).toBe(true);
    expect(isSocial([])).toBe(true);
    expect(isSocial(null)).toBe(true);
    expect(isSocial(["website", "ads"])).toBe(false);
  });
  it("reads ticked services in the standard order and ignores unknown ones", () => {
    const f = new FormData();
    ["seo", "bogus", "social"].forEach((s) => f.append("services", s));
    expect(readServices(f)).toEqual(["social", "seo"]);
  });
  it("only tracks health (and sends scorecard reminders) for social clients with tracking on", () => {
    expect(isHealthTracked({ health_tracked: true, services: ["social"] })).toBe(true);
    expect(isHealthTracked({ health_tracked: null, services: [] })).toBe(true);
    expect(isHealthTracked({ health_tracked: false, services: ["social"] })).toBe(false);
    expect(isHealthTracked({ health_tracked: true, services: ["website"] })).toBe(false);
  });
});
