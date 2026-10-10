/**
 * Pure rules of the Manage templates editor: what is editable, what is kept, and what is sent on save.
 */
import { describe, it, expect } from "vitest";
import type { ResolvedEvalTemplateMetric } from "@/hooks/use-eval-report";
import type { SelectedMetric } from "@/components/events/MetricsSelector";
import { bothSingleLegRequired, SINGLE_LEG_CMJ_CODES, duplicateMetrics, toEditorState, toTemplateMetrics } from "../eval-template-editor";
import { TEMPLATE_METRIC_CODES } from "../../../../api/services/eval-report/template-keys";
import { SINGLE_LEG_CMJ_KEYS } from "../eval-template-labels";

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
  r("DASH_10", "DASH_10YD", { displayOrder: 1, customLabel: "Ten" }),
  r("GCT", "GCT", { displayOrder: 3, status: "missing", label: null, unit: null, category: null }),
  r("OLD", "OLD", { displayOrder: 4, status: "inactive", isRequired: false, customLabel: "Old test" }),
  r("COLLEGE_ONLY", "COLLEGE_ONLY", { displayOrder: 5, status: "unavailable" }),
  r("MOMENTUM", "MOMENTUM", { displayOrder: 6, status: "derived", isRequired: false }),
];

describe("toEditorState", () => {
  it("puts the available tests in the editable list, in displayOrder, keeping their stored key and label", () => {
    const { selected } = toEditorState(resolved);
    expect(selected.map((m) => [m.metricKey, m.code, m.isRequired])).toEqual([
      ["DASH_10", "DASH_10YD", true],
      ["FLY_10", "FLY10_TIME", true],
    ]);
    expect(selected[0]).toMatchObject({ label: "Ten", customLabel: "Ten" });
  });

  it("keeps missing, inactive and unavailable tests apart (never dropped) and lists derived ones separately", () => {
    const { unusable, derived } = toEditorState(resolved);
    expect(unusable.map((m) => m.metricKey)).toEqual(["GCT", "OLD", "COLLEGE_ONLY"]);
    expect(derived.map((m) => m.metricKey)).toEqual(["MOMENTUM"]);
  });
});

describe("toTemplateMetrics", () => {
  it("sends the editable list then the kept unusable tests, reindexed from 0; derived ones are left out", () => {
    const { selected, unusable } = toEditorState(resolved);
    expect(toTemplateMetrics(selected, unusable)).toEqual([
      { metricKey: "DASH_10", isRequired: true, displayOrder: 0, customLabel: "Ten" },
      { metricKey: "FLY_10", isRequired: true, displayOrder: 1 },
      { metricKey: "GCT", isRequired: true, displayOrder: 2 },
      { metricKey: "OLD", isRequired: false, displayOrder: 3, customLabel: "Old test" },
      { metricKey: "COLLEGE_ONLY", isRequired: true, displayOrder: 4 },
    ]);
  });

  it("keeps a reordered list's order, drops a removed unusable test, and sends a newly added test by its code", () => {
    const { selected, unusable } = toEditorState(resolved);
    const added: SelectedMetric = { code: "T_TEST", label: "T-test", isRequired: false };
    const out = toTemplateMetrics([selected[1], added, { ...selected[0], isRequired: false }], unusable.filter((m) => m.metricKey !== "OLD"));
    expect(out.map((m) => [m.metricKey, m.isRequired, m.displayOrder])).toEqual([
      ["FLY_10", true, 0],
      ["T_TEST", false, 1],
      ["DASH_10", false, 2],
      ["GCT", true, 3],
      ["COLLEGE_ONLY", true, 4],
    ]);
  });

  it("drops an empty or whitespace-only label and trims the rest", () => {
    const list: SelectedMetric[] = [
      { code: "A", label: "A", isRequired: true, customLabel: "   " },
      { code: "B", label: "B", isRequired: true, customLabel: "" },
      { code: "C", label: "C", isRequired: true, customLabel: "  Cee " },
    ];
    expect(toTemplateMetrics(list, [])).toEqual([
      { metricKey: "A", isRequired: true, displayOrder: 0 },
      { metricKey: "B", isRequired: true, displayOrder: 1 },
      { metricKey: "C", isRequired: true, displayOrder: 2, customLabel: "Cee" },
    ]);
  });
});

describe("duplicateMetrics", () => {
  it("copies only the tests available to the target organization and names the ones left out", () => {
    const { metrics, leftOut } = duplicateMetrics(resolved);
    expect(metrics).toEqual([
      { metricKey: "DASH_10", isRequired: true, displayOrder: 0, customLabel: "Ten" },
      { metricKey: "FLY_10", isRequired: true, displayOrder: 1 },
    ]);
    expect(leftOut.map((m) => m.metricKey)).toEqual(["GCT", "OLD", "COLLEGE_ONLY", "MOMENTUM"]);
  });
});

describe("single-leg CMJ", () => {
  it("uses the codes the API maps the two single-leg keys to", () => {
    expect(SINGLE_LEG_CMJ_CODES).toEqual(SINGLE_LEG_CMJ_KEYS.map((k) => TEMPLATE_METRIC_CODES[k]));
  });

  it("flags both sides required, not one side or both optional", () => {
    const [left, right] = SINGLE_LEG_CMJ_CODES;
    const m = (code: string, isRequired: boolean): SelectedMetric => ({ code, label: code, isRequired });
    expect(bothSingleLegRequired([m(left, true), m(right, true)])).toBe(true);
    expect(bothSingleLegRequired([m(left, true), m(right, false)])).toBe(false);
    expect(bothSingleLegRequired([m(left, false), m(right, false)])).toBe(false);
    expect(bothSingleLegRequired([m(left, true)])).toBe(false);
  });
});
