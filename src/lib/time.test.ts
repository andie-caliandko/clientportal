import { describe, expect, it } from "vitest";
import { formatMinutes, minutesBetween, parseDuration } from "./time";

describe("time helpers", () => {
  it("reads the ways people type a length of time", () => {
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
  it("formats totals as hours:minutes", () => {
    expect(formatMinutes(95)).toBe("1:35");
    expect(formatMinutes(0)).toBe("0:00");
    expect(formatMinutes(600)).toBe("10:00");
  });
  it("counts a running timer up to now", () => {
    expect(minutesBetween("2026-09-28T10:00:00Z", null, Date.parse("2026-09-28T10:45:00Z"))).toBe(45);
    expect(minutesBetween("2026-09-28T10:00:00Z", "2026-09-28T11:00:00Z")).toBe(60);
  });
});
