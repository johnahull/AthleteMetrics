/**
 * Defined relationships between metrics, and same-run split facts, for the insights prompt. Computed in code so the model
 * narrates a connection instead of inventing one. A relationship fires only when every input is present (silent otherwise)
 * and its text is a code constant with no numbers. Starts with the four of the head of performance's Appendix B; more only
 * after the eval set shows the gaps.
 *
 * Split math uses only rows of ONE run (calculationMetadata.runId). The report's best-per-code values come from
 * different runs and must never feed it. Codes are listed here on purpose (not imported from EVAL_METRIC_CODES, which
 * lacks several of them).
 *
 * Split facts and the speed-shape relationships need the report's sprint-runs chart (that chart's rows are the only
 * run rows the report carries); without it they stay silent, like every relationship with a missing input.
 * "Slow" and "good" are the one below-average rule of benchmark-standing.ts (below average = slow, otherwise good).
 */
import type { SprintRunMeasurement } from "@shared/report-sprint-runs-types";
import { selectSameRunSources } from "./same-run-sources";
import { belowAverageStanding, type ComparisonLike } from "./benchmark-standing";

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

// Thresholds, set by the head of performance (BTA). One value for all ages and sexes: where athletes differ, a
// silence band keeps the relationship quiet instead of guessing. A false positive says something untrue to a parent.
/**
 * Two late intervals this close are one speed level. Electronic gates are about +-0.01 s each, so the difference of the two
 * late intervals carries about 0.025 s of noise (one SD); 0.02 s is the finest change this timing can show. Do not go lower:
 * hand-entered times are 0.01 s granular. Error direction: says "stopped rising" when the athlete gained about 0.04 s (mild).
 */
export const LEVEL_OFF_TOLERANCE_S = 0.02;
/**
 * The last interval this much faster than the one before it: still speeding up at the end. About two SD of the interval
 * difference, so a true gain is seen. The band between LEVEL_OFF_TOLERANCE_S and this value is silent on purpose.
 */
export const STILL_GAINING_DELTA_S = 0.05;
/**
 * Jump with a dip minus paused-squat jump at most this many inches: countermovement-jump test-retest error is 0.5-1 in, so
 * a smaller gap cannot be told from none. This band alone decides (an EUR cut-off would only add a second tolerance).
 */
export const DIP_GAIN_MAX_IN = 0.5;
/**
 * 5-10-5 minus the 20-yard dash at least this many seconds: the turns, not the straight speed, cost time. A sound high-school
 * athlete of either sex loses about 1.6-1.9 s to the turns, so 2.0 s is clearly more than expected; a false "turns cost time"
 * is worse than a miss. Hand-timed 5-10-5 error is about +-0.1 s.
 */
export const TURN_COST_MIN_S = 2.0;
/** A percentile (metric with no benchmark comparison) at or below this is slow; at or above GOOD_PERCENTILE is good. */
export const SLOW_PERCENTILE = 40;
/** Between SLOW_PERCENTILE and this the standing is unknown (silent): 49th versus 51st must not flip a message. */
export const GOOD_PERCENTILE = 60;
/** EUR is stored to two decimals: CMJ / SJ within this of the EUR means the three values come from one derived row. */
export const EUR_ROUNDING = 0.01;

const START_YD = "DASH_10YD";
const TWENTY_YD = "DASH_20YD";
// Fly times after a run-in of 15 yards or more (FLY10_TIME is the 20-yard run-in) and top speed: close to top speed
const LATE_SPEED_CODES = ["FLY10_TIME", "FLY10_TIME_RI15", "FLY10_TIME_RI30", "TOP_SPEED", "TOP_SPEED_MPH"];
const EUR_CODE = "POWER_EUR";
const CMJ = "JUMP_CMJ_HOH";
const SJ = "JUMP_SJ_HEIGHT";
const AGILITY_5105 = "AGILITY_5105";

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const EPS = 1e-9;

/** The last two 10-yard intervals of a run: yards 20-30 and 30-40. */
const lateIntervals = (s: SameRunSplits) => {
  const ok = s[10] > 0 && s[20] > s[10] && s[30] > s[20] && s[40] > s[30];
  return ok ? { a: round3(s[30] - s[20]), b: round3(s[40] - s[30]) } : undefined;
};

