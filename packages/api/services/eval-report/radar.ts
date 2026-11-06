/**
 * Six-axis percentile radar (AM-FEAT-024). Pure: the athlete's event bests and a comparison group in, a
 * frozen-ready block out. An axis with no value or no qualifying group is unscored (percentile null), never
 * zero or 50, and axes are never averaged into an overall score. MQI and EUR are never axes.
 */
import { percentile, MIN_NORM_N } from "./percentile";
import { sexOf } from "./tier-match";
import { movementBand } from "./mqi-band";
import type { MqiBandLabel } from "@shared/mqi-band";

/** Smallest event or team group a percentile is reported from. */
export const MIN_GROUP_N = 10;
/** 10 yd per second to mph. */
const YD_PER_S_TO_MPH = 2.04545;

export type RadarAxisId =
  | "acceleration"
  | "highSpeedRunning"
  | "verticalPower"
  | "reactiveStrength"
  | "changeOfDirection"
  | "horizontalPower";
export type RadarCohortKind = "norm" | "event" | "team";

export interface RadarAxis {
  axis: RadarAxisId;
  label: string;
  /** Metric code the percentile is on (the 5-0-5 axis names the bilateral code of the recorded variant) */
  code: string;
  value: number | null;
  displayValue: string | null;
  /** Hover text: the raw time behind a derived display (high-speed running) */
  detail: string | null;
  percentile: number | null;
  cohortKind: RadarCohortKind;
  /** Human label of the comparison group, printed as "vs <label>, n=<n>" */
  cohortLabel: string;
  n: number;
  source: string;
  distributionVersionId: string | null;
}

export interface EvalRadar {
  cohortKind: RadarCohortKind;
  axes: RadarAxis[];
  scoredCount: number;
  /** Shown beside the radar, never on it and never in a percentile; null total = "Not tested" */
  movement: { total: number | null; band: MqiBandLabel | null };
}

/** A row of benchmark_distributions joined to its version, as the loader returns it. */
export interface NormDistribution {
  versionId: string;
  versionCreatedAt: Date | string;
  /** The version's source label */
  source: string;
  metricCode: string;
  sex: string;
  ageMin: number;
  ageMax: number;
  kind: string;
  // n omitted: for kind 'raw', n === values.length
  values: number[];
}

export type RadarCohortInput =
  | { kind: "norm"; distributions: readonly NormDistribution[] }
  | { kind: "event" | "team"; label: string; /** userId -> best value per metric code at this event */ peers: ReadonlyMap<string, ReadonlyMap<string, number>> };

export interface RadarInput {
  /** The athlete's best per metric code at the event, direction already honored */
  bests: ReadonlyMap<string, number>;
  unitOf: (code: string) => string;
  gender: string | null;
  /** Age at the event date */
  age: number | null;
  cohort: RadarCohortInput;
  /** The event's MQI_TOTAL; absent when the pattern set is incomplete */
  mqiTotal?: number;
}

type Variant = "AGILITY_505_M" | "AGILITY_505_YD";

interface AxisDef {
  axis: RadarAxisId;
  label: string;
  code: string | "COD";
  lowerIsBetter: boolean;
}

export const RADAR_AXES: readonly AxisDef[] = [
  { axis: "acceleration", label: "Acceleration", code: "DASH_10YD", lowerIsBetter: true },
  { axis: "highSpeedRunning", label: "High-speed running", code: "FLY10_TIME_RI30", lowerIsBetter: true },
  { axis: "verticalPower", label: "Vertical power", code: "JUMP_CMJ_HOH", lowerIsBetter: false },
  { axis: "reactiveStrength", label: "Reactive strength", code: "RSI_105", lowerIsBetter: false },
  { axis: "changeOfDirection", label: "Change of direction", code: "COD", lowerIsBetter: true },
  { axis: "horizontalPower", label: "Horizontal power", code: "JUMP_BROAD", lowerIsBetter: false },
];

/** Every metric code the radar reads (loaders select exactly these). */
export const RADAR_METRIC_CODES: readonly string[] = [
  "DASH_10YD", "FLY10_TIME_RI30", "JUMP_CMJ_HOH", "RSI_105", "JUMP_BROAD",
  "AGILITY_505_M_L", "AGILITY_505_M_R", "AGILITY_505_YD_L", "AGILITY_505_YD_R",
];

/** Codes a norm distribution is stored under: the 5-0-5 axis uses the bilateral code, not the leg codes. */
export const RADAR_NORM_CODES: readonly string[] = [
  "DASH_10YD", "FLY10_TIME_RI30", "JUMP_CMJ_HOH", "RSI_105", "JUMP_BROAD", "AGILITY_505_M", "AGILITY_505_YD",
];

