import { describe, expect, it } from "vitest";
import { nextInviteReminder } from "./invites";

describe("invite reminders", () => {
  it("reminds at 48 hours, then a week later, then stops", () => {
    expect(nextInviteReminder("2026-10-01T15:00:00Z", 0, null)?.toISOString()).toBe("2026-10-03T15:00:00.000Z");
    expect(nextInviteReminder("2026-10-01T15:00:00Z", 1, "2026-10-03T15:05:00Z")?.toISOString()).toBe("2026-10-10T15:05:00.000Z");
    expect(nextInviteReminder("2026-10-01T15:00:00Z", 2, "2026-10-10T15:05:00Z")).toBeNull();
  });
});
