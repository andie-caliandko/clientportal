import { describe, expect, it } from "vitest";
import { nextShootDate, planShootSteps, shootDates, timeLabel } from "./shoots";

describe("content shoots", () => {
  it("steps a series forward, clamping month ends", () => {
    expect(nextShootDate("2026-11-12", "monthly")).toBe("2026-12-12");
    expect(nextShootDate("2026-11-30", "quarterly")).toBe("2027-02-28");
    expect(nextShootDate("2026-01-31", "every_2_months")).toBe("2026-03-31");
    expect(nextShootDate("2026-11-12", "yearly")).toBe("2027-11-12");
  });
  it("plans tasks a month and a half out, hidden until a week before each", () => {
    const steps = planShootSteps("2027-01-15", "2026-10-27");
    expect(steps[0]).toEqual(expect.objectContaining({ title: "Start planning the content shoot", due: "2026-12-01", showFrom: "2026-11-24" }));
    expect(steps.at(-1)).toEqual(expect.objectContaining({ title: "Upload and organize the shoot photos and video", due: "2027-01-18" }));
  });
  it("makes overdue steps due today when the shoot is soon", () => {
    const steps = planShootSteps("2026-11-10", "2026-10-27");
    expect(steps[0]).toEqual(expect.objectContaining({ due: "2026-10-27", showFrom: null }));
    expect(steps.find((s) => s.title.startsWith("Confirm the shoot"))?.due).toBe("2026-11-03");
  });
  it("skips planning for a shoot that's already happened", () => {
    expect(planShootSteps("2026-10-20", "2026-10-27").map((s) => s.title)).toEqual(["Upload and organize the shoot photos and video"]);
  });
  it("counts the wrap-up from the last day of a multi-day shoot", () => {
    const steps = planShootSteps("2027-01-15", "2026-10-27", "2027-01-16");
    expect(steps[0].due).toBe("2026-12-01");
    expect(steps.at(-1)?.due).toBe("2027-01-19");
    expect(shootDates("2027-01-15", "2027-01-16")).toBe("Fri, Jan 15 – Sat, Jan 16");
    expect(shootDates("2027-01-15", null)).toBe("Fri, Jan 15");
  });
  it("labels times", () => {
    expect(timeLabel("10:00")).toBe("10 AM");
    expect(timeLabel("14:30")).toBe("2:30 PM");
    expect(timeLabel(null)).toBeNull();
  });
});
