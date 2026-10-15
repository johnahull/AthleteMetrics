/**
 * Rules of the Manage templates editor (AM-FEAT-019).
 * Only tests that resolve as `available` are editable (the metrics selector needs a site metric); missing, inactive
 * and not-offered tests are kept as they are until the user removes them; derived ones are dropped on save (the API
 * rejects them). Tests loaded from the template keep their stored key; a test added in the editor is sent by its code,
 * which the API stores as the logical key.
 */
import type { EvalTemplateMetric, ResolvedEvalTemplateMetric } from "@/hooks/use-eval-report";
import type { SelectedMetric } from "@/components/events/MetricsSelector";
import { toSelected } from "./eval-template-selection";

/** site_metrics codes of the two single-leg CMJ sides (template keys CMJ_SL_LEFT / CMJ_SL_RIGHT) */
export const SINGLE_LEG_CMJ_CODES = ["JUMP_CMJ_SL_L", "JUMP_CMJ_SL_R"] as const;

const byDisplayOrder = (a: ResolvedEvalTemplateMetric, b: ResolvedEvalTemplateMetric) => a.displayOrder - b.displayOrder;

export function toEditorState(resolved: ResolvedEvalTemplateMetric[]) {
  const sorted = [...resolved].sort(byDisplayOrder);
  return {
    selected: sorted.filter((m) => m.status === "available").map((m): SelectedMetric => ({ ...toSelected(m), metricKey: m.metricKey })),
    /** Kept on save until removed: no such metric, switched off, or not offered to the organization's type */
    unusable: sorted.filter((m) => m.status === "missing" || m.status === "inactive" || m.status === "unavailable"),
    /** Calculated from other tests: never a template test, dropped on save */
    derived: sorted.filter((m) => m.status === "derived"),
  };
}

function entry(metricKey: string, isRequired: boolean, displayOrder: number, customLabel?: string): EvalTemplateMetric {
  const label = customLabel?.trim();
  return { metricKey, isRequired, displayOrder, ...(label ? { customLabel: label } : {}) };
}

/** What PATCH sends: the editable list in its order, then the kept unusable tests; displayOrder 0..n */
export function toTemplateMetrics(selected: SelectedMetric[], unusable: ResolvedEvalTemplateMetric[]): EvalTemplateMetric[] {
  return [
    ...selected.map((m) => ({ key: m.metricKey ?? m.code, isRequired: m.isRequired, customLabel: m.customLabel })),
    ...unusable.map((m) => ({ key: m.metricKey, isRequired: m.isRequired, customLabel: m.customLabel })),
  ].map((m, i) => entry(m.key, m.isRequired, i, m.customLabel));
}

/** A copy for another organization: only the tests available there (resolved against it), and the ones left out */
export function duplicateMetrics(resolved: ResolvedEvalTemplateMetric[]) {
  const sorted = [...resolved].sort(byDisplayOrder);
  return {
    metrics: sorted.filter((m) => m.status === "available").map((m, i) => entry(m.metricKey, m.isRequired, i, m.customLabel)),
    leftOut: sorted.filter((m) => m.status !== "available"),
  };
}

/** The API answers 400 when both single-leg sides are required */
export function bothSingleLegRequired(selected: SelectedMetric[]): boolean {
  return SINGLE_LEG_CMJ_CODES.every((code) => selected.some((m) => m.code === code && m.isRequired));
}
