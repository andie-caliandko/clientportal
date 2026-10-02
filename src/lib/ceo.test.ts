import { describe, expect, it } from "vitest";
import { canSeeCeo, invoiceState } from "./ceo";

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
});
