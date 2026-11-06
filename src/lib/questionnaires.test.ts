import { describe, expect, it } from "vitest";
import { allIn, formTitle, inOrder, isForm, nextOpen, readForms } from "./questionnaires";

describe("questionnaires", () => {
  it("knows the three kinds", () => {
    expect(isForm("website")).toBe(true);
    expect(isForm("seo")).toBe(false);
    expect(isForm(null)).toBe(false);
    expect(formTitle("branding")).toBe("Branding questionnaire");
  });
  it("reads the ticked questionnaires in the standard order", () => {
    const f = new FormData();
    f.append("questionnaires", "branding");
    f.append("questionnaires", "social");
    f.append("questionnaires", "nope");
    expect(readForms(f)).toEqual(["social", "branding"]);
  });
  it("goes through what's waiting in order, and is done once everything's back", () => {
    const rows = [
      { form: "branding", submitted_at: null },
      { form: "social", submitted_at: "2026-11-01" },
      { form: "website", submitted_at: null },
    ];
    expect(inOrder(rows).map((r) => r.form)).toEqual(["social", "website", "branding"]);
    expect(nextOpen(rows)?.form).toBe("website");
    expect(allIn(rows)).toBe(false);
    expect(allIn(rows.map((r) => ({ ...r, submitted_at: "2026-11-05" })))).toBe(true);
    expect(nextOpen([])).toBeNull();
  });
});
