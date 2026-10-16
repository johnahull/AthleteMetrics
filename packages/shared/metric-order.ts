/**
 * Fixed grouping and ordering of metrics in generic (individual / team) reports. Applied once on the server
 * so every renderer follows it, and so snapshots whose jsonb re-ordered the keys read back in order.
 */

export const METRIC_GROUP_ORDER = [
  { id: "speed", label: "Speed" },
  { id: "agility", label: "Agility" },
  { id: "power", label: "Power" },
  { id: "strength", label: "Strength" },
  { id: "endurance", label: "Endurance" },
  { id: "flexibility", label: "Flexibility" },
  { id: "movement", label: "Movement" },
  { id: "sport_specific", label: "Sport Specific" },
  { id: "recovery", label: "Recovery" },
  { id: "body_composition", label: "Body Composition" },
  { id: "custom", label: "Custom" },
  { id: "other", label: "Other" },
] as const;

export type MetricGroupId = (typeof METRIC_GROUP_ORDER)[number]["id"];

export interface MetricGroup {
  group: MetricGroupId;
  label: string;
  codes: string[];
}

// Built-in codes in display order within each group. The DB categories for these are inconsistent
// ('speed' / 'Speed' / 'Acceleration' / 'Movement Quality'), so they are mapped here.
const BUILT_IN_CODES: Partial<Record<MetricGroupId, readonly string[]>> = {
  speed: [
    "DASH_5YD", "DASH_10YD", "DASH_20YD", "DASH_30YD", "DASH_40YD",
    "DASH_10M", "DASH_20M", "DASH_30M", "DASH_40M",
    "FLY10_TIME_RI5", "FLY10_TIME_RI10", "FLY10_TIME_RI15", "FLY10_TIME", "FLY10_TIME_RI30", "FLY10M_TIME",
    "TOP_SPEED", "TOP_SPEED_MPH",
  ],
  agility: [
    "AGILITY_505_M", "AGILITY_505_M_L", "AGILITY_505_M_R",
    "AGILITY_505_YD", "AGILITY_505_YD_L", "AGILITY_505_YD_R",
    "AGILITY_505", "AGILITY_505_L", "AGILITY_505_R",
    "AGILITY_5105", "AGILITY_5105_L", "AGILITY_5105_R", "T_TEST",
    "AGILITY_COD_DEFICIT_M_INTERP", "AGILITY_COD_DEFICIT_M", "AGILITY_COD_DEFICIT_YD",
  ],
  power: [
    "VERTICAL_JUMP", "JUMP_CMJ_HOH", "JUMP_SJ_HEIGHT", "POWER_EUR",
    "RSI", "RSI_105", "RSI_BILATERAL", "RSI_LEFT", "RSI_RIGHT", "RSI_L", "RSI_R",
    "RSI_SINGLE_LEFT", "RSI_SINGLE_RIGHT",
    "JUMP_CMJ_SL_L", "JUMP_CMJ_SL_R",
    "PEAK_POWER_W", "PEAK_POWER_REL", "JUMP_BROAD", "MOMENTUM",
  ],
  strength: ["STRENGTH_SQUAT", "SQUAT_1RM", "SQUAT_1RM_KG"],
  movement: [
    "MQI_TOTAL", "MQI",
    "AGILITY_505_M_LSI", "AGILITY_505_YD_LSI", "AGILITY_505_LSI",
    "JUMP_CMJ_SL_ASYM", "RSI_ASYM",
  ],
  body_composition: ["BODY_HEIGHT", "BODY_WEIGHT", "HEIGHT", "HEIGHT_IN", "WEIGHT", "WEIGHT_LBS"],
};

const BUILT_IN_GROUP = new Map<string, { group: MetricGroupId; rank: number }>();
for (const [group, codes] of Object.entries(BUILT_IN_CODES)) {
  codes!.forEach((code, rank) => BUILT_IN_GROUP.set(code, { group: group as MetricGroupId, rank }));
}

const GROUP_IDS = new Set<string>(METRIC_GROUP_ORDER.map((g) => g.id));
const CATEGORY_ALIASES: Record<string, MetricGroupId> = {
  acceleration: "speed",
  movement_quality: "movement",
  conditioning: "endurance",
};

