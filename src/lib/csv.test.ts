import { describe, expect, it } from "vitest";
import { parseCsv, parseDate, parseMoney, readRevenueCsv } from "./csv";

describe("revenue spreadsheet", () => {
  it("reads quoted cells", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\n1,2,3')).toEqual([["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  });
  it("reads dates and money in common formats", () => {
    expect(parseDate("2026-03-15")).toBe("2026-03-15");
    expect(parseDate("3/5/2026")).toBe("2026-03-05");
    expect(parseDate("3/5/26")).toBe("2026-03-05");
    expect(parseDate("2/30/2026")).toBeNull();
    expect(parseMoney("$1,250.00")).toBe(1250);
    expect(parseMoney("(300)")).toBe(-300);
    expect(parseMoney("n/a")).toBeNull();
  });
  it("finds columns by header in any order, and skips lines it can't read", () => {
    const csv = "Client,Amount,Date Paid,Memo\nDavid T Harris LLC,\"$2,500\",1/15/2026,January retainer\nTotal,9000,,\nSyli,1800,2026-02-01,";
    const { rows, skipped } = readRevenueCsv(csv);
    expect(rows).toEqual([
      { paid_on: "2026-01-15", amount: 2500, client_name: "David T Harris LLC", note: "January retainer" },
      { paid_on: "2026-02-01", amount: 1800, client_name: "Syli", note: null },
    ]);
    expect(skipped).toBe(1);
  });
  it("works without headers (date, amount, client)", () => {
    expect(readRevenueCsv("2026-03-01,1200,Epting Events").rows[0]).toMatchObject({ paid_on: "2026-03-01", amount: 1200, client_name: "Epting Events" });
  });
});
