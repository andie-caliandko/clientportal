import { describe, expect, it } from "vitest";
import { openSlots } from "./slots";

const base = {
  from: "2026-10-05", // Monday
  to: "2026-10-06",
  timeZone: "America/New_York",
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 11,
  durationMin: 60,
  now: new Date("2026-10-01T12:00:00Z"),
};

describe("openSlots", () => {
  it("offers times inside bookable hours in the agency's time zone", () => {
    // 9:00, 9:30, 10:00 Eastern (EDT = UTC-4) on each day.
    expect(openSlots(base, [])).toEqual([
      "2026-10-05T13:00:00.000Z", "2026-10-05T13:30:00.000Z", "2026-10-05T14:00:00.000Z",
      "2026-10-06T13:00:00.000Z", "2026-10-06T13:30:00.000Z", "2026-10-06T14:00:00.000Z",
    ]);
  });
  it("skips anything that overlaps a busy time", () => {
    const slots = openSlots({ ...base, to: "2026-10-05" }, [{ start: "2026-10-05T13:45:00Z", end: "2026-10-05T14:15:00Z" }]);
    expect(slots).toEqual([]);
  });
  it("skips days that aren't bookable and times too soon", () => {
    expect(openSlots({ ...base, from: "2026-10-03", to: "2026-10-04" }, [])).toEqual([]); // weekend
    expect(openSlots({ ...base, to: "2026-10-05", now: new Date("2026-10-05T01:30:00Z"), noticeHours: 12 }, [])).toEqual([
      "2026-10-05T13:30:00.000Z", "2026-10-05T14:00:00.000Z",
    ]);
  });
});
