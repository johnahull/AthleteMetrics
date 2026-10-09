import type { BenchmarkComparison } from "@shared/benchmark-types";
import { evaluateTierBenchmark, selectTierGroup, type SourcedTierRow } from "../benchmark-tiers";

/** A benchmark row tagged with the metric, sex, sport, level and age range of the set it belongs to. */
export interface TierCandidateRow extends SourcedTierRow {
  metricCode: string;
  gender: string | null;
  sport: string | null;
  /** "HS" for age-group rows, "D1" for the college standard */
  level: string | null;
  ageMin: number | null;
  ageMax: number | null;
}

export interface TierAthlete {
  gender: string | null;
  birthDate: string | null;
  sport: string | null;
}

export type AverageOperator = "lte" | "gte";

/** Position against a single "Average" threshold. distancePct is signed: positive = better than average. */
export interface AverageComparison {
  kind: "average";
  /** Name of the benchmark row, as stored */
  name: string | null;
  averageValue: number;
  operator: AverageOperator;
  status: "at_or_better" | "below";
  distancePct: number;
}

export type AgeGroupMatch = { kind: "tiers"; comparison: BenchmarkComparison } | AverageComparison;

/** Age-group sets exist for ages 11-18 only. */
const MIN_TIER_AGE = 11;
const MAX_TIER_AGE = 18;

/** Metrics that never get a comparison in v1, even if a set were seeded. LSI is shown only by the balance line. */
const NO_TIER_CODES: ReadonlySet<string> = new Set([
  "POWER_EUR",
  "MOMENTUM",
  "AGILITY_COD_DEFICIT_YD",
  "AGILITY_COD_DEFICIT_M",
  "RSI_105",
  "T_TEST",
  "JUMP_CMJ_SL_L",
  "JUMP_CMJ_SL_R",
  "JUMP_CMJ_SL_ASYM",
  "AGILITY_505_YD_LSI",
  "AGILITY_505_M_LSI",
]);

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict YYYY-MM-DD parse with a real calendar check (rejects 2012-02-30, 2013-02-29, 2012-04-31). */
export function parseYmd(text: string): [number, number, number] | null {
  const m = YMD.exec(text);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Date.UTC maps years 0-99 to 1900-1999, so setUTCFullYear keeps the year literal for the round trip.
  date.setUTCFullYear(y);
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? [y, mo, d] : null;
}

/** Completed years at `onDate`. NaN unless both are well-formed YYYY-MM-DD (so "", "2012", datetimes are rejected). */
export function ageAtDate(birthDate: string, onDate: string): number {
  const birth = parseYmd(birthDate);
  const on = parseYmd(onDate);
  if (!birth || !on) return Number.NaN;
  const [by, bm, bd] = birth;
  const [oy, om, od] = on;
  return oy - by - (om < bm || (om === bm && od < bd) ? 1 : 0);
}

/** Only "Male" and "Female" identify a set; anything else (including "Not Specified") matches nothing. */
function sexOf(gender: string | null): "male" | "female" | null {
  const g = gender?.toLowerCase();
  return g === "male" || g === "female" ? g : null;
}

const sameText = (a: string | null, b: string | null) => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

function compareToAverage(
  value: number,
  operator: AverageOperator,
  average: number,
): Pick<AverageComparison, "status" | "distancePct"> {
  const distancePct = (((operator === "lte" ? average - value : value - average)) / Math.abs(average)) * 100;
  return { status: distancePct >= 0 ? "at_or_better" : "below", distancePct };
}

const isOperator = (op: string | null | undefined): op is AverageOperator => op === "lte" || op === "gte";

function toAverage(row: TierCandidateRow, value: number): AverageComparison | null {
  if (row.benchmarkValue == null || !isOperator(row.comparisonOperator)) return null;
  const average = parseFloat(String(row.benchmarkValue));
  if (!Number.isFinite(average) || average === 0) return null;
  return {
    kind: "average",
    name: row.tierName ?? row.name ?? null,
    averageValue: average,
    operator: row.comparisonOperator,
    ...compareToAverage(value, row.comparisonOperator, average),
  };
}

