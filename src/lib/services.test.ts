import { describe, expect, it } from "vitest";
import { isSocial, readServices } from "./services";

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
});
