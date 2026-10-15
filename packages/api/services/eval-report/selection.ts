import { METRIC_LABELS, OTHER_METRIC_LABELS } from "./copy";
import type { EvalPreset } from "./model";
import { FLY10_RUN_IN_YD } from "@shared/fly-run-in";
import { EVAL_METRIC_CODES, metricCode, type EvalMetricKey } from "./metric-key-map";
import { ageAtDate, parseYmd } from "./tier-match";

export type MetricGroup = "speed" | "power" | "change_of_direction" | "movement";

const GROUPS: Record<EvalMetricKey, MetricGroup> = {
  DASH_10: "speed",
  DASH_20: "speed",
  DASH_30: "speed",
  DASH_40: "speed",
  FLY_10: "speed",
  CMJ_HOH: "power",
  SQUAT_JUMP: "power",
  EUR: "power",
  RSI_BILATERAL: "power",
  CMJ_SL_LEFT: "power",
  CMJ_SL_RIGHT: "power",
  CMJ_SL_ASYM: "movement",
  MOMENTUM: "power",
  "505": "change_of_direction",
  "505_LEFT": "change_of_direction",
  "505_RIGHT": "change_of_direction",
  "505_LSI": "movement",
  COD_DEFICIT: "change_of_direction",
  T_TEST: "change_of_direction",
  MQI: "movement",
};

export function groupForKey(key: EvalMetricKey): MetricGroup {
  return GROUPS[key];
}

/** The six headline metrics, in report order (AM-FEAT-019 Part 2). */
const HEADLINE_KEYS: readonly EvalMetricKey[] = ["DASH_10", "FLY_10", "CMJ_HOH", "505", "505_LSI", "MQI"];

/** Headline metrics the event has data for. `bests` is keyed by metric code (after recomputeDerived). */
export function defaultHeadlineKeys(bests: ReadonlyMap<string, number>): EvalMetricKey[] {
  return HEADLINE_KEYS.filter((key) => bests.has(metricCode(key)));
}

/** Years to graduation (school years, Aug 1 rollover): 4+ is grade 8 or below. */
const MIDDLE_SCHOOL_MIN_YEARS = 4;
/** A student graduating next school year counts as a rising senior from June 1 until the Aug 1 rollover. */
const RISING_SENIOR_MONTH = 6;
const ROLLOVER_MONTH = 8;
/** Age fallback when there is no graduation year: 11-13 middle school, 14-16 high school, 17+ senior. */
const HIGH_SCHOOL_MIN_AGE = 14;
const SENIOR_MIN_AGE = 17;

/**
 * Preset from graduation year, then age, else High school. The school year rolls over on Aug 1, judged at
 * the event date. Middle school = 4+ years to graduation (grade 8 or below), High school = 2-3 (and 1 year
 * before June 1), Senior = graduating, or rising from June 1.
 */
export function resolvePreset(args: {
  graduationYear: number | null;
  birthDate: string | null;
  eventDate: string;
}): EvalPreset {
  const { graduationYear, birthDate, eventDate } = args;
  if (graduationYear !== null) {
    const event = parseYmd(eventDate);
    if (!event) return "high_school"; // malformed event date: the explicit default, not NaN arithmetic
    const [year, month] = event;
    const yearsToGraduation = graduationYear - (month >= ROLLOVER_MONTH ? year + 1 : year);
    if (yearsToGraduation <= 0) return "senior";
    if (yearsToGraduation === 1 && month >= RISING_SENIOR_MONTH && month < ROLLOVER_MONTH) return "senior";
    return yearsToGraduation >= MIDDLE_SCHOOL_MIN_YEARS ? "middle_school" : "high_school";
  }
  if (birthDate !== null) {
    const age = ageAtDate(birthDate, eventDate);
    if (!Number.isFinite(age)) return "high_school";
    if (age >= SENIOR_MIN_AGE) return "senior";
    return age >= HIGH_SCHOOL_MIN_AGE ? "high_school" : "middle_school";
  }
  return "high_school";
}

export interface PresetDefaults {
  collegeGauge: boolean;
  noteFirst: boolean;
  freshAndHealthy: boolean;
  retestTrend: boolean;
}

const PRESETS: Record<EvalPreset, PresetDefaults> = {
  middle_school: { collegeGauge: false, noteFirst: true, freshAndHealthy: true, retestTrend: true },
  high_school: { collegeGauge: false, noteFirst: false, freshAndHealthy: true, retestTrend: true },
  senior: { collegeGauge: true, noteFirst: false, freshAndHealthy: true, retestTrend: true },
};

export function presetDefaults(preset: EvalPreset): PresetDefaults {
  return PRESETS[preset];
}

const COLLEGE_GAUGE_MIN_AGE = 14;

/** College gauge: the coach's explicit choice wins; otherwise hidden under 14, else the preset default. */
export function showCollegeGauge(args: { preset: EvalPreset; age: number | null; explicit?: boolean }): boolean {
  if (args.explicit !== undefined) return args.explicit;
  if (args.age !== null && args.age < COLLEGE_GAUGE_MIN_AGE) return false;
  return PRESETS[args.preset].collegeGauge;
}

export type OfferedGroup = MetricGroup | "other";

export interface OfferedMetric {
  code: string;
  /** Logical key; null for a measured metric outside the key map */
  key: EvalMetricKey | null;
  label: string;
  group: OfferedGroup;
  /** Checked by default */
  checked: boolean;
}

const OTHER_GROUPS: Record<string, OfferedGroup> = {
  TOP_SPEED: "speed",
  TOP_SPEED_MPH: "speed",
  VERTICAL_JUMP: "power",
  JUMP_BROAD: "power",
  ...Object.fromEntries(Object.keys(FLY10_RUN_IN_YD).map((code) => [code, "speed" as const])),
};

const GROUP_ORDER: OfferedGroup[] = ["speed", "power", "change_of_direction", "movement", "other"];

/**
 * The checklist for an event (AM-FEAT-019 Part 2). `codesWithData` is the event's metric codes with data
 * (after recomputeDerived). The headline metrics with data come first and are checked; every other measured
 * metric is offered unchecked, so nothing measured is dropped. Metrics without data are not offered.
 */
export function offeredMetrics(codesWithData: ReadonlySet<string>): { headline: OfferedMetric[]; available: OfferedMetric[] } {
  const keyByCode = new Map((Object.keys(EVAL_METRIC_CODES) as EvalMetricKey[]).map((key) => [metricCode(key), key]));
  const headlineCodes = new Set(HEADLINE_KEYS.map(metricCode));

  const headline = HEADLINE_KEYS.filter((key) => codesWithData.has(metricCode(key))).map<OfferedMetric>((key) => ({
    code: metricCode(key),
    key,
    label: METRIC_LABELS[key],
    group: GROUPS[key],
    checked: true,
  }));

  const available = [...codesWithData]
    .filter((code) => !headlineCodes.has(code))
    .map<OfferedMetric>((code) => {
      const key = keyByCode.get(code) ?? null;
      return {
        code,
        key,
        label: key ? METRIC_LABELS[key] : (OTHER_METRIC_LABELS[code] ?? code),
        group: key ? GROUPS[key] : (OTHER_GROUPS[code] ?? "other"),
        checked: false,
      };
    })
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.code.localeCompare(b.code));

  return { headline, available };
}