/** "Power" -> power, "Body Composition" -> body_composition; null when it is not a known group. */
export function normalizeCategory(raw: string | null | undefined): MetricGroupId | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  return GROUP_IDS.has(key) ? (key as MetricGroupId) : null;
}

/** Groups in fixed order; empty groups are dropped. Built-in order first inside a group, then the rest by code. */
export function groupMetricCodes(
  codes: readonly string[],
  categories: Record<string, string | null | undefined>,
): MetricGroup[] {
  const buckets = new Map<MetricGroupId, string[]>();
  for (const code of new Set(codes)) {
    const group = BUILT_IN_GROUP.get(code)?.group ?? normalizeCategory(categories[code]) ?? "other";
    if (!buckets.has(group)) buckets.set(group, []);
    buckets.get(group)!.push(code);
  }
  const rank = (code: string) => BUILT_IN_GROUP.get(code)?.rank ?? Infinity;
  return METRIC_GROUP_ORDER.filter((g) => buckets.has(g.id)).map((g) => ({
    group: g.id,
    label: g.label,
    codes: buckets.get(g.id)!.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0)),
  }));
}

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function reorderKeys<T>(map: unknown, position: Map<string, number>): T {
  if (!isObj(map)) return map as T;
  const keys = Object.keys(map).sort((a, b) => (position.get(a) ?? Infinity) - (position.get(b) ?? Infinity));
  return Object.fromEntries(keys.map((k) => [k, map[k]])) as T;
}

const ATHLETE_KEYED = ["measurements", "percentiles", "eventPercentiles", "teamAverages", "benchmarkComparisons"];
const TOP_KEYED = ["trends", "distributions", "teamTrends", "teamDistributions"];

/**
 * Copy of a report with metric-keyed maps re-inserted in group order, plus `metricGroups`. Input is not mutated.
 * Limit: JS orders integer-like keys (a custom code such as "1600") ascending regardless of insertion, so
 * consumers that need exact order must read `metricGroups[].codes`, not object key order.
 */
export function orderReportData<T extends Obj>(
  data: T,
  categories: Record<string, string | null | undefined>,
): T & { metricGroups: MetricGroup[] } {
  if (!isObj(data)) return data as any;
  const athletes: Obj[] = [data.athlete, ...(Array.isArray(data.athleteRankings) ? data.athleteRankings : [])].filter(isObj);

  const codes = new Set<string>();
  for (const a of athletes) for (const f of ATHLETE_KEYED) if (isObj(a[f])) Object.keys(a[f]).forEach((c) => codes.add(c));
  for (const f of TOP_KEYED) if (isObj(data[f])) Object.keys(data[f]).forEach((c) => codes.add(c));
  if (Array.isArray(data.teamStatistics)) for (const s of data.teamStatistics) if (s?.metric) codes.add(s.metric);

  const metricGroups = groupMetricCodes([...codes], categories);
  const position = new Map(metricGroups.flatMap((g) => g.codes).map((c, i) => [c, i]));

  const orderAthlete = (a: Obj): Obj => {
    const out: Obj = { ...a };
    for (const f of ATHLETE_KEYED) if (f in a) out[f] = reorderKeys(a[f], position);
    return out;
  };

  const out: Obj = { ...data };
  if (isObj(data.athlete)) out.athlete = orderAthlete(data.athlete);
  if (Array.isArray(data.athleteRankings)) out.athleteRankings = data.athleteRankings.map((a: Obj) => (isObj(a) ? orderAthlete(a) : a));
  for (const f of TOP_KEYED) if (f in data) out[f] = reorderKeys(data[f], position);
  if (Array.isArray(data.teamStatistics)) {
    out.teamStatistics = [...data.teamStatistics].sort(
      (a, b) => (position.get(a?.metric) ?? Infinity) - (position.get(b?.metric) ?? Infinity),
    );
  }
  out.metricGroups = metricGroups;
  return out as T & { metricGroups: MetricGroup[] };
}

/** `codes` in the order of `metricGroups` (unlisted codes last). Use instead of object-key order for all-digit codes. */
export function sortCodesByGroups(codes: string[], metricGroups?: MetricGroup[]): string[] {
  if (!metricGroups?.length) return codes;
  const position = new Map(metricGroups.flatMap((g) => g.codes).map((c, i) => [c, i]));
  return [...codes].sort((a, b) => (position.get(a) ?? Infinity) - (position.get(b) ?? Infinity));
}
