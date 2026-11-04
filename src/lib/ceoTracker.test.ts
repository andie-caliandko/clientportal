import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { cleanPatch, growthPlan, horizonPlan, lifePlan, monthSummary, yearSummary, type IncomeRow, type MonthData } from "./ceoTracker";

vi.mock("server-only", () => ({}));

// Numbers shaped like a month from the owner's spreadsheet, so the math matches it.
const month: MonthData = {
  goal: 20000, starting: 15000, ending: 18000, clients: 10, cancellations: 1, teamMembers: 2,
  inboundLeads: 4, inboundCalls: 2,
  extraIncome: [{ id: "p", label: "One-time project", amount: 500 }],
  team: [{ id: "t1", label: "Designer", amount: 3500 }, { id: "t2", label: "Editor", amount: 600 }],
  expenses: [{ id: "x", label: "Software", amount: 300 }],
  leadRows: ["Upwork", "DMs"],
};
const clients: IncomeRow[] = [
  { id: "a", label: "Client A", clientId: "a", amount: 4245, status: "paid" },
  { id: "b", label: "Client B", clientId: "b", amount: 0, status: "projected" },
];
const daily = {
  "lead:Upwork": { 1: 30, 2: 5 }, "lead:DMs": { 3: 36 },
  calls_offered: { 5: 2 }, calls_had: { 6: 2 }, signed: { 7: 1 },
};

describe("CEO tracker month", () => {
  const s = monthSummary(month, daily, clients);
  it("adds CEO dashboard clients and added payments, then works out what you can pay yourself", () => {
    expect(s.newNeeded).toBe(5000);
    expect(s.incomeTotal).toBe(4745);
    expect(s.paid).toBe(4745);
    expect(s.salary).toBe(4100);
    expect(s.opex).toBe(300);
    expect(s.profit).toBe(345);
    expect(s.taxes).toBeCloseTo(51.75);
    expect(s.reinvest).toBeCloseTo((345 - 51.75) * 0.3);
    expect(s.takeHome).toBeCloseTo(345 - 51.75 - (345 - 51.75) * 0.3);
  });
  it("counts projected income separately from what's been paid", () => {
    const p = monthSummary({}, {}, [{ id: "c", label: "C", amount: 1000, status: "projected" }, { id: "d", label: "D", amount: 500, status: "paid" }]);
    expect(p.projected).toBe(1500);
    expect(p.paid).toBe(500);
  });
  it("adds up the daily tracker and the funnel", () => {
    expect(s.touchPoints).toBe(71);
    expect(s.touchPerCall).toBe(35.5);
    expect(s.showRate).toBe(1);
    expect(s.closeRate).toBe(0.5);
    expect(s.churn).toBe(0.1);
    expect(s.revenuePerMember).toBe(9000);
  });
  it("shows a dash instead of dividing by zero", () => {
    const empty = monthSummary({}, {});
    expect(empty.touchPerCall).toBeNull();
    expect(empty.margin).toBeNull();
    expect(empty.taxes).toBe(0);
  });
  it("adds months into a year", () => {
    const y = yearSummary([{ data: month, s }, { data: {}, s: monthSummary({ ending: 2000 }, {}) }]);
    expect(y.revenue).toBe(20000);
    expect(y.touchPoints).toBe(71);
    expect(y.takeHome).toBeCloseTo(s.takeHome);
  });
});

describe("North Star", () => {
  it("works a revenue goal back to clients and calls", () => {
    const p = horizonPlan({ monthly: 30000, current: 12000, retainer: 1000, closeRate: 0.25, showRate: 0.8 });
    expect(p.clients).toBe(18);
    expect(p.booked).toBe(90);
    expect(p.live).toBe(72);
  });
  it("prices life goals", () => {
    const l = lifePlan([{ id: "1", label: "House", price: 20000, years: 1 }, { id: "2", label: "Savings", price: 120000, years: 5 }]);
    expect(l.annual).toBe(44000);
    expect(l.dreamBudget).toBeCloseTo(44000 / 0.4 / 12);
  });
  it("plans growth like the spreadsheet", () => {
    const g = growthPlan({ current: 30000, goal: 100000, offer: 3000, months: 1, closeRate: 0.2, leadToCall: 0.25, capacity: 5 });
    expect(g.clients).toBeCloseTo(23.333, 2);
    expect(g.callsMonth).toBeCloseTo(116.667, 2);
    expect(g.leadsMonth).toBeCloseTo(466.667, 2);
  });
});

describe("saving", () => {
  it("only keeps known fields for real sheet keys", () => {
    expect(cleanPatch("2026-11", { goal: 1, evil: 2 })).toEqual({ goal: 1 });
    expect(cleanPatch("vision", { why: "x", goal: 1 })).toEqual({ why: "x" });
    expect(cleanPatch("2026-13", { goal: 1 })).toBeNull();
    expect(cleanPatch("other", { goal: 1 })).toBeNull();
  });
});

describe("CEO tracker PDF", () => {
  it("makes one PDF from several months, with a summary page", async () => {
    const { ceoTrackerPdf } = await import("./ceoTrackerPdf");
    const m = (key: string) => ({ month: key, data: { ...month, reflection: "A good month.", magnet: { Health: "green" as const } }, daily, s: monthSummary(month, daily, clients) });
    const bytes = await ceoTrackerPdf({ agency: "Test Agency", months: [m("2026-01"), m("2026-02")], overview: true });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });
});