/** Deterministic row choice, like selectTierGroup: lowest displayOrder, then source, then name. */
function byPrecedence(a: TierCandidateRow, b: TierCandidateRow): number {
  const order = (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
  if (order !== 0) return order;
  const text = (r: TierCandidateRow) => `${r._source ?? ""}\u0000${r.tierName ?? r.name ?? ""}`;
  return text(a) < text(b) ? -1 : text(a) > text(b) ? 1 : 0;
}

/**
 * Age-group comparison (AM-FEAT-019 Part 3). Strict: age is taken at the event date, sex must be Male or
 * Female, sport and metric code must match exactly, and the set must carry both age bounds (explicit null
 * checks, so 0 is a real bound). Anything else returns null so the report shows value and unit, no gauge.
 *
 * Age-group sets are single "Average" threshold rows, compared above/below the average. Rows that carry a
 * tier group and order are genuine multi-tier groups and go through selectTierGroup/evaluateTierBenchmark.
 */
export function matchTierGroup(args: {
  metricCode: string;
  value: number;
  lowerIsBetter: boolean;
  athlete: TierAthlete;
  eventDate: string;
  candidates: readonly TierCandidateRow[];
}): AgeGroupMatch | null {
  const { metricCode, athlete } = args;
  const sex = sexOf(athlete.gender);
  if (NO_TIER_CODES.has(metricCode) || sex === null || !athlete.birthDate || !athlete.sport) return null;

  const age = ageAtDate(athlete.birthDate, args.eventDate);
  if (!Number.isFinite(age) || age < MIN_TIER_AGE || age > MAX_TIER_AGE) return null;

  const eligible = args.candidates.filter(
    (c) =>
      c.metricCode === metricCode &&
      sexOf(c.gender) === sex &&
      sameText(c.sport, athlete.sport) &&
      c.ageMin !== null &&
      c.ageMax !== null &&
      age >= c.ageMin &&
      age <= c.ageMax,
  );

  const grouped = eligible.filter((c) => c.tierGroupId != null && c.tierOrder != null);
  if (grouped.length > 0) {
    const comparison = evaluateTierBenchmark(args.value, args.lowerIsBetter, selectTierGroup(grouped));
    return comparison ? { kind: "tiers", comparison } : null;
  }
  for (const row of [...eligible].sort(byPrecedence)) {
    const average = toAverage(row, args.value);
    if (average) return average;
  }
  return null;
}

/**
 * The secondary "college standard": the D1 Average row for the athlete's sex and sport (no age bounds).
 * The row is identified by name, /average/i on tierName (or name when there is no tier name), so it relies on
 * the seed naming: migrations 0129, 0132 and 0136 seed rows such as "Soccer D1 Average" (tier "D1 Average")
 * next to "Soccer D1 Top 25%", which must not match.
 */
export function matchCollegeStandard(args: {
  metricCode: string;
  value: number;
  athlete: Pick<TierAthlete, "gender" | "sport">;
  candidates: readonly TierCandidateRow[];
}): AverageComparison | null {
  const sex = sexOf(args.athlete.gender);
  if (NO_TIER_CODES.has(args.metricCode) || sex === null || !args.athlete.sport) return null;
  for (const row of [...args.candidates].sort(byPrecedence)) {
    if (
      row.metricCode === args.metricCode &&
      row.level === "D1" &&
      sexOf(row.gender) === sex &&
      sameText(row.sport, args.athlete.sport) &&
      /average/i.test(row.tierName ?? row.name ?? "")
    ) {
      const average = toAverage(row, args.value);
      if (average) return average;
    }
  }
  return null;
}

/**
 * Whether an LSI screening set exists for the athlete: female or male per the rows, LSI code, and the
 * rows' own age bounds when they have them (the 0128 set has none). The LSI tier names are never shown to
 * families; this only lets the balance line choose between a judgement and a neutral label. The set is not
 * sport-specific, so sport is not checked.
 */
export function hasLsiTierSet(args: {
  metricCode: string;
  athlete: Pick<TierAthlete, "gender" | "birthDate">;
  eventDate: string;
  candidates: readonly TierCandidateRow[];
}): boolean {
  const sex = sexOf(args.athlete.gender);
  if (sex === null) return false;
  const age = args.athlete.birthDate ? ageAtDate(args.athlete.birthDate, args.eventDate) : Number.NaN;
  return args.candidates.some(
    (c) =>
      c.metricCode === args.metricCode &&
      sexOf(c.gender) === sex &&
      (c.ageMin === null || age >= c.ageMin) &&
      (c.ageMax === null || age <= c.ageMax),
  );
}
