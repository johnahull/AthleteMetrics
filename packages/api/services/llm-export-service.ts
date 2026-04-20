/**
 * LLM Export Service
 *
 * Assembles an athlete-centric export designed for paste-into-LLM program design.
 * V1 scope: demographics, current values, 12-month history, Sprint F-V profile,
 * active goals, recent wellness, medical/coach notes, metric glossary.
 * V2 will extract percentile/benchmark logic from report-service.ts and include it here.
 */

import { db } from '../db';
import {
  users,
  userTeams,
  teams,
  measurements,
  athleteProfiles,
  organizations,
  siteMetrics,
} from '@shared/schema';
import { goals } from '@shared/schema/tables/gamification';
import { wellnessResponses } from '@shared/schema/tables/wellness';
import { sprintFvProfiles } from '@shared/schema/tables/sprint-fv-profiles';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import {
  buildMetricExplanationsMap,
  type MetricExplanation,
} from '@shared/metric-explanations';

// ---------- Types ----------

export type ExportFormat = 'markdown' | 'json';

export interface AthleteExportData {
  generatedAt: Date;
  athlete: {
    id: string;
    fullName: string;
    age: number | null;
    gender: string | null;
    graduationYear: number | null;
    heightIn: number | null;
    weightLb: number | null;
    sports: string[];
    positions: string[];
    teams: Array<{ name: string; level: string | null; season: string | null }>;
  };
  organization: { id: string; name: string } | null;
  currentSnapshot: Array<{
    metricCode: string;
    metricLabel: string;
    value: number;
    units: string;
    date: string;
  }>;
  measurementHistory: Record<
    string,
    Array<{ date: string; value: number; units: string }>
  >;
  sprintFv: {
    date: string;
    f0Rel: number | null;
    v0: number | null;
    pmaxRel: number | null;
    fvSlope: number | null;
    rfPeak: number | null;
    drf: number | null;
    fitR2: number | null;
    classification: string | null;
    gap: unknown;
    deltas: unknown;
    trainingRecommendations: string[];
    notes: string | null;
  } | null;
  activeGoals: Array<{
    metricCode: string;
    metricLabel: string;
    goalType: string;
    baselineValue: number;
    currentValue: number;
    targetValue: number;
    targetDate: string;
    units: string;
    notes: string | null;
  }>;
  recentWellness: Array<{
    date: string;
    submittedAt: string;
    responses: Record<string, unknown>;
  }>;
  notes: { medicalNotes: string | null; coachNotes: string | null };
  metricGlossary: Record<string, { label: string; units: string; explanation: string }>;
  warnings: string[];
}

export interface AthleteLlmExport extends Omit<AthleteExportData, 'generatedAt'> {
  generatedAt: string;
}

// ---------- Pure utilities ----------

const EMPTY = '_No data yet._';

function escapeCell(v: string): string {
  return v.replace(/\|/g, '\\|');
}

