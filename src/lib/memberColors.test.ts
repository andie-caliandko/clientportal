import { describe, expect, it } from "vitest";
import { MEMBER_COLORS, memberColors } from "./memberColors";

describe("memberColors", () => {
  it("gives up to 8 people different colors", () => {
    const ids = Array.from({ length: MEMBER_COLORS }, (_, i) => `user-${i}-${i * 7}`);
    const colors = memberColors(ids);
    expect(new Set(colors.values()).size).toBe(MEMBER_COLORS);
  });
  it("doesn't depend on list order", () => {
    const a = memberColors(["x1", "b2", "m3"]);
    const b = memberColors(["m3", "x1", "b2"]);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });
  it("still colors everyone past 8 people", () => {
    const colors = memberColors(Array.from({ length: 12 }, (_, i) => `p${i}`));
    expect(colors.size).toBe(12);
    colors.forEach((c) => expect(c).toBeLessThan(MEMBER_COLORS));
  });
});
