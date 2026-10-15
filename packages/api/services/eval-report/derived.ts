import { metricCode } from "./metric-key-map";

const positive = (n: number) => Number.isFinite(n) && n > 0;

/** 5-0-5 limb symmetry index: faster leg / slower leg x 100 (matches the AGILITY_505_M_LSI formula). */
export function lsiPercent(left: number, right: number): number | null {
  if (!positive(left) || !positive(right)) return null;
  return (Math.min(left, right) / Math.max(left, right)) * 100;
}

/** Single-leg CMJ asymmetry: abs(L - R) / higher x 100. */
export function cmjAsymmetryPercent(left: number, right: number): number | null {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const higher = Math.max(left, right);
  if (higher <= 0) return null;
  return (Math.abs(left - right) / higher) * 100;
}

/** 10 m as a fraction of the 10 yd to 20 yd split: (10 - 9.144) / 9.144 (migration 0161). */
const TEN_M_INTERP = 0.0936;

/** Stored derived totals the report does not recompute (other protocols); never shown, never offered. */
const UNRECOMPUTED_DERIVED = ["AGILITY_505_YD_LSI", "AGILITY_COD_DEFICIT_YD", "AGILITY_COD_DEFICIT_M"];

/**
 * Recompute the derived values from the event's own bests so the report agrees with the numbers it shows.
 * A stored derived total is replaced, or dropped when an input is missing. Formulas follow the seed
 * migrations: LSI (0144), EUR = CMJ / squat jump (0135), COD deficit = faster meter 5-0-5 leg - interpolated
 * 10 m time, DASH_10YD + 0.0936 x (DASH_20YD - DASH_10YD) (0161).
 * The headline 5-0-5 is the faster leg, or the better of that and a directly recorded 5-0-5.
 * Meter 5-0-5 codes only; a yard 5-0-5 code is never mixed in.
 */
export function recomputeDerived(bests: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map(bests);
  for (const stored of UNRECOMPUTED_DERIVED) out.delete(stored);
  const code = (key: Parameters<typeof metricCode>[0]) => metricCode(key);
  const get = (key: Parameters<typeof metricCode>[0]) => bests.get(code(key));
  const set = (key: Parameters<typeof metricCode>[0], value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) out.delete(code(key));
    else out.set(code(key), value);
  };
  const both = <T>(a: number | undefined, b: number | undefined, f: (x: number, y: number) => T): T | null =>
    a !== undefined && b !== undefined ? f(a, b) : null;

  const left = get("505_LEFT");
  const right = get("505_RIGHT");
  const fasterLeg = both(left, right, Math.min);

  set("505_LSI", both(left, right, lsiPercent));
  set("CMJ_SL_ASYM", both(get("CMJ_SL_LEFT"), get("CMJ_SL_RIGHT"), cmjAsymmetryPercent));
  set("EUR", both(get("CMJ_HOH"), get("SQUAT_JUMP"), (cmj, sj) => (sj > 0 ? cmj / sj : null)));
  const dash10 = get("DASH_10");
  const dash20 = get("DASH_20");
  // Best 10 yd and best 20 yd can come from different reps (same known limit as migration 0161)
  const tenMetre = both(dash10, dash20, (d10, d20) => d10 + TEN_M_INTERP * (d20 - d10));
  set("COD_DEFICIT", both(fasterLeg ?? undefined, tenMetre ?? undefined, (leg, tenM) => leg - tenM));

  const direct = get("505");
  if (fasterLeg !== null) set("505", direct === undefined ? fasterLeg : Math.min(direct, fasterLeg));
  return out;
}
