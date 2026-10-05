import { describe, expect, it } from "vitest";
import { contractEnd, contractStatus, renewalFlagDate, renewalStart } from "./contracts";

describe("contracts", () => {
  it("works out the end and the renewal date", () => {
    expect(contractEnd("2026-01-15", 6)).toBe("2026-07-14");
    expect(contractEnd("2026-10-01", 12)).toBe("2027-09-30");
    expect(renewalStart("2026-01-15", 6)).toBe("2026-07-15");
    // Month 5 of a 6-month contract.
    expect(renewalFlagDate("2026-01-15", 6)).toBe("2026-05-15");
    expect(renewalFlagDate("2026-10-01", 12)).toBe("2027-08-01");
  });
  it("knows where a client is in their contract", () => {
    const c = { start_date: "2026-05-01", months: 6, status: "active" };
    expect(contractStatus(c, "2026-07-10")).toMatchObject({ month: 3, state: "active" });
    expect(contractStatus(c, "2026-09-05")).toMatchObject({ month: 5, state: "renewal" });
    expect(contractStatus(c, "2026-10-25")).toMatchObject({ month: 6, state: "ending" });
    expect(contractStatus(c, "2026-11-02").state).toBe("ended");
    expect(contractStatus({ ...c, status: "renewed" }, "2026-10-25").state).toBe("renewed");
  });
});

describe("one-time projects", () => {
  it("follow up two weeks before they wrap up, with no renewal", () => {
    const p = { kind: "project", start_date: "2026-09-01", months: null, end_date: "2026-11-30", status: "active" };
    expect(contractStatus(p, "2026-10-10").state).toBe("active");
    expect(contractStatus(p, "2026-11-17")).toMatchObject({ state: "ending", flag: "2026-11-16" });
  });
});

describe("ongoing contracts", () => {
  it("count months with no end or renewal flag", () => {
    const o = { kind: "ongoing", start_date: "2026-03-10", months: null, end_date: null, status: "active" };
    expect(contractStatus(o, "2026-10-05")).toMatchObject({ month: 7, state: "active", end: null, flag: null });
    expect(contractStatus({ ...o, status: "ended" }, "2026-10-05").state).toBe("ended");
  });
});
