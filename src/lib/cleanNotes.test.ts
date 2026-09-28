import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./supabase/server", () => ({ createAdminClient: () => ({}) }));
vi.mock("next/cache", () => ({ unstable_cache: (f: unknown) => f, revalidateTag: () => {} }));
const { cleanNotes } = await import("./google");

describe("cleanNotes", () => {
  it("removes invoice links and lines", () => {
    const raw = "Kickoff call with Josh\nView your invoice: https://portal.dubsado.com/public/invoice/abc123\nAgenda: goals";
    expect(cleanNotes(raw)).toBe("Kickoff call with Josh\nAgenda: goals");
  });
  it("turns Google's HTML into text and drops invoice anchors", () => {
    const raw = 'Hello<br>See <a href="https://x.dubsado.com/invoice/9">your invoice</a><br><a href="https://meet.google.com/abc">Join</a>';
    expect(cleanNotes(raw)).toBe("Hello\nJoin https://meet.google.com/abc");
  });
  it("returns nothing when only an invoice was there", () => {
    expect(cleanNotes("Invoice: https://dubsado.com/invoice/1")).toBeNull();
  });
});
