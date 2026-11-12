import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { autoValues, cleanCard, fmtTarget, resolveCard, statusOf, type KpiRow, type TeamKpi } from "./teamScorecard";

const green: TeamKpi = { id: "g", label: "GREEN clients", source: "health_green", unit: "pct", dir: "min", targets: [80, 85, 90, 90] };
const red: TeamKpi = { id: "r", label: "RED clients", source: "health_red", unit: "pct", dir: "max", targets: [5, 5, 5, 5] };
const growth: TeamKpi = { id: "f", label: "Follower growth", source: "followers", unit: "pct", dir: "min", targets: [null, 10, 10, 10] };

describe("team scorecard targets", () => {
  it("uses the quarter's target and the right direction", () => {
    expect(statusOf(green, 86, "2026-04")).toBe("hit");
    expect(statusOf(green, 86, "2026-11")).toBe("miss");
    expect(statusOf(red, 5, "2026-11")).toBe("hit");
    expect(statusOf(red, 6, "2026-11")).toBe("miss");
    expect(statusOf(growth, 3, "2026-02")).toBe("none");
    expect(statusOf(green, null, "2026-11")).toBe("open");
    expect(fmtTarget(red, "2026-11")).toBe("≤ 5%");
    expect(fmtTarget(growth, "2026-01")).toBe("No target");
  });
});

const kpi = (id: string, client: string, name: string, history: [string, number][], good = 1, better = 2, best = 3): KpiRow => ({
  id, client_id: client, name, unit: "number", higher_is_better: true, good, better, best, benchmark: null,
  history: history.map(([week, value]) => ({ week, value })),
});

describe("team scorecard numbers from the portal", () => {
  const clients = [
    { id: "a", name: "A", account_manager_id: "doni", archived_at: null, created_at: "2026-01-01", tracked: true },
    { id: "b", name: "B", account_manager_id: "doni", archived_at: null, created_at: "2026-01-01", tracked: true },
    { id: "c", name: "C", account_manager_id: "taylor", archived_at: "2026-11-05T00:00:00Z", created_at: "2026-01-01", tracked: true },
  ];
  const kpis = [
    kpi("1", "a", "Followers", [["2026-10-26", 1000], ["2026-11-02", 1050], ["2026-11-09", 1100]], 900, 1000, 1100),
    kpi("2", "b", "Followers", [["2026-10-27", 500], ["2026-11-03", 400]], 600, 700, 800),
  ];
  const tasks = [
    { assignee_id: "doni", due_at: "2026-11-03T22:00:00Z", completed_at: "2026-11-03T15:00:00Z", status: "done" },
    { assignee_id: "doni", due_at: "2026-11-04T22:00:00Z", completed_at: "2026-11-06T15:00:00Z", status: "done" },
    { assignee_id: "doni", due_at: "2026-11-05T22:00:00Z", completed_at: null, status: "todo" },
    { assignee_id: "doni", due_at: "2026-11-28T22:00:00Z", completed_at: null, status: "todo" },
  ];
  const reports = [{ client_id: "a", created_at: "2026-11-20T10:00:00Z" }, { client_id: "b", created_at: "2026-11-27T10:00:00Z" }];
  const own = autoValues({ userId: "doni", month: "2026-11", today: "2026-11-10", scope: "own", clients, kpis, tasks, reports });

  it("rates the accounts they manage", () => {
    expect(own.health_green.value).toBe(50);
    expect(own.health_red.value).toBe(50);
    expect(own.accounts.value).toBe(2);
  });
  it("averages follower growth across accounts", () => {
    expect(own.followers.value).toBeCloseTo((10 + -20) / 2);
  });
  it("counts reports in by the 25th and tasks done on time", () => {
    expect(own.reports.value).toBe(50);
    expect(own.tasks.value).toBeCloseTo(100 / 3);
  });
  it("counts clients kept, across every account for a director", () => {
    const all = autoValues({ userId: "shayla", month: "2026-11", today: "2026-11-10", scope: "all", clients, kpis, tasks, reports });
    expect(all.retention.value).toBeCloseTo(200 / 3);
    expect(all.health_updated.value).toBeCloseTo(100 / 3);
  });
  it("cleans a saved scorecard", () => {
    const c = cleanCard({ role_title: "AM", mission: "x", kpis: [{ label: "", source: "weird", targets: ["10", "", null] }] })!;
    expect(c.kpis[0]).toMatchObject({ label: "New KPI", source: "manual", unit: "pct", dir: "min", targets: [10, null, null, null] });
  });
});

describe("scorecards by position", () => {
  const am = { id: "am", title: "Account Manager", role_title: "", mission: "AM", kpis: [], auto_role: "account_manager", auto_title: null };
  const ops = { id: "ops", title: "Director of Operations", role_title: "", mission: "Ops", kpis: [], auto_role: null, auto_title: "director of op" };
  const templates = [am, ops];
  it("matches job title first, then role", () => {
    expect(resolveCard({ role: "account_manager", title: "Account Manager" }, undefined, templates).template?.id).toBe("am");
    expect(resolveCard({ role: "admin", title: "Director of Ops" }, undefined, templates).template?.id).toBe("ops");
    expect(resolveCard({ role: "creator", title: "Designer" }, undefined, templates).card).toBeNull();
  });
  it("uses a position picked for them, or their own scorecard", () => {
    const row = { user_id: "x", template_id: "ops", custom: false, role_title: "", mission: "", kpis: [] };
    expect(resolveCard({ role: "account_manager", title: null }, row, templates).card?.role_title).toBe("Director of Operations");
    const own = { ...row, custom: true, role_title: "Special", mission: "Mine" };
    expect(resolveCard({ role: "account_manager", title: null }, own, templates)).toMatchObject({ custom: true, card: { role_title: "Special" } });
  });
});

describe("scores", () => {
  it("averages the scorecard and the client accounts", async () => {
    const { accountsScore, overallScore, quarterMonths, scorecardScore } = await import("./teamScorecard");
    expect(scorecardScore(["hit", "hit", "miss", "open", "none"])).toBeCloseTo(66.67, 1);
    expect(scorecardScore(["open"])).toBeNull();
    expect(accountsScore(["green", "yellow", "red", null])).toBe(50);
    expect(overallScore(80, 60)).toBe(70);
    expect(overallScore(null, 60)).toBe(60);
    expect(quarterMonths("2026-11")).toEqual(["2026-10", "2026-11"]);
    expect(quarterMonths("2026-01")).toEqual(["2026-01"]);
  });
});

describe("quarterly reviews", () => {
  it("are due in the first week of a quarter, for the quarter that just ended", async () => {
    const { reviewDue } = await import("./teamScorecard.server");
    expect(reviewDue("2027-01-03")).toEqual({ months: ["2026-10", "2026-11", "2026-12"], label: "Q4 2026", dueDate: "2027-01-08" });
    expect(reviewDue("2026-07-01")?.label).toBe("Q2 2026");
    expect(reviewDue("2026-07-08")).toBeNull();
    expect(reviewDue("2026-11-02")).toBeNull();
  });
});
