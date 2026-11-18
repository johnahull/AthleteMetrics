/**
 * Defined relationships between metrics, and same-run split facts, for the insights prompt. Computed in code so the model
 * narrates a connection instead of inventing one. A relationship fires only when every input is present (silent otherwise)
 * and its text is a code constant with no numbers. Starts with the four of the head of performance's Appendix B; more only
 * after the eval set shows the gaps.
 *
 * Split math uses only rows of ONE run (calculationMetadata.runId). The report's best-per-code values come from
 * different runs and must never feed it. Codes are listed here on purpose (not imported from EVAL_METRIC_CODES, which
 * lacks several of them).
 */
import type { SprintRunMeasurement } from "@shared/report-sprint-runs-types";

/** Gate times in seconds of one run at 10, 20, 30 and 40 yards. */
export type SameRunSplits = Record<10 | 20 | 30 | 40, number>;

export interface RelationshipInput {
  /** Best value per code; never used for split math */
  values: Record<string, number>;
  /** Benchmark standing per code: 'slow' = bottom tier (or low percentile), 'good' = above it; absent = unknown */
  standing: Record<string, "slow" | "good">;
  /** Unit per code (jump relationships need inches) */
  units?: Record<string, string>;
  splits?: SameRunSplits;
}

export interface Relationship {
  id: string;
  metrics: string[];
  when: (input: RelationshipInput) => boolean;
  text: string;
}

// Thresholds. [J] = a value for the head of performance (John) to confirm or change.
/** [J] Two late intervals this close are one speed level: about the timing-gate error. */
export const LEVEL_OFF_TOLERANCE_S = 0.02;
/** [J] The last interval this much faster than the one before it: still speeding up at the end. */
export const STILL_GAINING_DELTA_S = 0.05;
/** EUR (jump with a dip over jump from a pause) under this means little gain from the dip. */
export const EUR_LOW = 1.05;
/** [J] Jump with a dip minus paused-squat jump at most this many inches: about one test-retest error. */
export const DIP_GAIN_MAX_IN = 0.5;
/** [J] 5-10-5 minus the 20-yard dash at least this many seconds: the turns, not the straight speed, cost time. */
export const TURN_COST_MIN_S = 1.8;
/** [J] Without a tier, a percentile under this is slow and one at or over GOOD_PERCENTILE is good; in between is unknown. */
export const SLOW_PERCENTILE = 25;
export const GOOD_PERCENTILE = 50;

const START_YD = "DASH_10YD";
const TWENTY_YD = "DASH_20YD";
const LATE_SPEED_CODES = ["FLY10_TIME", "FLY10_TIME_RI5", "FLY10_TIME_RI10", "FLY10_TIME_RI15", "FLY10_TIME_RI30", "TOP_SPEED", "TOP_SPEED_MPH"];
const EUR_CODES = ["POWER_EUR", "EUR"];
const CMJ = "JUMP_CMJ_HOH";
const SJ = "JUMP_SJ_HEIGHT";
const AGILITY_5105 = "AGILITY_5105";

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const EPS = 1e-9;

/** The last two 10-yard intervals of a run: yards 20-30 and 30-40. */
const lateIntervals = (s: SameRunSplits) => ({ a: round3(s[30] - s[20]), b: round3(s[40] - s[30]) });

export const RELATIONSHIPS: Relationship[] = [
  {
    id: "start-costs-time",
    metrics: [START_YD, ...LATE_SPEED_CODES],
    when: ({ standing }) => standing[START_YD] === "slow" && LATE_SPEED_CODES.some((c) => standing[c] === "good"),
    text: "Top speed is fine for the group; the first steps are where time is lost. This does not by itself show a technique fault.",
  },
  {
    id: "speed-levels-off",
    metrics: ["DASH_20YD", "DASH_30YD", "DASH_40YD"],
    when: ({ splits }) => {
      if (!splits) return false;
      const { a, b } = lateIntervals(splits);
      return Math.abs(a - b) <= LEVEL_OFF_TOLERANCE_S + EPS;
    },
    text: "Speed stopped rising around the middle of the run, so top speed itself is the next thing to build. One run does not show whether the athlete can hold that speed over a longer distance.",
  },
  {
    id: "speed-still-gaining",
    metrics: ["DASH_20YD", "DASH_30YD", "DASH_40YD"],
    when: ({ splits }) => {
      if (!splits) return false;
      const { a, b } = lateIntervals(splits);
      return a - b >= STILL_GAINING_DELTA_S - EPS;
    },
    text: "The athlete was still speeding up at the end of the run, so a longer run may show more. One run does not show how long that speed can be held.",
  },
  {
    id: "no-gain-from-dip",
    metrics: [...EUR_CODES, CMJ, SJ],
    when: ({ values, units }) => {
      const eur = EUR_CODES.map((c) => values[c]).find((v) => v !== undefined);
      const cmj = values[CMJ];
      const sj = values[SJ];
      if (eur === undefined || cmj === undefined || sj === undefined) return false;
      if (units?.[CMJ]?.toLowerCase() !== "in" || units?.[SJ]?.toLowerCase() !== "in") return false;
      return eur < EUR_LOW && round3(cmj - sj) <= DIP_GAIN_MAX_IN + EPS;
    },
    text: "Both jumps were about the same, so the athlete is not gaining from the dip yet. We will retest fresh. This does not show a spring deficit, a strength need or what to train.",
  },
  {
    id: "turns-cost-time",
    metrics: [AGILITY_5105, TWENTY_YD],
    when: ({ values, standing }) => {
      const turns = values[AGILITY_5105];
      const straight = values[TWENTY_YD];
      if (turns === undefined || straight === undefined || standing[TWENTY_YD] !== "good") return false;
      return round3(turns - straight) >= TURN_COST_MIN_S - EPS;
    },
    text: "Straight speed is fine; the turns cost time. This does not show a mobility problem.",
  },
];

