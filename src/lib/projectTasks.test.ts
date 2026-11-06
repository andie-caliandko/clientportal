import { describe, expect, it } from "vitest";
import { planProject, readTemplate } from "./projectTasks";

const template = [
  { title: "Launch", days: 30 },
  { title: "Kickoff call", days: 0, note: "Confirm scope" },
  { title: "Design the homepage", days: 8, assignee: "me" },
];

describe("project tasks", () => {
  it("dates a month-long timeline from the start date, in order, to the account manager", () => {
    const t = planProject("website", template, { start: "2026-11-09", am: "am", me: "me" });
    expect(t.map((x) => [x.title, x.date, x.assignee_id])).toEqual([
      ["Website: Kickoff call", "2026-11-09", "am"],
      ["Website: Design the homepage", "2026-11-17", "me"],
      ["Website: Launch", "2026-12-09", "am"],
    ]);
    expect(t[0].note).toBe("Confirm scope");
  });
  it("stretches every date to fit a bigger scope", () => {
    const t = planProject("branding", template, { start: "2026-11-09", length: 60, am: "am", me: "me" });
    expect(t.map((x) => x.date)).toEqual(["2026-11-09", "2026-11-25", "2027-01-08"]);
    expect(t[0].title).toBe("Branding: Kickoff call");
  });
  it("reads a timeline from the Settings form, sorted by day", () => {
    const f = new FormData();
    for (const [title, days, note, who] of [["Launch", "30", "", "account_manager"], ["", "3", "", "me"], ["Kickoff", "0", "Say hi", "me"]]) {
      f.append("title", title); f.append("days", days); f.append("note", note); f.append("assignee", who);
    }
    expect(readTemplate(f)).toEqual([
      { title: "Kickoff", days: 0, assignee: "me", note: "Say hi" },
      { title: "Launch", days: 30, assignee: "account_manager" },
    ]);
  });
});
