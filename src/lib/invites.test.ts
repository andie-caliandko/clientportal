import { describe, expect, it } from "vitest";
import { inviteExpiry, inviteProblem, inviteReminderDue } from "./invites";

const sent = new Date("2026-11-10T15:00:00Z");
const expires = inviteExpiry(sent).toISOString();
const at = (days: number) => new Date(sent.getTime() + days * 86_400_000);

describe("portal invites", () => {
  it("last a week", () => {
    expect(expires).toBe("2026-11-17T15:00:00.000Z");
  });
  it("send one reminder 2 days before the link expires", () => {
    expect(inviteReminderDue(expires, 0, at(4.9))).toBe(false);
    expect(inviteReminderDue(expires, 0, at(5))).toBe(true);
    expect(inviteReminderDue(expires, 0, at(6.9))).toBe(true);
    expect(inviteReminderDue(expires, 1, at(6))).toBe(false);
    expect(inviteReminderDue(expires, 0, at(7))).toBe(false);
    expect(inviteReminderDue(null, 0, at(6))).toBe(false);
  });
  it("only work while they're unused and unexpired", () => {
    expect(inviteProblem({ joined_at: null, invite_expires_at: expires }, at(6))).toBeNull();
    expect(inviteProblem({ joined_at: null, invite_expires_at: expires }, at(7))).toBe("expired");
    expect(inviteProblem({ joined_at: "2026-11-11", invite_expires_at: expires }, at(1))).toBe("joined");
    expect(inviteProblem(null)).toBe("invalid");
  });
});
