/**
 * Machine-readable warnings for derived totals that could not be recalculated after
 * a source write committed (issue #526). The source write still succeeds; the warning
 * tells the client the derived total (e.g. MQI_TOTAL) may be missing or stale so it can
 * prompt a retry. The admin reconcile action (derived-total-reconciliation.ts) repairs
 * such totals in bulk.
 */

export interface DerivedTotalWarning {
  code: 'DERIVED_TOTAL_STALE';
  /** The derived total that is stale when known, else the source metric that was written. */
  metric: string;
  /** Calendar date (YYYY-MM-DD) of the affected total. */
  date: string;
  /** The athlete whose total is affected. */
  userId: string;
}

/** A per-derived-metric failure recorded by DerivedMetricCalculator. */
export interface DerivedCalcFailure {
  metric: string;
  date: string | null;
  userId: string;
}

export function staleWarning(metric: string, date: string, userId: string): DerivedTotalWarning {
  return { code: 'DERIVED_TOTAL_STALE', metric, date, userId };
}

/**
 * Warnings for failures the calculator swallowed internally. Tolerates objects without
 * getFailures (test doubles) and ignores failures with no single date.
 */
export function warningsFromCalculator(calculator: {
  getFailures?: () => DerivedCalcFailure[];
}): DerivedTotalWarning[] {
  const failures = calculator.getFailures?.() ?? [];
  return failures.filter((f) => f.date).map((f) => staleWarning(f.metric, f.date as string, f.userId));
}

export function dedupeWarnings(warnings: DerivedTotalWarning[]): DerivedTotalWarning[] {
  const seen = new Set<string>();
  return warnings.filter((w) => {
    const key = `${w.userId}|${w.metric}|${w.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Additive: the `warnings` field is only present when there is something to report. */
export function withWarnings<T extends object>(
  value: T,
  warnings: DerivedTotalWarning[]
): T & { warnings?: DerivedTotalWarning[] } {
  return warnings.length > 0 ? { ...value, warnings: dedupeWarnings(warnings) } : value;
}
