/**
 * Eval report assembly (AM-FEAT-019). Builds the pure EvalReportModel for ONE athlete at ONE event.
 *
 * assembleEvalReportModel is pure (fixtures in, model out); loadEvalReportInputs is the thin database
 * loader. Only that athlete's measurements for that event, in the event's organization, are read. Pre-test
 * survey tables are never read and the inputs have no field for them.
 */
import { and, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { db as database } from "../db";
import { benchmarkDistributionVersions, benchmarkDistributions, measurements, siteBenchmarks, siteMetrics, teams, userTeams, users, events, type Event } from "@shared/schema";
import type { EvalSelectionInput } from "@shared/eval-report-config";
import type { DisplayFormat } from "@shared/duration-format";
import { eventCalendarDate } from "./event-measurements-service";
import { selectSameRunSources } from "./same-run-sources";
import { movementBand } from "./eval-report/mqi-band";
import {
  EVAL_METRIC_CODES,
  METRIC_LABELS,
  OTHER_METRIC_LABELS,
  ageAtDate,
  balanceLine,
  defaultHeadlineKeys,
  eventBests,
  hasLsiTierSet,
  matchCollegeStandard,
  matchTierGroup,
  metricCode,
  offeredMetrics,
  presetDefaults,
  recomputeDerived,
  resolvePreset,
  retestTrend,
  buildRadar,
  RADAR_LOWER_IS_BETTER,
  RADAR_METRIC_CODES,
  RADAR_NORM_CODES,
  selectPriorEvent,
  sexOf,
  showCollegeGauge,
  strengthsAndLimiter,
  type EvalMetricKey,
  type EvalMetricResult,
  type EvalReportModel,
  type EventMeasurementRow,
  type EventRef,
  type LoadLevel,
  type RadarCohortInput,
  type TierCandidateRow,
} from "./eval-report";

type Db = typeof database;

export interface EvalMeasurementRow extends EventMeasurementRow {
  /** Device-import run id lives here (calculationMetadata.runId) */
  calculationMetadata?: unknown;
  units: string;
  teamNameSnapshot: string | null;
}

export interface EvalAssemblyInput {
  event: { id: string; organizationId: string; /** Event calendar date, YYYY-MM-DD */ date: string };
  athlete: {
    id: string;
    name: string;
    birthDate: string | null;
    gender: string | null;
    graduationYear: number | null;
    sport: string | null;
  };
  /** The event's rows; rows of another event, athlete or organization are ignored */
  rows: readonly EvalMeasurementRow[];
  priorEvent: { event: EventRef; rows: readonly EvalMeasurementRow[] } | null;
  metricMeta: ReadonlyMap<string, { unit: string | null; lowerIsBetter: boolean; displayFormat?: DisplayFormat }>;
  benchmarks: readonly TierCandidateRow[];
  selection: EvalSelectionInput;
  load: LoadLevel | null;
  coachNote: string | null;
  overrides: { strengths?: readonly string[]; developmentAreas?: readonly string[]; limiter?: string | null };
  /** Comparison group of the radar, loaded for the coach's choice; absent = site norms with no distributions (every axis unscored) */
  radar?: RadarCohortInput;
}

const KNOWN_KEYS = new Set<string>(Object.keys(EVAL_METRIC_CODES));
const isKey = (key: string): key is EvalMetricKey => KNOWN_KEYS.has(key);

function scopedBests(input: EvalAssemblyInput, eventId: string, rows: readonly EvalMeasurementRow[]) {
  const isLower = (code: string) => input.metricMeta.get(code)?.lowerIsBetter ?? false;
  const scope = { eventId, userId: input.athlete.id, organizationId: input.event.organizationId };
  const scoped = rows.filter((r) => r.eventId === eventId && r.userId === scope.userId && r.organizationId === scope.organizationId);
  // The COD deficit pairs the 10 yd and 20 yd splits within one run, like the stored value; the displayed
  // splits stay the athlete's best of each
  const [code10, code20] = [metricCode("DASH_10"), metricCode("DASH_20")];
  const pair = selectSameRunSources(scoped, [code10, code20], (code) => !isLower(code));
  const splitPair = pair && { dash10: Number(pair.get(code10)!.value), dash20: Number(pair.get(code20)!.value) };
  return { scoped, bests: recomputeDerived(eventBests(scope, scoped, isLower), splitPair) };
}

function ageOf(input: EvalAssemblyInput): number | null {
  const age = input.athlete.birthDate ? ageAtDate(input.athlete.birthDate, input.event.date) : Number.NaN;
  return Number.isFinite(age) ? age : null;
}

function presetOf(input: EvalAssemblyInput) {
  return (
    input.selection.preset ??
    resolvePreset({ graduationYear: input.athlete.graduationYear, birthDate: input.athlete.birthDate, eventDate: input.event.date })
  );
}

export function assembleEvalReportModel(input: EvalAssemblyInput): EvalReportModel {
  const { event, athlete, selection } = input;
  const { scoped, bests } = scopedBests(input, event.id, input.rows);
  const prior = input.priorEvent ? scopedBests(input, input.priorEvent.event.id, input.priorEvent.rows) : null;

  const age = ageOf(input);
  const preset = presetOf(input);
  const defaults = presetDefaults(preset);
  const sections = selection.sections ?? {};
  const sectionOn = {
    headline: sections.headline ?? true,
    freshAndHealthy: sections.freshAndHealthy ?? defaults.freshAndHealthy,
    coachNote: sections.coachNote ?? true,
    noteFirst: sections.noteFirst ?? defaults.noteFirst,
    ageGroupComparison: sections.ageGroupComparison ?? true,
    strengths: sections.strengths ?? true,
    retestTrend: sections.retestTrend ?? defaults.retestTrend,
    radar: sections.radar ?? false,
  };
  const collegeGauge = showCollegeGauge({ preset, age, explicit: selection.collegeGauge });

  const unitOf = (code: string, rows: readonly EvalMeasurementRow[]) =>
    rows.find((r) => r.metric === code)?.units ?? input.metricMeta.get(code)?.unit ?? "";

  // Each requested id is a logical key or a measured metric code; keep only ids with data, one per code
  const keyByCode = new Map((Object.keys(EVAL_METRIC_CODES) as EvalMetricKey[]).map((key) => [metricCode(key), key]));
  const effective: { id: string; key: EvalMetricKey | null; code: string }[] = [];
  for (const id of selection.metricKeys ?? defaultHeadlineKeys(bests)) {
    const key = isKey(id) ? id : (keyByCode.get(id) ?? null);
    const code = key ? metricCode(key) : id;
    if (bests.has(code) && !effective.some((e) => e.code === code)) effective.push({ id: key ?? code, key, code });
  }
  const shownMetrics = effective.filter((e) => e.key !== "MQI");

  const tierAthlete = { gender: athlete.gender, birthDate: athlete.birthDate, sport: athlete.sport };
  const results = shownMetrics.map<EvalMetricResult>(({ key, code }) => {
    const value = bests.get(code)!;
    const unit = unitOf(code, scoped);
    const lowerIsBetter = input.metricMeta.get(code)?.lowerIsBetter ?? false;
    const priorValue = sectionOn.retestTrend && prior ? prior.bests.get(code) : undefined;
    const isDuration = input.metricMeta.get(code)?.displayFormat === "duration";
    return {
      key,
      code,
      label: key ? METRIC_LABELS[key] : (OTHER_METRIC_LABELS[code] ?? code),
      value,
      unit,
      ...(isDuration ? { displayFormat: "duration" as const } : {}),
      comparison: sectionOn.ageGroupComparison
        ? matchTierGroup({
            metricCode: code, value, lowerIsBetter, athlete: tierAthlete, eventDate: event.date, candidates: input.benchmarks,
          })
        : null,
      collegeStandard: matchCollegeStandard({ metricCode: code, value, athlete: tierAthlete, candidates: input.benchmarks }),
      collegeGauge: selection.metricCollegeGauge?.[key ?? code] ?? collegeGauge,
      trend:
        priorValue === undefined || !prior
          ? null
          : retestTrend({ code, unit, value }, { code, unit: unitOf(code, prior.scoped), value: priorValue }, lowerIsBetter),
    };
  });

  const freshAndHealthy: EvalReportModel["freshAndHealthy"] = {};
  if (sectionOn.freshAndHealthy) {
    if (input.load) freshAndHealthy.load = input.load;
    const balance = balanceLine({
      left: bests.get(metricCode("505_LEFT")) ?? null,
      right: bests.get(metricCode("505_RIGHT")) ?? null,
      hasTierSet: hasLsiTierSet({
        metricCode: metricCode("505_LSI"), athlete: tierAthlete, eventDate: event.date, candidates: input.benchmarks,
      }),
    });
    if (balance) freshAndHealthy.balance = balance;
    const movement = effective.some((e) => e.key === "MQI") ? movementBand(bests.get(metricCode("MQI"))) : null;
    if (movement) freshAndHealthy.movement = movement;
  }

  // Strengths, development areas and the limiter only rank metrics that have a logical key
  const rankable = results.flatMap((m) => (m.key ? [{ key: m.key, match: m.comparison }] : []));
  const suggested = strengthsAndLimiter(rankable);
  const shown = new Set<string>(rankable.map((m) => m.key));
  const onlyShown = (keys: readonly string[]) => keys.filter((k): k is EvalMetricKey => isKey(k) && shown.has(k));
  const strengths = input.overrides.strengths ? onlyShown(input.overrides.strengths) : suggested.strengths;
  const developmentAreas = (input.overrides.developmentAreas ? onlyShown(input.overrides.developmentAreas) : suggested.developmentAreas).filter(
    (k) => !strengths.includes(k),
  );
  const { limiter: limiterOverride } = input.overrides;
  let limiter = suggested.limiter;
  if (limiterOverride === null) limiter = null;
  else if (limiterOverride !== undefined) {
    if (!isKey(limiterOverride) || !shown.has(limiterOverride)) throw new EvalReportInputError("invalid_override");
    limiter = limiterOverride;
  }

  // Radar bests use each axis's fixed direction (no site_metrics needed) and never touch the headline 5-0-5
  const radar = sectionOn.radar
    ? buildRadar({
        bests: eventBests(
          { eventId: event.id, userId: athlete.id, organizationId: event.organizationId },
          scoped,
          (code) => RADAR_LOWER_IS_BETTER.has(code),
        ),
        unitOf: (code) => unitOf(code, scoped),
        gender: athlete.gender,
        age,
        cohort: input.radar ?? { kind: "norm", distributions: [] },
        mqiTotal: bests.get(metricCode("MQI")),
      })
    : null;

  return {
    athlete: {
      name: athlete.name,
      age,
      graduationYear: athlete.graduationYear,
      sport: athlete.sport,
      team: scoped.find((r) => r.teamNameSnapshot)?.teamNameSnapshot ?? null,
    },
    eventDate: event.date,
    metrics: results,
    freshAndHealthy,
    strengths: sectionOn.strengths ? strengths : [],
    developmentAreas: sectionOn.strengths ? developmentAreas : [],
    limiter: sectionOn.strengths ? limiter : null,
    coachNote: sectionOn.coachNote ? input.coachNote : null,
    selection: { preset, metricKeys: effective.map((e) => e.id), collegeGauge, ...sectionOn },
    ...(radar ? { modelVersion: 2, radar } : {}),
  };
}

/** Pre-fill for the selection screen when nothing has been saved yet. */
export function computeEvalDefaults(input: EvalAssemblyInput) {
  const { bests } = scopedBests(input, input.event.id, input.rows);
  return {
    selection: {
      preset: presetOf(input),
      metricKeys: defaultHeadlineKeys(bests),
    },
    load: null,
    coachNote: null,
    offered: offeredMetrics(new Set(bests.keys())),
  };
}

export type EvalReportInputErrorCode = "event_has_no_organization" | "athlete_not_found" | "invalid_override" | "invalid_team";

/** HTTP answer for each input error code; an unlisted code is a server bug, not a 404. */
export function evalInputErrorResponse(code: EvalReportInputErrorCode): { status: number; message: string } {
  switch (code) {
    case "event_has_no_organization":
      return { status: 409, message: "Event has no organization" };
    case "invalid_override":
      return { status: 400, message: "Override names a metric that is not in the report" };
    case "athlete_not_found":
      return { status: 404, message: "Not found" };
    case "invalid_team":
      return { status: 400, message: "The team is not in this organization" };
    default: {
      const unhandled: never = code;
      console.error("Unhandled eval report input error code", unhandled);
      return { status: 500, message: "Failed to build eval report" };
    }
  }
}

export class EvalReportInputError extends Error {
  constructor(readonly code: EvalReportInputErrorCode) {
    super(code);
    this.name = "EvalReportInputError";
  }
}

/** Thin database loader: everything assembleEvalReportModel needs, scoped to one event and one athlete. */
export async function loadEvalReportInputs(
  db: Db,
  args: { event: Pick<Event, "id" | "organizationId" | "startDate">; athleteId: string },
): Promise<Omit<EvalAssemblyInput, "selection" | "load" | "coachNote" | "overrides">> {
  const { event } = args;
  if (!event.organizationId) throw new EvalReportInputError("event_has_no_organization");
  const organizationId = event.organizationId;
  const eventDate = eventCalendarDate(event);

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, args.athleteId), eq(users.isActive, true), isNull(users.deletedAt)))
    .limit(1);
  if (!user) throw new EvalReportInputError("athlete_not_found");

  const eventRows = (eventId: string) =>
    db
      .select({
        eventId: measurements.eventId,
        userId: measurements.userId,
        organizationId: measurements.organizationId,
        metric: measurements.metric,
        value: measurements.value,
        units: measurements.units,
        teamNameSnapshot: measurements.teamNameSnapshot,
        calculationMetadata: measurements.calculationMetadata,
        createdAt: measurements.createdAt,
      })
      .from(measurements)
      .where(
        and(
          eq(measurements.eventId, eventId),
          eq(measurements.userId, args.athleteId),
          eq(measurements.organizationId, organizationId),
          eq(measurements.isVerified, true),
        ),
      );

  const rows = await eventRows(event.id);

  // The athlete's other events in this organization, to find the latest earlier one
  const others = await db
    .selectDistinct({ id: events.id, startDate: events.startDate })
    .from(measurements)
    .innerJoin(events, eq(events.id, measurements.eventId))
    .where(
      and(
        eq(measurements.userId, args.athleteId),
        eq(measurements.organizationId, organizationId),
        eq(measurements.isVerified, true),
        eq(events.organizationId, organizationId),
        ne(events.id, event.id),
      ),
    );
  const current: EventRef = { id: event.id, date: eventDate, userId: args.athleteId, organizationId };
  const prior = selectPriorEvent(
    current,
    others.map((o) => ({ id: o.id, date: eventCalendarDate({ startDate: o.startDate }), userId: args.athleteId, organizationId })),
  );

  const priorRows = prior ? await eventRows(prior.id) : [];
  const codes = [...new Set([...Object.values(EVAL_METRIC_CODES), ...rows.map((r) => r.metric), ...priorRows.map((r) => r.metric)])];
  const metaRows = await db
    .select({ code: siteMetrics.code, unit: siteMetrics.unit, metricType: siteMetrics.metricType, displayFormat: siteMetrics.displayFormat })
    .from(siteMetrics)
    .where(inArray(siteMetrics.code, codes));

  const sport = user.sports?.[0] ?? null;
  const sex = user.gender === "Male" || user.gender === "Female" ? user.gender : null;
  // Rows for the athlete's sex in their sport, plus the sport-less left-right balance set (no sport needed)
  const lsiSet = and(isNull(siteBenchmarks.sport), eq(siteBenchmarks.metricCode, metricCode("505_LSI")));
  // An athlete with no sport gets the left-right set only (or() would silently drop an undefined arm)
  const sportOrLsi = sport ? or(sql`lower(${siteBenchmarks.sport}) = lower(${sport})`, lsiSet) : lsiSet;
  const benchmarkRows = sex
    ? await db
        .select()
        .from(siteBenchmarks)
        .where(and(eq(siteBenchmarks.isActive, true), eq(siteBenchmarks.gender, sex), sportOrLsi))
    : [];

  return {
    event: { id: event.id, organizationId, date: eventDate },
    athlete: {
      id: user.id,
      name: user.fullName,
      birthDate: user.birthDate,
      gender: user.gender,
      graduationYear: user.graduationYear,
      sport,
    },
    rows,
    priorEvent: prior ? { event: prior, rows: priorRows } : null,
    metricMeta: new Map(
      metaRows.map((m) => [m.code, { unit: m.unit, lowerIsBetter: m.metricType === "lower_is_better", displayFormat: m.displayFormat }]),
    ),
    benchmarks: benchmarkRows.map((b) => ({ ...b, _source: "site" })),
  };
}

