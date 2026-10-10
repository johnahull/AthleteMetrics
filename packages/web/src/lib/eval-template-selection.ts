/**
 * Rules for filling the new-event metrics list from an eval template (AM-FEAT-019).
 * Entries that came from the template carry `fromTemplate`; only those are ever replaced or removed,
 * so tests the coach picked by hand always stay.
 */
import type { ResolvedEvalTemplateMetric } from "@/hooks/use-eval-report";
import type { SelectedMetric } from "@/components/events/MetricsSelector";

function toSelected(m: ResolvedEvalTemplateMetric): SelectedMetric {
  return {
    code: m.code,
    label: m.customLabel ?? m.label ?? m.code,
    isRequired: m.isRequired,
    category: m.category ?? undefined,
    units: m.unit ?? undefined,
    ...(m.customLabel ? { customLabel: m.customLabel } : {}),
    fromTemplate: true,
  };
}

const byDisplayOrder = (a: ResolvedEvalTemplateMetric, b: ResolvedEvalTemplateMetric) => a.displayOrder - b.displayOrder;

export function clearTemplateEntries(list: SelectedMetric[]): SelectedMetric[] {
  return list.filter((m) => !m.fromTemplate);
}

/**
 * The template's required tests plus the ticked optional ones, in the template's order; unavailable tests never.
 * A test the user already added by hand is not duplicated and stays theirs (never removed with the template);
 * when it is also a REQUIRED test of the template, its isRequired is set to true.
 */
export function replaceTemplateEntries(list: SelectedMetric[], resolved: ResolvedEvalTemplateMetric[], includeOptional: string[] = []): SelectedMetric[] {
  const kept = clearTemplateEntries(list);
  const have = new Set(kept.map((m) => m.code));
  const wanted = resolved.filter((m) => m.status === "available" && (m.isRequired || includeOptional.includes(m.metricKey)));
  const requiredCodes = new Set(wanted.filter((m) => m.isRequired).map((m) => m.code));
  const entries = wanted.filter((m) => !have.has(m.code)).sort(byDisplayOrder).map(toSelected);
  return [...entries, ...kept.map((m) => (requiredCodes.has(m.code) && !m.isRequired ? { ...m, isRequired: true } : m))];
}

/**
 * Tick or untick one optional test. A test the user removed stays removed: nothing else is re-added here.
 * A new entry goes right after the last template entry; unticking never removes a hand-picked entry.
 */
export function setOptionalEntry(list: SelectedMetric[], resolved: ResolvedEvalTemplateMetric[], metricKey: string, checked: boolean): SelectedMetric[] {
  const metric = resolved.find((m) => m.metricKey === metricKey);
  if (!metric || metric.status !== "available") return list;
  if (!checked) return list.some((m) => m.fromTemplate && m.code === metric.code) ? list.filter((m) => !(m.fromTemplate && m.code === metric.code)) : list;
  if (list.some((m) => m.code === metric.code)) return list;
  let lastTemplate = -1;
  list.forEach((m, i) => {
    if (m.fromTemplate) lastTemplate = i;
  });
  const next = [...list];
  next.splice(lastTemplate + 1, 0, toSelected(metric));
  return next;
}

/** What the template lists but can not be added to the event, split by why */
export function unavailableTests(resolved: ResolvedEvalTemplateMetric[]) {
  const sorted = [...resolved].sort(byDisplayOrder);
  return {
    /** No such metric yet, switched off, or not offered to the organization's type */
    notAvailableYet: sorted.filter((m) => m.status === "missing" || m.status === "inactive" || m.status === "unavailable"),
    /** Computed from other tests; nothing to enter */
    calculated: sorted.filter((m) => m.status === "derived"),
  };
}