function fmtNum(n: number): string {
  return Number.isFinite(n) ? String(n) : '—';
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function filenameFor(fullName: string, format: ExportFormat, date: Date): string {
  const withoutDiacritics = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const withoutPipes = withoutDiacritics.replace(/\|/g, '');
  const slugged = withoutPipes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const ext = format === 'markdown' ? 'md' : 'json';
  return `${slugged}-${fmtDate(date)}.${ext}`;
}

// ---------- Markdown renderer ----------

const PROMPT_SUGGESTION =
  '**Prompt suggestion:** Using the data above, design a 6-week off-season training block for this athlete. Prioritize their F-V deficit classification and active goals. Flag any metric where recent values are trending in the wrong direction as a development priority. Return the plan as a week-by-week table with sets, reps, and intent for each session.';

function renderProfileSection(d: AthleteExportData): string {
  const a = d.athlete;
  const lines: string[] = ['## Athlete Profile'];
  const ageStr = a.age != null ? `Age ${a.age}` : 'Age —';
  const genderStr = a.gender ?? '—';
  const gradStr = a.graduationYear != null ? `Class of ${a.graduationYear}` : 'Class —';
  lines.push(`- ${ageStr} · ${genderStr} · ${gradStr}`);
  const heightStr = a.heightIn != null ? `${a.heightIn} in` : '—';
  const weightStr = a.weightLb != null ? `${a.weightLb} lb` : '—';
  lines.push(`- Height: ${heightStr} · Weight: ${weightStr}`);
  lines.push(`- Sports: ${a.sports.length ? a.sports.join(', ') : '—'}`);
  lines.push(`- Positions: ${a.positions.length ? a.positions.join(', ') : '—'}`);
  if (a.teams.length) {
    const teamStrs = a.teams.map((t) => {
      const parts = [t.name];
      if (t.level) parts.push(t.level);
      if (t.season) parts.push(t.season);
      return parts.join(' · ');
    });
    lines.push(`- Teams: ${teamStrs.join('; ')}`);
  } else {
    lines.push('- Teams: —');
  }
  return lines.join('\n');
}

function renderSnapshotSection(d: AthleteExportData): string {
  const lines: string[] = ['## Current Performance Snapshot'];
  if (!d.currentSnapshot.length) {
    lines.push('', EMPTY);
    return lines.join('\n');
  }
  lines.push('', '| Metric | Value | Unit | Date |', '|---|---|---|---|');
  for (const row of d.currentSnapshot) {
    lines.push(
      `| ${escapeCell(row.metricLabel)} | ${fmtNum(row.value)} | ${escapeCell(row.units)} | ${row.date} |`,
    );
  }
  return lines.join('\n');
}

function renderHistorySection(d: AthleteExportData): string {
  const lines: string[] = ['## 12-Month Measurement History'];
  const codes = Object.keys(d.measurementHistory);
  if (!codes.length) {
    lines.push('', EMPTY);
    return lines.join('\n');
  }
  for (const code of codes) {
    const rows = d.measurementHistory[code];
    if (!rows || !rows.length) continue;
    const label = d.metricGlossary[code]?.label ?? code;
    const units = d.metricGlossary[code]?.units ?? rows[0]?.units ?? '';
    lines.push('', `### ${escapeCell(label)}${units ? ` (${units})` : ''}`);
    lines.push('| Date | Value |', '|---|---|');
    for (const r of rows) {
      lines.push(`| ${r.date} | ${fmtNum(r.value)}${units ? ` ${escapeCell(units)}` : ''} |`);
    }
  }
  return lines.join('\n');
}

function renderFvSection(d: AthleteExportData): string {
  const lines: string[] = ['## Sprint Force-Velocity Profile'];
  const fv = d.sprintFv;
  if (!fv) {
    lines.push('', EMPTY);
    return lines.join('\n');
  }
  lines.push('', `*Most recent session: ${fv.date}*`, '');
  lines.push(`- F0 (relative): ${fv.f0Rel != null ? `${fv.f0Rel} N/kg` : '—'}`);
  lines.push(`- V0: ${fv.v0 != null ? `${fv.v0} m/s` : '—'}`);
  lines.push(`- Pmax (relative): ${fv.pmaxRel != null ? `${fv.pmaxRel} W/kg` : '—'}`);
  lines.push(`- FV slope: ${fv.fvSlope != null ? fv.fvSlope : '—'}`);
  lines.push(`- RFpeak: ${fv.rfPeak != null ? fv.rfPeak : '—'}`);
  lines.push(`- DRF: ${fv.drf != null ? fv.drf : '—'}`);
  if (fv.fitR2 != null) lines.push(`- Model fit (R²): ${fv.fitR2}`);
  lines.push('', `**Classification:** ${fv.classification ?? '—'}`);
  if (fv.gap !== null && fv.gap !== undefined) {
    lines.push(`**F-V imbalance gap:** ${JSON.stringify(fv.gap)}`);
  }
  if (fv.deltas !== null && fv.deltas !== undefined) {
    lines.push(`**Deltas vs optimal:** ${JSON.stringify(fv.deltas)}`);
  }
  if (fv.trainingRecommendations.length) {
    lines.push('', '**Training recommendations:**');
    for (const rec of fv.trainingRecommendations) {
      lines.push(`- ${rec}`);
    }
  }
  if (fv.notes) {
    lines.push('', `*Notes:* ${fv.notes}`);
  }
  return lines.join('\n');
}

function renderGoalsSection(d: AthleteExportData): string {
  const lines: string[] = ['## Active Goals'];
  if (!d.activeGoals.length) {
    lines.push('', EMPTY);
    return lines.join('\n');
  }
  lines.push('');
  for (const g of d.activeGoals) {
    const parts = [
      `${escapeCell(g.metricLabel)}:`,
      `baseline ${fmtNum(g.baselineValue)} ${g.units}`,
      `→ current ${fmtNum(g.currentValue)} ${g.units}`,
      `→ target ${fmtNum(g.targetValue)} ${g.units}`,
      `by ${g.targetDate}`,
      `(${g.goalType})`,
    ];
    lines.push(`- ${parts.join(' ')}`);
    if (g.notes) lines.push(`  - Notes: ${g.notes}`);
  }
  return lines.join('\n');
}

function renderWellnessSection(d: AthleteExportData): string {
  const lines: string[] = ['## Recent Wellness'];
  if (!d.recentWellness.length) {
    lines.push('', EMPTY);
    return lines.join('\n');
  }
  lines.push('', '| Date | Responses |', '|---|---|');
  for (const w of d.recentWellness) {
    const summary = Object.entries(w.responses)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(', ');
    lines.push(`| ${w.date} | ${escapeCell(summary)} |`);
  }
  return lines.join('\n');
}

function renderNotesSection(d: AthleteExportData): string {
  const lines: string[] = ['## Medical & Coach Notes'];
  const m = d.notes.medicalNotes;
  const c = d.notes.coachNotes;
  if (!m && !c) {
    lines.push('', EMPTY);
    return lines.join('\n');
  }
  lines.push('');
  lines.push(`- **Medical:** ${m ?? '_none on file_'}`);
  lines.push(`- **Coach:** ${c ?? '_none on file_'}`);
  return lines.join('\n');
}

function renderGlossarySection(d: AthleteExportData): string {
  const lines: string[] = ['## Metric Glossary'];
  const entries = Object.entries(d.metricGlossary);
  if (!entries.length) {
    lines.push('', EMPTY);
    return lines.join('\n');
  }
  lines.push('');
  for (const [code, g] of entries) {
    lines.push(`- **${code}** (${g.label}${g.units ? `, ${g.units}` : ''}): ${g.explanation}`);
  }
  return lines.join('\n');
}

export function renderMarkdown(d: AthleteExportData): string {
  const header = [
    `# Athlete Performance Export — ${escapeCell(d.athlete.fullName)}`,
    `*Generated ${d.generatedAt.toISOString()}${d.organization ? ` · ${d.organization.name}` : ''}*`,
  ].join('\n');

  const body = [
    renderProfileSection(d),
    renderSnapshotSection(d),
    renderHistorySection(d),
    renderFvSection(d),
    renderGoalsSection(d),
    renderWellnessSection(d),
    renderNotesSection(d),
    renderGlossarySection(d),
  ].join('\n\n');

  const warningsFooter = d.warnings.length
    ? `\n\n---\n\n**Warnings:** Some data could not be loaded.\n${d.warnings.map((w) => `- ${w}`).join('\n')}`
    : '';

  const promptFooter = `\n\n---\n\n${PROMPT_SUGGESTION}`;

  return `${header}\n\n${body}${warningsFooter}${promptFooter}`;
}

// ---------- JSON renderer ----------

export function renderJson(d: AthleteExportData): AthleteLlmExport {
  return {
    ...d,
    generatedAt: d.generatedAt.toISOString(),
  };
}

// ---------- Data gatherer ----------

async function loadMetricGlossary(
  codes: string[],
): Promise<Record<string, { label: string; units: string; explanation: string }>> {
  if (!codes.length) return {};
  const rows = await db
    .select({
      code: siteMetrics.code,
      label: siteMetrics.label,
      unit: siteMetrics.unit,
      whatItMeasures: siteMetrics.whatItMeasures,
      shortDescription: siteMetrics.shortDescription,
    })
    .from(siteMetrics)
    .where(inArray(siteMetrics.code, codes));

  const explanationMap: Record<string, MetricExplanation> =
    buildMetricExplanationsMap(codes);

  const siteCodes = new Set(rows.map((r) => r.code));
  const out: Record<string, { label: string; units: string; explanation: string }> = {};
  for (const r of rows) {
    const expl = explanationMap[r.code];
    out[r.code] = {
      label: r.label ?? expl?.title ?? r.code,
      units: r.unit ?? expl?.unitNote ?? '',
      explanation:
        r.whatItMeasures ??
        r.shortDescription ??
        expl?.whatItMeasures ??
        'No explanation available.',
    };
  }
  // Codes absent from site_metrics still deserve a glossary entry from static explanations.
  for (const code of codes) {
    if (siteCodes.has(code)) continue;
    const expl = explanationMap[code];
    if (!expl) continue;
    out[code] = {
      label: expl.title ?? code,
      units: expl.unitNote ?? '',
      explanation: expl.whatItMeasures ?? 'No explanation available.',
    };
  }
  return out;
}

export async function gatherAthleteExportData(
  athleteId: string,
  organizationId: string | null,
  opts: { monthsBack?: number } = {},
): Promise<AthleteExportData> {
  const monthsBack = opts.monthsBack ?? 12;
  const historyCutoff = new Date();
  historyCutoff.setMonth(historyCutoff.getMonth() - monthsBack);
  const cutoffStr = fmtDate(historyCutoff);

  const warnings: string[] = [];

  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[llm-export] ${label} failed`, err);
      warnings.push(`${label} unavailable`);
      return fallback;
    }
  };

  const [
    athleteRow,
    teamRows,
    orgRow,
    measurementRows,
    fvRow,
    goalRows,
    wellnessRows,
    profileRow,
  ] = await Promise.all([
    db.select().from(users).where(eq(users.id, athleteId)).limit(1).then((r) => r[0] ?? null),
    safe(
      'Team memberships',
      () =>
        db
          .select({
            name: teams.name,
            level: teams.level,
            season: userTeams.season,
          })
          .from(userTeams)
          .innerJoin(teams, eq(teams.id, userTeams.teamId))
          .where(and(eq(userTeams.userId, athleteId), eq(userTeams.isActive, true))),
      [] as Array<{ name: string; level: string | null; season: string | null }>,
    ),
    organizationId
      ? db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    safe(
      'Measurement history',
      () => {
        // When organizationId is null (site admin viewing an unaffiliated athlete),
        // scope by athlete identity alone. For all other callers we keep multi-tenant
        // isolation by requiring org match.
        const conditions = [
          eq(measurements.userId, athleteId),
          gte(measurements.date, cutoffStr),
        ];
        if (organizationId) {
          conditions.push(eq(measurements.organizationId, organizationId));
        }
        return db
          .select()
          .from(measurements)
          .where(and(...conditions))
          .orderBy(desc(measurements.date));
      },
      [] as Array<typeof measurements.$inferSelect>,
    ),
    safe(
      'Sprint F-V profile',
      () =>
        db
          .select()
          .from(sprintFvProfiles)
          .where(eq(sprintFvProfiles.userId, athleteId))
          .orderBy(desc(sprintFvProfiles.date))
          .limit(1)
          .then((r) => r[0] ?? null),
      null,
    ),
    safe(
      'Active goals',
      () =>
        db
          .select()
          .from(goals)
          .where(and(eq(goals.userId, athleteId), eq(goals.status, 'active')))
          .orderBy(desc(goals.targetDate)),
      [] as Array<typeof goals.$inferSelect>,
    ),
    safe(
      'Recent wellness responses',
      () =>
        db
          .select()
          .from(wellnessResponses)
          .where(eq(wellnessResponses.userId, athleteId))
          .orderBy(desc(wellnessResponses.submittedAt))
          .limit(10),
      [] as Array<typeof wellnessResponses.$inferSelect>,
    ),
    safe(
      'Athlete profile',
      () =>
        db
          .select()
          .from(athleteProfiles)
          .where(eq(athleteProfiles.userId, athleteId))
          .limit(1)
          .then((r) => r[0] ?? null),
      null,
    ),
  ]);

  if (!athleteRow) {
    throw new Error('Athlete not found');
  }

  // Group measurements into history + current snapshot (most recent per metric)
  const history: Record<string, Array<{ date: string; value: number; units: string }>> = {};
  for (const m of measurementRows) {
    const arr = history[m.metric] ?? [];
    arr.push({
      date: m.date,
      value: parseFloat(m.value),
      units: m.units ?? '',
    });
    history[m.metric] = arr;
  }

  const metricCodes = Object.keys(history);
  const glossary = await safe(
    'Metric glossary',
    () => loadMetricGlossary(metricCodes),
    {} as Record<string, { label: string; units: string; explanation: string }>,
  );

  const snapshot = metricCodes
    .map((code) => {
      const rows = history[code];
      if (!rows?.length) return null;
      const g = glossary[code];
      return {
        metricCode: code,
        metricLabel: g?.label ?? code,
        value: rows[0].value,
        units: g?.units ?? rows[0].units ?? '',
        date: rows[0].date,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Sprint F-V parsing (all decimals are strings coming out of drizzle)
  const fv = fvRow
    ? {
        date: fvRow.date,
        f0Rel: fvRow.f0Rel != null ? parseFloat(fvRow.f0Rel) : null,
        v0: fvRow.v0 != null ? parseFloat(fvRow.v0) : null,
        pmaxRel: fvRow.pmaxRel != null ? parseFloat(fvRow.pmaxRel) : null,
        fvSlope: fvRow.fvSlope != null ? parseFloat(fvRow.fvSlope) : null,
        rfPeak: fvRow.rfPeak != null ? parseFloat(fvRow.rfPeak) : null,
        drf: fvRow.drf != null ? parseFloat(fvRow.drf) : null,
        fitR2: fvRow.fitR2 != null ? parseFloat(fvRow.fitR2) : null,
        classification: fvRow.analysisJson?.classification?.classification ?? null,
        gap: fvRow.analysisJson?.optimalGap ?? null,
        deltas: fvRow.analysisJson?.deltas ?? null,
        trainingRecommendations:
          fvRow.analysisJson?.classification?.trainingRecommendations ?? [],
        notes: fvRow.notes ?? null,
      }
    : null;

  const activeGoals = goalRows.map((g) => ({
    metricCode: g.metric,
    metricLabel: glossary[g.metric]?.label ?? g.metric,
    goalType: g.goalType,
    baselineValue: parseFloat(g.baselineValue),
    currentValue: parseFloat(g.currentValue),
    targetValue: parseFloat(g.targetValue),
    targetDate: g.targetDate,
    units: glossary[g.metric]?.units ?? '',
    notes: g.notes ?? null,
  }));

  const recentWellness = wellnessRows.map((w) => ({
    date: w.date,
    submittedAt: w.submittedAt.toISOString(),
    responses: (w.responses as Record<string, unknown>) ?? {},
  }));

  // birthYear → age (matches report-service pattern)
  let age: number | null = null;
  if (athleteRow.birthYear) {
    age = new Date().getFullYear() - athleteRow.birthYear;
  } else if (athleteRow.birthDate) {
    const bd = new Date(athleteRow.birthDate);
    age = Math.floor((Date.now() - bd.getTime()) / (365.25 * 24 * 3600 * 1000));
  }

  return {
    generatedAt: new Date(),
    athlete: {
      id: athleteRow.id,
      fullName: athleteRow.fullName ?? `${athleteRow.firstName ?? ''} ${athleteRow.lastName ?? ''}`.trim(),
      age,
      gender: athleteRow.gender ?? null,
      graduationYear: athleteRow.graduationYear ?? null,
      heightIn: athleteRow.height != null ? parseFloat(String(athleteRow.height)) : null,
      weightLb: athleteRow.weight != null ? parseFloat(String(athleteRow.weight)) : null,
      sports: Array.isArray(athleteRow.sports) ? athleteRow.sports : [],
      positions: Array.isArray(athleteRow.positions) ? athleteRow.positions : [],
      teams: teamRows,
    },
    organization: orgRow,
    currentSnapshot: snapshot,
    measurementHistory: history,
    sprintFv: fv,
    activeGoals,
    recentWellness,
    notes: {
      medicalNotes: profileRow?.medicalNotes ?? null,
      coachNotes: profileRow?.coachNotes ?? null,
    },
    metricGlossary: glossary,
    warnings,
  };
}

// ---------- Orchestrator ----------

export async function buildAthleteLlmExport(
  athleteId: string,
  format: ExportFormat,
  opts: { organizationId: string | null; monthsBack?: number },
): Promise<{ content: string; filename: string; contentType: string }> {
  const data = await gatherAthleteExportData(athleteId, opts.organizationId, {
    monthsBack: opts.monthsBack,
  });
  const filename = filenameFor(data.athlete.fullName, format, data.generatedAt);

  if (format === 'markdown') {
    return {
      content: renderMarkdown(data),
      filename,
      contentType: 'text/markdown; charset=utf-8',
    };
  }
  return {
    content: JSON.stringify(renderJson(data), null, 2),
    filename,
    contentType: 'application/json; charset=utf-8',
  };
}
