import { describe, expect, it } from "vitest";
import { monthDays, parseLinks } from "./engagement";

describe("engagement helpers", () => {
  it("lists every day of the month", () => {
    expect(monthDays("2026-09")).toHaveLength(30);
    expect(monthDays("2028-02")).toHaveLength(29);
    expect(monthDays("2026-09")[0]).toBe("2026-09-01");
  });
  it("keeps only real links, once each", () => {
    expect(parseLinks("https://instagram.com/p/1\nnot a link, https://instagram.com/p/1 https://tiktok.com/@x")).toEqual([
      "https://instagram.com/p/1", "https://tiktok.com/@x",
    ]);
  });
});
