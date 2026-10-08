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

  it("starts the clock Monday at 9 AM for a link sent on the weekend", () => {
    expect(approvalDueAt(ny("2026-09-26T09:00"), { timeZone: NY })).toEqual(ny("2026-09-30T09:00"));
    expect(approvalDueAt(ny("2026-09-27T22:30"), { timeZone: NY })).toEqual(ny("2026-09-30T09:00"));
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
  // October 2026: the 1st is a Thursday, so week 1 starts Monday Oct 5. November's first Monday is Nov 2.
  it("starts week 1 on the first Monday, with Monday-to-Sunday weeks", () => {
    expect(weekOfMonth(NY, ny("2026-10-05T09:00"))).toBe(1);
    expect(weekOfMonth(NY, ny("2026-10-11T22:00"))).toBe(1);
    expect(weekOfMonth(NY, ny("2026-10-12T09:00"))).toBe(2);
    expect(weekOfMonth(NY, ny("2026-10-19T09:00"))).toBe(3);
    expect(weekOfMonth(NY, ny("2026-10-26T09:00"))).toBe(4);
  });
  it("counts days before the first Monday as last month's week 4", () => {
    expect(weekOfMonth(NY, ny("2026-10-01T09:00"))).toBe(4);
    expect(monthKey(NY, ny("2026-10-04T09:00"))).toBe("2026-09-01");
    expect(monthKey(NY, ny("2026-10-05T09:00"))).toBe("2026-10-01");
    expect(weekOfMonth(NY, ny("2026-11-01T09:00"))).toBe(4);
    expect(monthKey(NY, ny("2026-11-01T09:00"))).toBe("2026-10-01");
  });
  it("starts on the 1st when the month begins on a Monday", () => {
    // June 1, 2026 is a Monday.
    expect(weekOfMonth(NY, ny("2026-06-01T09:00"))).toBe(1);
    expect(monthKey(NY, ny("2026-06-01T09:00"))).toBe("2026-06-01");
  });
  it("uses the agency's time zone, not the server's", () => {
    // 11 PM Sunday Oct 4 in New York is already Monday Oct 5 in UTC.
    expect(monthKey(NY, ny("2026-10-04T23:00"))).toBe("2026-09-01");
  });
  it("labels week ranges, across the month end when needed", () => {
    const now = ny("2026-10-08T09:00");
    expect(weekRange(1, NY, now)).toBe("Oct 5–11");
    expect(weekRange(3, NY, now)).toBe("Oct 19–25");
    expect(weekRange(4, NY, now)).toBe("Oct 26–Nov 1");
  });
  it("handles the year end", () => {
    // Dec 2026: first Monday Dec 7; Jan 2027's first Monday is Jan 4.
    expect(weekRange(4, NY, ny("2026-12-30T09:00"))).toBe("Dec 28–Jan 3");
    expect(monthKey(NY, ny("2027-01-02T09:00"))).toBe("2026-12-01");
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
