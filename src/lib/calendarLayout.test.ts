import { describe, expect, it } from "vitest";
import { layoutDay } from "./calendarLayout";

const pos = (r: { id: string; col: number; cols: number }[]) => Object.fromEntries(r.map((e) => [e.id, `${e.col}/${e.cols}`]));

describe("layoutDay", () => {
  it("gives separate events the full width", () => {
    expect(pos(layoutDay([{ id: "a", start: 9, end: 10 }, { id: "b", start: 10, end: 11 }]))).toEqual({ a: "0/1", b: "0/1" });
  });
  it("puts overlapping events side by side", () => {
    expect(pos(layoutDay([{ id: "a", start: 9, end: 10 }, { id: "b", start: 9, end: 10 }, { id: "c", start: 9.5, end: 11 }]))).toEqual({ a: "0/3", b: "1/3", c: "2/3" });
  });
  it("reuses a column once it frees up", () => {
    expect(pos(layoutDay([{ id: "a", start: 9, end: 12 }, { id: "b", start: 9, end: 10 }, { id: "c", start: 10.5, end: 11 }]))).toEqual({ a: "0/2", b: "1/2", c: "1/2" });
  });
});