/**
 * Load the comparison group of the radar for the coach's choice (AM-FEAT-024). Norm rows are filtered to the
 * athlete's sex and age at the event; event and team groups are every athlete's verified bests at this event,
 * in the event's organization. A team must belong to that organization.
 */
export async function loadRadarCohort(
  db: Db,
  args: {
    organizationId: string;
    eventId: string;
    eventDate: string;
    athlete: { gender: string | null; birthDate: string | null };
    cohort?: { kind: "norm" | "event" | "team"; teamId?: string };
  },
): Promise<RadarCohortInput> {
  const kind = args.cohort?.kind ?? "norm";
  if (kind === "norm") {
    const sex = sexOf(args.athlete.gender);
    const age = args.athlete.birthDate ? ageAtDate(args.athlete.birthDate, args.eventDate) : Number.NaN;
    if (!sex || !Number.isFinite(age)) return { kind, distributions: [] };
    const rows = await db
      .select({
        versionId: benchmarkDistributions.versionId,
        versionCreatedAt: benchmarkDistributionVersions.createdAt,
        source: benchmarkDistributionVersions.source,
        metricCode: benchmarkDistributions.metricCode,
        sex: benchmarkDistributions.sex,
        ageMin: benchmarkDistributions.ageMin,
        ageMax: benchmarkDistributions.ageMax,
        kind: benchmarkDistributions.kind,
        values: benchmarkDistributions.values,
      })
      .from(benchmarkDistributions)
      .innerJoin(benchmarkDistributionVersions, eq(benchmarkDistributionVersions.id, benchmarkDistributions.versionId))
      .where(
        and(
          eq(benchmarkDistributions.sex, sex),
          eq(benchmarkDistributions.kind, "raw"),
          inArray(benchmarkDistributions.metricCode, [...RADAR_NORM_CODES]),
          lte(benchmarkDistributions.ageMin, age),
          gte(benchmarkDistributions.ageMax, age),
        ),
      );
    return { kind, distributions: rows };
  }

  let label = "This event (all athletes)";
  let memberIds: string[] | null = null;
  if (kind === "team") {
    const [team] = args.cohort?.teamId
      ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(and(eq(teams.id, args.cohort.teamId), eq(teams.organizationId, args.organizationId))).limit(1)
      : [];
    if (!team) throw new EvalReportInputError("invalid_team");
    label = `${team.name} (whole team)`;
    memberIds = (await db.select({ userId: userTeams.userId }).from(userTeams).where(and(eq(userTeams.teamId, team.id), eq(userTeams.isActive, true)))).map((m) => m.userId);
    if (memberIds.length === 0) return { kind, label, peers: new Map() };
  }
  const rows = await db
    .select({ eventId: measurements.eventId, userId: measurements.userId, organizationId: measurements.organizationId, metric: measurements.metric, value: measurements.value })
    .from(measurements)
    .where(
      and(
        eq(measurements.eventId, args.eventId),
        eq(measurements.organizationId, args.organizationId),
        eq(measurements.isVerified, true),
        inArray(measurements.metric, [...RADAR_METRIC_CODES]),
        memberIds ? inArray(measurements.userId, memberIds) : undefined,
      ),
    );
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byUser.get(r.userId);
    if (list) list.push(r);
    else byUser.set(r.userId, [r]);
  }
  const peers = new Map(
    [...byUser].map(([userId, userRows]) => [
      userId,
      eventBests({ eventId: args.eventId, userId, organizationId: args.organizationId }, userRows, (code) => RADAR_LOWER_IS_BETTER.has(code)),
    ]),
  );
  return { kind, label, peers };
}

export async function buildEvalReportModel(
  db: Db,
  args: {
    event: Pick<Event, "id" | "organizationId" | "startDate">;
    athleteId: string;
    selection: EvalSelectionInput;
    load: LoadLevel | null;
    coachNote: string | null;
    overrides: EvalAssemblyInput["overrides"];
  },
): Promise<EvalReportModel> {
  const loaded = await loadEvalReportInputs(db, args);
  const radar = args.selection.sections?.radar
    ? await loadRadarCohort(db, {
        organizationId: loaded.event.organizationId,
        eventId: loaded.event.id,
        eventDate: loaded.event.date,
        athlete: loaded.athlete,
        cohort: args.selection.radarCohort,
      })
    : undefined;
  return assembleEvalReportModel({ ...loaded, selection: args.selection, load: args.load, coachNote: args.coachNote, overrides: args.overrides, radar });
}
