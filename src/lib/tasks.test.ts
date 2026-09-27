import { describe, expect, it } from "vitest";
import { isClientFacing } from "./tasks";

const t = (over: Partial<Parameters<typeof isClientFacing>[0]>) => ({ client_assignee_id: null, status: "todo", source: "manual", auto: false, ...over }) as Parameters<typeof isClientFacing>[0];

describe("isClientFacing", () => {
  it("shows tasks assigned to a client contact", () => {
    expect(isClientFacing(t({ client_assignee_id: "c1" }))).toBe(true);
  });
  it("shows the team's own tasks put in Waiting on client for everyone", () => {
    expect(isClientFacing(t({ status: "waiting" }))).toBe(true);
  });
  it("never shows automatic tasks, even in Waiting on client", () => {
    expect(isClientFacing(t({ status: "waiting", auto: true }))).toBe(false);
    expect(isClientFacing(t({ status: "waiting", auto: true, source: "scorecard" }))).toBe(false);
  });
  it("never shows approval reminders or ordinary team tasks", () => {
    expect(isClientFacing(t({ status: "waiting", source: "rella" }))).toBe(false);
    expect(isClientFacing(t({ status: "doing" }))).toBe(false);
  });
});
