import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { capacity, cleanOffers, cleanQuote, cleanSettings, offerLines, offerSummary, optionSummary, rates, roundPrice, type Offer } from "./pricing";

const settings = { salary: 130000, myHours: 30, margin: 0.2, teamHours: { Designer: 20 } };
const team = [{ id: "t", label: "Designer", amount: 2000 }];
const expenses = [{ id: "e", label: "Software", amount: 1000 }];
// The spreadsheet's Instagram Base Package: 26 hours.
const base: Offer = { id: "b", name: "Base", kind: "monthly", price: 2500, items: [{ id: "1", label: "Work", hours: 26 }] };

describe("pricing rates", () => {
  const r = rates(settings, team, expenses);
  it("matches the spreadsheet's hourly rate", () => {
    expect(r.sheetRate).toBeCloseTo(90.2778, 3);
    expect(offerSummary(base, r).sheetPrice).toBeCloseTo(2347.22, 2);
  });
  it("works out a full-cost rate from salary, team pay, expenses and profit over everyone's hours", () => {
    expect(r.costs).toBeCloseTo(130000 / 12 + 3000);
    expect(r.needed).toBeCloseTo((130000 / 12 + 3000) / 0.8);
    expect(r.billable).toBe(200);
    expect(r.fullRate).toBeCloseTo(r.needed / 200);
  });
  it("says whether a price covers full cost, just your rate, or neither", () => {
    // Full cost here is about $86/hr, a little under the $90 rate.
    expect(offerSummary({ ...base, price: 2300 }, r).verdict).toBe("cost");
    expect(offerSummary(base, r).verdict).toBe("both");
    expect(offerSummary({ ...base, price: 1000 }, r).verdict).toBe("below");
    const solo = rates({ ...settings, teamHours: {} }, team, expenses);
    expect(offerSummary(base, solo).verdict).toBe("salary");
    expect(offerSummary({ ...base, price: null }, r).verdict).toBe("custom");
    expect(offerSummary(base, r).effectiveRate).toBeCloseTo(2500 / 26);
  });
  it("shows a dash with no hours instead of dividing by zero", () => {
    expect(rates({}).sheetRate).toBeNull();
    expect(rates({}).fullRate).toBeNull();
  });
  it("checks capacity against the hours you have", () => {
    const c = capacity([base, { ...base, id: "x", kind: "one_time" }], { b: 3 }, r);
    expect(c.used).toBe(78);
    expect(c.left).toBe(122);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0].room).toBe(4);
  });
  it("prices a quote option, monthly and one time, and rounds the suggestion up to $50", () => {
    const lines = [...offerLines(base), { id: "s", label: "Setup", hours: 10, once: true, cost: 100 }];
    const s = optionSummary({ id: "o", label: "Low", lines }, r);
    expect(s.monthly.hours).toBe(26);
    expect(s.once.cost).toBe(100);
    expect(s.monthly.suggested! % 50).toBe(0);
    expect(s.monthly.price).toBe(s.monthly.suggested);
    expect(optionSummary({ id: "o", label: "Low", lines, monthly: 3000 }, r).monthly.price).toBe(3000);
    expect(roundPrice(2301)).toBe(2350);
  });
});

describe("pricing saves", () => {
  it("keeps only sensible settings", () => {
    expect(cleanSettings({ salary: 130000, myHours: 500, evil: 1 })).toEqual({ salary: 130000, myHours: undefined });
    expect(cleanSettings("x")).toBeNull();
  });
  it("cleans offers and quotes", () => {
    const [o] = cleanOffers([{ id: "a", name: "", kind: "weird", price: "", items: [{ label: "x", hours: "3", cost: -5 }] }])!;
    expect(o).toMatchObject({ name: "Untitled offer", kind: "monthly", price: null, items: [{ label: "x", hours: 3 }] });
    const q = cleanQuote({ id: "q1", name: "Prospect", options: [] })!;
    expect(q.options).toHaveLength(1);
    expect(cleanQuote({ id: "bad id!" })!.id).not.toBe("bad id!");
  });
  it("makes a quote PDF without hours or rates", async () => {
    const { quotePdf } = await import("./quotePdf");
    const r = rates(settings, team, expenses);
    const bytes = await quotePdf({ agency: "Test Agency", date: "November 6, 2026", r,
      quote: { id: "q", name: "Sam", business: "Sample Co", created: "2026-11-06", options: [{ id: "o", label: "Middle", lines: offerLines(base) }] } });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
