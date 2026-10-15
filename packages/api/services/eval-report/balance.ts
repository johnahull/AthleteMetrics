import { lsiPercent } from "./derived";
import { BALANCE_LABELS } from "./copy";

export type BalanceStatus = "balanced" | "keep_an_eye" | "worth_working_on" | "neutral";

export interface BalanceLine {
  status: BalanceStatus;
  label: string;
  /** Intentionally the raw, unrounded value; classification uses the rounded one. */
  lsiPercent: number;
}

/** A left-right gap over this many seconds is "worth working on" even when the percentage is 90 or more. */
const MAX_GAP_SECONDS = 0.15;
/** Absorbs floating-point noise so a gap of exactly 0.15s does not trigger. */
const GAP_EPSILON = 1e-9;
const BALANCED_MIN = 95;
const KEEP_AN_EYE_MIN = 90;

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * Fresh & Healthy "Balance" line from the 5-0-5 left/right bests (AM-FEAT-019 Part 4). Omitted (null)
 * unless both legs were tested. Without an LSI tier set for the athlete the value is shown with
 * a neutral label and no judgement (hasTierSet comes from hasLsiTierSet: an LSI set for the athlete's sex
 * within the set's own age bounds, if any). The wording never mentions risk or injury.
 */
export function balanceLine(args: {
  left: number | null;
  right: number | null;
  hasTierSet: boolean;
}): BalanceLine | null {
  const { left, right, hasTierSet } = args;
  if (left === null || right === null) return null;
  const raw = lsiPercent(left, right);
  if (raw === null) return null;
  const pct = round(raw, 3);

  let status: BalanceStatus = "neutral";
  if (hasTierSet) {
    const gap = Math.abs(left - right);
    if (pct < KEEP_AN_EYE_MIN || gap > MAX_GAP_SECONDS + GAP_EPSILON) status = "worth_working_on";
    else if (pct < BALANCED_MIN) status = "keep_an_eye";
    else status = "balanced";
  }
  return { status, label: BALANCE_LABELS[status], lsiPercent: raw };
}
