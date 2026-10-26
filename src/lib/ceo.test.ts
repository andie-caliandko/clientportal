import { describe, expect, it } from "vitest";
import { canSeeCeo, dueDate, invoiceState, startedBy } from "./ceo";

describe("CEO dashboard", () => {
  it("is the owner's, plus admins they share it with", () => {
    const agency = { owner_id: "andie", ceo_shared_with: ["shayla"] };
    expect(canSeeCeo(agency, "andie", "admin")).toBe(true);
    expect(canSeeCeo(agency, "shayla", "admin")).toBe(true);
    expect(canSeeCeo(agency, "doni", "account_manager")).toBe(false);
    expect(canSeeCeo({ owner_id: "andie", ceo_shared_with: ["doni"] }, "doni", "account_manager")).toBe(false);
  });
  it("knows when an invoice is late", () => {
    expect(invoiceState(true, 1, "2026-10", "2026-10-20")).toBe("paid");
    expect(invoiceState(false, 15, "2026-10", "2026-10-10")).toBe("due");
    expect(invoiceState(false, 15, "2026-10", "2026-10-16")).toBe("late");
    expect(invoiceState(false, null, "2026-09", "2026-10-02")).toBe("late");
    expect(invoiceState(false, 1, "2026-11", "2026-10-02")).toBe("upcoming");
  });
  it("is never late before a retainer starts", () => {
    // Starts Jan 1, 2027, billed on the 15th.
    expect(invoiceState(false, 15, "2026-10", "2026-10-26", "2027-01-01")).toBe("upcoming");
    expect(startedBy("2027-01-01", "2026-10")).toBe(false);
    expect(startedBy("2027-01-01", "2027-01")).toBe(true);
    expect(startedBy(null, "2026-10")).toBe(true);
  });
  it("is due on the start date in the first month when they start after their billing day", () => {
    expect(dueDate(15, "2026-10", "2026-10-20")).toBe("2026-10-20");
    expect(invoiceState(false, 15, "2026-10", "2026-10-18", "2026-10-20")).toBe("due");
    expect(invoiceState(false, 15, "2026-10", "2026-10-21", "2026-10-20")).toBe("late");
    expect(dueDate(15, "2026-11", "2026-10-20")).toBe("2026-11-15");
  });
  it("follows a moved billing day", () => {
    expect(invoiceState(false, 15, "2026-10", "2026-10-26")).toBe("late");
    expect(invoiceState(false, 28, "2026-10", "2026-10-26")).toBe("due");
    expect(dueDate(31, "2026-11")).toBe("2026-11-30");
  });
});