/** Radar codes where a lower value is better, for picking an athlete's best without site_metrics. */
export const RADAR_LOWER_IS_BETTER: ReadonlySet<string> = new Set([
  "DASH_10YD", "FLY10_TIME_RI30", "AGILITY_505_M_L", "AGILITY_505_M_R", "AGILITY_505_YD_L", "AGILITY_505_YD_R",
]);

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

function mean505(bests: ReadonlyMap<string, number>, variant: Variant): number | null {
  const l = bests.get(`${variant}_L`);
  const r = bests.get(`${variant}_R`);
  return l !== undefined && r !== undefined ? (l + r) / 2 : null;
}

/** The event's recorded variant: meter when both meter legs exist, else yard when both yard legs exist. */
function recordedVariant(bests: ReadonlyMap<string, number>): Variant {
  return mean505(bests, "AGILITY_505_M") === null && mean505(bests, "AGILITY_505_YD") !== null ? "AGILITY_505_YD" : "AGILITY_505_M";
}

/** A value <= 0 is bad data on every axis: unscored, and never a display like Infinity mph. */
function axisValue(def: AxisDef, bests: ReadonlyMap<string, number>, variant: Variant): number | null {
  const value = def.code === "COD" ? mean505Valid(bests, variant) : (bests.get(def.code) ?? null);
  return value !== null && value > 0 ? value : null;
}

function mean505Valid(bests: ReadonlyMap<string, number>, variant: Variant): number | null {
  const l = bests.get(`${variant}_L`);
  const r = bests.get(`${variant}_R`);
  return l !== undefined && r !== undefined && l > 0 && r > 0 ? (l + r) / 2 : null;
}

function display(def: AxisDef, value: number, unit: string): { displayValue: string; detail: string | null } {
  const raw = `${round(value, 2)} ${unit}`.trim();
  if (def.axis === "highSpeedRunning") return { displayValue: `${round((10 / value) * YD_PER_S_TO_MPH, 1).toFixed(1)} mph`, detail: raw };
  return { displayValue: raw, detail: null };
}

const sexLabel = (sex: string) => (sex === "female" ? "Female" : "Male");

export function buildRadar(input: RadarInput): EvalRadar {
  const { cohort } = input;
  const variant = recordedVariant(input.bests);
  const sex = sexOf(input.gender);

  const axes = RADAR_AXES.map<RadarAxis>((def) => {
    const code = def.code === "COD" ? variant : def.code;
    const value = axisValue(def, input.bests, variant);
    const shown = value === null ? { displayValue: null, detail: null } : display(def, value, input.unitOf(def.code === "COD" ? `${variant}_L` : def.code));
    const direction = def.lowerIsBetter ? "lower_is_better" : "higher_is_better";
    const base = { axis: def.axis, label: def.label, code, value, ...shown, cohortKind: cohort.kind };

    if (cohort.kind !== "norm") {
      const values = [...cohort.peers.values()].flatMap((peer) => axisValue(def, peer, variant) ?? []);
      const p = value === null ? null : percentile(values, value, direction, MIN_GROUP_N);
      return { ...base, percentile: p === null ? null : Math.round(p), cohortLabel: cohort.label, n: values.length, source: cohort.kind === "team" ? "Team" : "Event participants", distributionVersionId: null };
    }

    const candidates = sex && input.age !== null
      ? cohort.distributions.filter((d) => d.kind === "raw" && d.metricCode === code && d.sex === sex && d.ageMin <= input.age! && input.age! <= d.ageMax)
      : [];
    const chosen = candidates.reduce<NormDistribution | null>(
      (best, d) => (best === null || new Date(d.versionCreatedAt).getTime() > new Date(best.versionCreatedAt).getTime() ? d : best),
      null,
    );
    if (!chosen) return { ...base, percentile: null, cohortLabel: "Site norms", n: 0, source: "Site norms", distributionVersionId: null };
    const p = value === null ? null : percentile(chosen.values, value, direction, MIN_NORM_N);
    return {
      ...base,
      percentile: p === null ? null : Math.round(p),
      cohortLabel: `${chosen.source}, ${sexLabel(chosen.sex)} ${chosen.ageMin}-${chosen.ageMax}`,
      n: chosen.values.length,
      source: chosen.source,
      distributionVersionId: chosen.versionId,
    };
  });

  return {
    cohortKind: cohort.kind,
    axes,
    scoredCount: axes.filter((a) => a.percentile !== null).length,
    movement: { total: input.mqiTotal ?? null, band: movementBand(input.mqiTotal) },
  };
}
