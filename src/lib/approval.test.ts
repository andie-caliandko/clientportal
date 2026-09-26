import { describe, expect, it } from "vitest";
import { approvalDueAt, dateAtHour, formatDue, remindersDue } from "./approval";

const NY = "America/New_York";
// Sep 2026 in New York is EDT (UTC-4).
const ny = (d: string) => new Date(`${d}-04:00`);

describe("approvalDueAt", () => {
  it("counts straight through weekdays", () => {
    expect(approvalDueAt(ny("2026-09-21T10:00"), { timeZone: NY })).toEqual(ny("2026-09-23T10:00"));
  });

  it("moves a Thursday link to Monday", () => {
    expect(approvalDueAt(ny("2026-09-24T11:00"), { timeZone: NY })).toEqual(ny("2026-09-28T11:00"));
  });

  it("moves a Friday afternoon link to Tuesday", () => {
    expect(approvalDueAt(ny("2026-09-25T14:00"), { timeZone: NY })).toEqual(ny("2026-09-29T14:00"));
  });

  it("starts the clock Monday for a link sent on the weekend", () => {
    expect(approvalDueAt(ny("2026-09-26T09:00"), { timeZone: NY })).toEqual(ny("2026-09-30T00:00"));
  });

  it("keeps wall-clock time across the fall DST change", () => {
    // Fri Oct 30 2026 3 PM EDT -> Tue Nov 3 3 PM EST (UTC-5)
    expect(approvalDueAt(ny("2026-10-30T15:00"), { timeZone: NY })).toEqual(
      new Date("2026-11-03T15:00-05:00"),
    );
  });

  it("can count weekends when the agency wants", () => {
    expect(approvalDueAt(ny("2026-09-24T11:00"), { skipWeekends: false })).toEqual(ny("2026-09-26T11:00"));
  });
});

describe("formatDue", () => {
  it("reads naturally", () => {
    expect(formatDue(ny("2026-09-28T11:00"), NY)).toBe("Monday, Sep 28 at 11:00 AM");
  });
});

describe("dateAtHour", () => {
  it("turns a date into 5 PM agency time", () => {
    expect(dateAtHour("2026-10-02", 17, NY)).toEqual(ny("2026-10-02T17:00"));
    expect(dateAtHour("2026-12-01", 17, NY)).toEqual(new Date("2026-12-01T17:00-05:00"));
  });
});

describe("remindersDue", () => {
  const due = ny("2026-10-02T17:00");
  it("sends nothing before 2 days late", () => {
    expect(remindersDue(due, ny("2026-10-04T16:59"))).toBe(0);
  });
  it("counts 2 days, 5 days and 1 week", () => {
    expect(remindersDue(due, ny("2026-10-04T17:00"))).toBe(1);
    expect(remindersDue(due, ny("2026-10-07T17:00"))).toBe(2);
    expect(remindersDue(due, ny("2026-10-09T17:00"))).toBe(3);
    expect(remindersDue(due, ny("2026-11-01T17:00"))).toBe(3);
  });
});

import { monthKey, weekOfMonth, weekRange } from "./rhythm";

describe("monthly rhythm", () => {
  it("maps days to weeks, folding the end of the month into week 4", () => {
    expect(weekOfMonth(NY, ny("2026-09-01T09:00"))).toBe(1);
    expect(weekOfMonth(NY, ny("2026-09-08T09:00"))).toBe(2);
    expect(weekOfMonth(NY, ny("2026-09-21T09:00"))).toBe(3);
    expect(weekOfMonth(NY, ny("2026-09-22T09:00"))).toBe(4);
    expect(weekOfMonth(NY, ny("2026-09-30T23:00"))).toBe(4);
  });
  it("uses the agency's time zone, not the server's", () => {
    // 11 PM Sep 30 in New York is already Oct 1 in UTC.
    expect(monthKey(NY, ny("2026-09-30T23:00"))).toBe("2026-09-01");
  });
  it("labels week ranges", () => {
    expect(weekRange(4, NY, ny("2026-09-25T09:00"))).toBe("Sep 22–30");
  });
});

import { describeDueDates } from "./rhythm";

describe("describeDueDates", () => {
  const now = ny("2026-10-18T09:00");
  it("labels all-day events and counts days away in the agency's time zone", () => {
    const [d] = describeDueDates([{ id: "a", title: "Content Calendars to Internal Review", date: "2026-10-21", allDay: true }], NY, now);
    expect(d).toMatchObject({ label: "Wed, Oct 21", daysAway: 3, week: 3 });
  });
  it("only tags a week for dates in the current month", () => {
    const [d] = describeDueDates([{ id: "b", title: "Monthly Meetings", date: "2026-11-02", allDay: true }], NY, now);
    expect(d.week).toBeNull();
    expect(d.daysAway).toBe(15);
  });
});
