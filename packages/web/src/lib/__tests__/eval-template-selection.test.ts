/**
 * Pure rules for filling the new-event metrics list from an eval template.
 * Only entries that came from the template (fromTemplate) are ever replaced or removed; hand-picked ones stay.
 */
import { describe, it, expect } from "vitest";
import type { ResolvedEvalTemplateMetric } from "@/hooks/use-eval-report";
import type { SelectedMetric } from "@/components/events/MetricsSelector";
import {
  clearTemplateEntries,
  replaceTemplateEntries,
  setOptionalEntry,
  unavailableTests,
} from "../eval-template-selection";

const r = (metricKey: string, code: string, extra: Partial<ResolvedEvalTemplateMetric> = {}): ResolvedEvalTemplateMetric => ({
  metricKey,
  code,
  label: `Label ${code}`,
  unit: "s",
  category: "speed",
  isRequired: true,
  displayOrder: 0,
  status: "available",
  ...extra,
});

const resolved: ResolvedEvalTemplateMetric[] = [
  r("FLY_10", "FLY10_TIME", { displayOrder: 2 }),
  r("DASH_10", "DASH_10YD", { displayOrder: 1 }),
  r("STRENGTH_SQUAT", "SQUAT_1RM", { displayOrder: 3, isRequired: false, unit: "lb", category: "strength" }),
  r("CMJ_SL_LEFT", "JUMP_CMJ_SL_L", { displayOrder: 4, isRequired: false }),
  r("GCT", "GCT", { displayOrder: 5, status: "missing", label: null, unit: null, category: null }),
  r("OLD", "OLD", { displayOrder: 6, status: "inactive", isRequired: false }),
  r("MOMENTUM", "MOMENTUM", { displayOrder: 7, status: "derived", isRequired: false }),
];

const hand = (code: string): SelectedMetric => ({ code, label: code, isRequired: false });
const codes = (list: SelectedMetric[]) => list.map((m) => m.code);

describe("replaceTemplateEntries", () => {
  it("adds the available required tests in displayOrder, mapped to selected metrics", () => {
    const list = replaceTemplateEntries([], resolved, []);
    expect(codes(list)).toEqual(["DASH_10YD", "FLY10_TIME"]);
    expect(list[0]).toEqual({ code: "DASH_10YD", label: "Label DASH_10YD", isRequired: true, category: "speed", units: "s", fromTemplate: true });
  });

  it("adds ticked optional tests too, never an unavailable one", () => {
    const list = replaceTemplateEntries([], resolved, ["STRENGTH_SQUAT", "OLD", "MOMENTUM", "GCT"]);
    expect(codes(list)).toEqual(["DASH_10YD", "FLY10_TIME", "SQUAT_1RM"]);
    expect(list[2]).toMatchObject({ isRequired: false, category: "strength", units: "lb" });
  });

  it("replaces the previous template entries and keeps hand-picked ones", () => {
    const before = replaceTemplateEntries([hand("T_TEST")], [r("X", "OLD_TPL_CODE")], []);
    expect(codes(before)).toEqual(["OLD_TPL_CODE", "T_TEST"]);
    const after = replaceTemplateEntries(before, resolved, []);
    expect(codes(after)).toEqual(["DASH_10YD", "FLY10_TIME", "T_TEST"]);
  });

  it("does not duplicate a test the user already added by hand, and leaves that entry theirs", () => {
    const after = replaceTemplateEntries([hand("DASH_10YD")], resolved, []);
    expect(codes(after).filter((c) => c === "DASH_10YD")).toHaveLength(1);
    expect(after.find((m) => m.code === "DASH_10YD")?.fromTemplate).toBeUndefined();
    expect(codes(clearTemplateEntries(after))).toEqual(["DASH_10YD"]);
  });

  it("uses the template's own label when it has one, and carries it as customLabel", () => {
    const list = replaceTemplateEntries([], [r("CMJ_HOH", "JUMP_CMJ_HOH", { customLabel: "CMJ" })], []);
    expect(list[0]).toMatchObject({ label: "CMJ", customLabel: "CMJ" });
  });
});

describe("clearTemplateEntries", () => {
  it("removes only template entries", () => {
    const list = replaceTemplateEntries([hand("T_TEST")], resolved, ["STRENGTH_SQUAT"]);
    expect(codes(clearTemplateEntries(list))).toEqual(["T_TEST"]);
  });
});

describe("setOptionalEntry", () => {
  it("ticking adds the test after the template entries, before hand-picked ones", () => {
    const list = replaceTemplateEntries([hand("T_TEST")], resolved, []);
    expect(codes(setOptionalEntry(list, resolved, "STRENGTH_SQUAT", true))).toEqual(["DASH_10YD", "FLY10_TIME", "SQUAT_1RM", "T_TEST"]);
  });

  it("unticking removes it", () => {
    const list = replaceTemplateEntries([], resolved, ["STRENGTH_SQUAT"]);
    expect(codes(setOptionalEntry(list, resolved, "STRENGTH_SQUAT", false))).toEqual(["DASH_10YD", "FLY10_TIME"]);
  });

  it("does not bring back a required test the user removed", () => {
    const list = replaceTemplateEntries([], resolved, []).filter((m) => m.code !== "DASH_10YD");
    expect(codes(setOptionalEntry(list, resolved, "STRENGTH_SQUAT", true))).toEqual(["FLY10_TIME", "SQUAT_1RM"]);
  });

  it("does not duplicate a test already on the list, and never removes a hand-picked one", () => {
    const list = [hand("SQUAT_1RM")];
    expect(setOptionalEntry(list, resolved, "STRENGTH_SQUAT", true)).toBe(list);
    expect(codes(setOptionalEntry(list, resolved, "STRENGTH_SQUAT", false))).toEqual(["SQUAT_1RM"]);
  });

  it("ignores an unavailable or unknown test", () => {
    const list = [hand("T_TEST")];
    expect(setOptionalEntry(list, resolved, "MOMENTUM", true)).toBe(list);
    expect(setOptionalEntry(list, resolved, "NOPE", true)).toBe(list);
  });

  it("puts the first template entry at the start when none is left", () => {
    expect(codes(setOptionalEntry([hand("T_TEST")], resolved, "STRENGTH_SQUAT", true))).toEqual(["SQUAT_1RM", "T_TEST"]);
  });
});

describe("unavailableTests", () => {
  it("splits what the template lists but can not be added into not-yet-available and calculated ones", () => {
    const out = unavailableTests(resolved);
    expect(out.notAvailableYet.map((m) => m.metricKey)).toEqual(["GCT", "OLD"]);
    expect(out.calculated.map((m) => m.metricKey)).toEqual(["MOMENTUM"]);
  });
});