export const RELATIONSHIPS: Relationship[] = [
  {
    id: "start-costs-time",
    metrics: [START_YD, ...LATE_SPEED_CODES],
    when: ({ standing }) =>
      standing[START_YD] === "slow" && LATE_SPEED_CODES.some((c) => standing[c] === "good") && !LATE_SPEED_CODES.some((c) => standing[c] === "slow"),
    text: "Top speed is holding up well for the group; the first steps are where more time can be found.",
  },
  {
    id: "speed-levels-off",
    metrics: ["DASH_20YD", "DASH_30YD", "DASH_40YD"],
    when: ({ splits }) => {
      const late = splits && lateIntervals(splits);
      return !!late && Math.abs(late.a - late.b) <= LEVEL_OFF_TOLERANCE_S + EPS;
    },
    text: "Speed stopped rising after about 20 yards, so top speed is what we will look at next. One run does not show how fast the athlete can go over a longer distance.",
  },
  {
    id: "speed-still-gaining",
    metrics: ["DASH_20YD", "DASH_30YD", "DASH_40YD"],
    when: ({ splits }) => {
      const late = splits && lateIntervals(splits);
      return !!late && late.a - late.b >= STILL_GAINING_DELTA_S - EPS;
    },
    text: "The athlete was still speeding up at the end of the run, so a longer run may show more. One run does not show how long that speed can be held.",
  },
  {
    id: "no-gain-from-dip",
    metrics: [EUR_CODE, CMJ, SJ],
    when: ({ values, units }) => {
      const eur = values[EUR_CODE];
      const cmj = values[CMJ];
      const sj = values[SJ];
      if (!(eur > 0) || !(cmj > 0) || !(sj > 0)) return false;
      if (units?.[CMJ]?.toLowerCase() !== "in" || units?.[SJ]?.toLowerCase() !== "in") return false;
      // The best of each code can come from different days; EUR is CMJ / SJ of one day, so a mismatch means mixed sources
      if (Math.abs(cmj / sj - eur) > EUR_ROUNDING + EPS) return false;
      // A squat jump well above the jump with a dip is a different story: silent
      return Math.abs(round3(cmj - sj)) <= DIP_GAIN_MAX_IN + EPS;
    },
    text: "Both jumps were about the same, so the athlete is not gaining from the dip yet. We will retest fresh. This does not show a spring deficit, a strength need or what to train.",
  },
  {
    id: "turns-cost-time",
    metrics: [AGILITY_5105, TWENTY_YD],
    when: ({ values, standing }) => {
      const turns = values[AGILITY_5105];
      const straight = values[TWENTY_YD];
      if (!(turns > 0) || !(straight > 0) || standing[TWENTY_YD] !== "good") return false;
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
  const codes = [10, 20, 30, 40].map((d) => `DASH_${d}YD`);
  // Only verified yard rows that carry a run id: rows without one are pools of best values (selectSameRunSources would pool them)
  const candidates = (rows ?? []).filter((r) => r.isVerified && !!r.calculationMetadata?.runId && codes.includes(r.metric) && parseFloat(r.value) > 0);
  const picked = selectSameRunSources(candidates, codes, () => false); // a gate split beats the drill's Final Time within a run
  if (!picked) return undefined;
  const t = (d: number) => parseFloat(picked.get(`DASH_${d}YD`)!.value);
  return { 10: t(10), 20: t(20), 30: t(30), 40: t(40) };
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
 * Standing of one metric: a benchmark comparison already computed decides (the one below-average rule: slow = below average,
 * good = not). With no comparison, the percentile counts only outside the 40th-60th band; inside it, or with nothing, the
 * standing is unknown and the relationship stays silent.
 */
export function standingOf(comparisons: ReadonlyArray<ComparisonLike> | undefined, percentile?: number): "slow" | "good" | undefined {
  const below = belowAverageStanding(comparisons);
  if (below !== undefined) return below ? "slow" : "good";
  if (percentile === undefined) return undefined;
  if (percentile <= SLOW_PERCENTILE) return "slow";
  if (percentile >= GOOD_PERCENTILE) return "good";
  return undefined;
}
