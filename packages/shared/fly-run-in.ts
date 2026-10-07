/**
 * FLY10 run-in variants (AM-FEAT-017). The metric code is authoritative for the
 * run-in distance; a supplied flyInDistance that disagrees is rejected.
 * FLY10M_TIME (meters) has no variants and is never checked.
 */
import { MeasurementValueValidationError } from './measurement-value-validation';

export const FLY10_RUN_IN_YD: Readonly<Record<string, number>> = {
  FLY10_TIME_RI5: 5,
  FLY10_TIME_RI10: 10,
  FLY10_TIME_RI15: 15,
  FLY10_TIME: 20,
  FLY10_TIME_RI30: 30,
};

type FlyInValue = number | string | null | undefined;

const isBlank = (v: FlyInValue): v is null | undefined => v === null || v === undefined || v === '';

/** Numeric comparison: exports write '20.000000', and 7.5 must not equal 7. */
const sameDistance = (a: FlyInValue, b: FlyInValue): boolean => {
  if (isBlank(a) || isBlank(b)) return isBlank(a) && isBlank(b);
  return toNumber(a) === toNumber(b);
};

/** Strict numeric parse: '20abc' and '' are NaN, not 20 and 0. */
const toNumber = (v: FlyInValue): number => (typeof v === 'number' ? v : Number(String(v).trim()));

/**
 * Route input (CSV cell or JSON body value) -> value for the checker and storage.
 * Blank is "not supplied"; numeric text keeps its fraction (20.4 is not 20).
 * Garbage becomes NaN on a fly code (so the checker rejects it) and is dropped otherwise.
 */
export function parseFlyInInput(metric: string, raw: FlyInValue): number | undefined {
  if (isBlank(raw) || String(raw).trim() === '') return undefined;
  const n = toNumber(raw);
  if (Number.isFinite(n)) return n;
  return FLY10_RUN_IN_YD[metric] !== undefined ? NaN : undefined;
}

/** Null/undefined/blank is accepted; anything else must equal the code's run-in. */
export function assertFlyInDistanceMatches(metric: string, flyInDistance: FlyInValue): void {
  const expected = FLY10_RUN_IN_YD[metric];
  if (expected === undefined || isBlank(flyInDistance)) return;
  if (toNumber(flyInDistance) !== expected) {
    throw new MeasurementValueValidationError(
      `Fly-in distance must be ${expected} yd for ${metric} (or left blank); the metric sets the run-in`,
      'flyInDistance',
    );
  }
}

/**
 * Update check on the effective (metric, flyInDistance) pair. Only runs when the
 * request changes the metric or supplies a different flyInDistance, so legacy
 * rows (e.g. FLY10_TIME storing 10) stay editable.
 */
export function assertFlyInDistanceOnUpdate(
  existing: { metric: string; flyInDistance?: FlyInValue },
  patch: { metric?: string | null; flyInDistance?: FlyInValue },
): void {
  const metricChanged = !!patch.metric && patch.metric !== existing.metric;
  const flyInChanged = patch.flyInDistance !== undefined && !sameDistance(patch.flyInDistance, existing.flyInDistance);
  if (!metricChanged && !flyInChanged) return;
  const metric = patch.metric || existing.metric;
  const flyIn = patch.flyInDistance !== undefined ? patch.flyInDistance : existing.flyInDistance;
  assertFlyInDistanceMatches(metric, flyIn);
}

/** Display text for a measurement's fly-in distance: the code's run-in for fly codes, else the stored value. */
export function formatFlyInDistance(metric: string, stored: FlyInValue): string {
  const runIn = FLY10_RUN_IN_YD[metric];
  if (runIn !== undefined) return `${runIn}yd`;
  return isBlank(stored) || stored === 0 ? '-' : `${stored}yd`;
}