/** Relationships that fire for this athlete, in definition order. */
export function firedRelationships(input: RelationshipInput): Relationship[] {
  return RELATIONSHIPS.filter((r) => r.when(input));
}

/**
 * Gate times of one complete run (10, 20, 30 and 40 yards, all verified rows with the same runId); the run with the
 * fastest 40 when several are complete. Rows without a run id are never used: they are pools of best values.
 */
export function sameRunSplits(rows: readonly SprintRunMeasurement[] | undefined): SameRunSplits | undefined {
  const runs = new Map<string, Partial<Record<10 | 20 | 30 | 40, number>>>();
  for (const r of rows ?? []) {
    const runId = r.calculationMetadata?.runId;
    const m = /^DASH_(10|20|30|40)YD$/.exec(r.metric);
    const time = parseFloat(r.value);
    if (!runId || !m || !r.isVerified || !Number.isFinite(time) || time <= 0) continue;
    const d = Number(m[1]) as 10 | 20 | 30 | 40;
    const run = runs.get(runId) ?? {};
    run[d] = run[d] === undefined ? time : Math.min(run[d]!, time);
    runs.set(runId, run);
  }
  let best: SameRunSplits | undefined;
  for (const run of runs.values()) {
    if (run[10] === undefined || run[20] === undefined || run[30] === undefined || run[40] === undefined) continue;
    const complete = run as SameRunSplits;
    if (!best || complete[40] < best[40]) best = complete;
  }
  return best;
}

const YD_PER_S_TO_MPH = 2.04545; // 3 ft per yard, 3600 s over 5280 ft

/** Fact lines for the prompt: interval times of the run and the fastest 10 yards with its speed ("about"). Silent on odd data. */
export function splitFacts(s: SameRunSplits): string[] {
  const t = [s[10], round3(s[20] - s[10]), round3(s[30] - s[20]), round3(s[40] - s[30])];
  if (t.some((x) => !(x > 0))) return [];
  const f = (x: number) => `${x.toFixed(2)} s`;
  const fastest = Math.min(...t);
  const from = [0, 10, 20, 30][t.indexOf(fastest)];
  const range = from === 0 ? "the first 10 yards" : `yards ${from}-${from + 10}`;
  const mph = (10 / fastest) * YD_PER_S_TO_MPH;
  return [
    `From one 40-yard run: first 10 yards ${f(t[0])}, yards 10-20 ${f(t[1])}, yards 20-30 ${f(t[2])}, yards 30-40 ${f(t[3])}`,
    `Fastest 10 yards of that run: ${f(fastest)} (${range}), about ${mph.toFixed(1)} mph`,
  ];
}

/** Every code a relationship reads (best values, standings and units are gathered for these only). */
export const RELATIONSHIP_CODES = [...new Set(RELATIONSHIPS.flatMap((r) => r.metrics))];

/**
 * Standing of one metric from the benchmark comparison already computed: a tier row says 'slow' in the bottom tier of its
 * group (a group of 2+ tiers) and 'good' above it; without one, the percentile; otherwise unknown (undefined = silent).
 */
export function standingOf(
  comparisons: ReadonlyArray<{ comparisonOperator?: string; tierName?: string; allTiers?: ReadonlyArray<{ tierName: string }> }> | undefined,
  percentile?: number,
): "slow" | "good" | undefined {
  let good = false;
  for (const c of comparisons ?? []) {
    const n = c.allTiers?.length ?? 0;
    const i = c.allTiers?.findIndex((t) => t.tierName === c.tierName) ?? -1;
    if (c.comparisonOperator !== "range" || n < 2 || i < 0) continue;
    if (i === n - 1) return "slow";
    good = true;
  }
  if (good) return "good";
  if (percentile === undefined) return undefined;
  return percentile < SLOW_PERCENTILE ? "slow" : percentile >= GOOD_PERCENTILE ? "good" : undefined;
}
