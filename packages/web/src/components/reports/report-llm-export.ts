/**
 * Builds the "Copy for LLM" export for ONE individual report from the data the report page already shows.
 * Report content only: the report's metrics, benchmarks and (when the report selects them) group comparison,
 * trends and F-V profile. Nothing outside the report is included: no other athletes' values, goals, wellness,
 * notes, ids or contact details.
 */

import { groupedCodes } from '@/lib/metric-groups';
import { isGroupComparisonOn, resolveChartSelection } from '@shared/report-charts';
import { formatMeasurement } from '@shared/duration-format';
import { isFly10Metric, formatFly10Dual } from '@/utils/fly10-conversion';
import { slugify, todayIsoUtc, type LlmExportFormat } from '@/hooks/use-llm-export';
import type { IndividualReportData, Report } from '@/types/report-types';

export interface LlmExportContent {
  content: string;
  filename: string;
  mimeType: string;
}

type ReportData = IndividualReportData & {
  eventContext?: { eventName?: string; eventDate?: string };
};

const datePart = (d: string | undefined | null) => (d ? String(d).slice(0, 10) : '');

export function buildReportLlmExport(
  report: Report,
  data: ReportData,
  format: LlmExportFormat,
): LlmExportContent {
  const { athlete } = data;
  const sel = resolveChartSelection(data.reportConfig);
  const comparison = isGroupComparisonOn(data.reportConfig);
  const labels = data.metricLabels ?? {};
  const units = data.metricUnits ?? {};
  const formats = data.metricFormats ?? {};
  const codes = Object.keys(athlete.measurements ?? {});

  const display = (code: string, v: number): string => {
    if (formats[code]) return formatMeasurement(v, formats[code]);
    if (isFly10Metric(code)) return formatFly10Dual(v);
    return `${v.toFixed(2)}${units[code] ? ` ${units[code]}` : ''}`;
  };

  const groups = groupedCodes(codes, data.metricGroups);
  const trends = sel.trends && data.trends ? data.trends : undefined;
  const fv = sel.fvProfile && data.fvProfile ? data.fvProfile : undefined;
  const eventName = data.eventContext?.eventName;
  const eventDate = datePart(data.eventContext?.eventDate);
  const written = report.coachingInsights
    ? { text: report.coachingInsights, date: datePart(report.coachingInsightsGeneratedAt) }
    : undefined;

  const header = {
    report: report.name,
    description: report.description || undefined,
    generatedAt: datePart(data.generatedAt),
    organization: data.orgBranding?.orgName || undefined,
    event: eventName ? { name: eventName, date: eventDate || undefined } : undefined,
    athlete: {
      name: athlete.userName,
      age: athlete.age,
      gender: athlete.gender,
      sports: athlete.sports?.length ? athlete.sports : undefined,
      teams: athlete.teams?.length ? athlete.teams : undefined,
    },
  };

  const filename = (ext: string) =>
    `${slugify(athlete.userName)}-${slugify(report.name)}-${todayIsoUtc()}.${ext}`;

  if (format === 'json') {
    const metrics = groups.flatMap((g) =>
      g.codes.map((code) => ({
        code,
        label: labels[code] || code,
        group: g.label ?? undefined,
        unit: units[code] || undefined,
        bestResult: athlete.measurements[code],
        ...(comparison && {
          groupAverage: athlete.teamAverages?.[code],
          percentile: athlete.percentiles?.[code],
        }),
        benchmarks: (athlete.benchmarkComparisons?.[code] ?? []).map((b) =>
          b.tierName
            ? {
                tierGroup: b.tierGroupName || b.benchmarkName,
                tier: b.tierName,
                nextTier: b.nextTierName ?? undefined,
                distanceToNextTier: b.distanceToNextTier ?? undefined,
                coachingNote: b.coachingNote || undefined,
              }
            : { name: b.benchmarkName, target: b.benchmarkValue, meetsOrExceeds: b.meetsOrExceeds },
        ),
      })),
    );
    const out = {
      ...header,
      metrics,
      trends: trends && Object.fromEntries(
        Object.entries(trends).map(([code, t]) => [
          code,
          { label: labels[code] || code, unit: units[code] || undefined, series: t.series },
        ]),
      ),
      fvProfile: fv && {
        date: fv.date, distanceUnit: fv.distanceUnit, f0Rel: fv.f0Rel, v0: fv.v0,
        pmaxRel: fv.pmaxRel, fvSlope: fv.fvSlope, fitR2: fv.fitR2,
      },
      coachingInsights: written && { text: written.text, evaluationWritten: written.date || undefined },
      glossary: Object.fromEntries(
        codes.filter((c) => data.metricExplanations?.[c]).map((c) => [c, data.metricExplanations![c]]),
      ),
    };
    return { content: JSON.stringify(out, null, 2), filename: filename('json'), mimeType: 'application/json' };
  }

  const L: string[] = [`# ${report.name}`, ''];
  if (report.description) L.push(report.description, '');
  L.push(`- Athlete: ${athlete.userName}`);
  if (athlete.age) L.push(`- Age: ${athlete.age}`);
  if (athlete.gender) L.push(`- Gender: ${athlete.gender}`);
  if (athlete.sports?.length) L.push(`- Sports: ${athlete.sports.join(', ')}`);
  if (athlete.teams?.length) L.push(`- Teams: ${athlete.teams.join(', ')}`);
  if (header.organization) L.push(`- Organization: ${header.organization}`);
  if (eventName) L.push(`- Event: ${eventName}${eventDate ? ` (${eventDate})` : ''}`);
  L.push(`- Generated: ${header.generatedAt}`, '', '## Performance Summary', '');
  for (const g of groups) {
    if (g.label) L.push(`### ${g.label}`, '');
    for (const code of g.codes) {
      const parts = [`best ${display(code, athlete.measurements[code])}`];
      const avg = athlete.teamAverages?.[code];
      const pct = athlete.percentiles?.[code];
      if (comparison && avg !== undefined) parts.push(`group average ${display(code, avg)}`);
      if (comparison && pct !== undefined) parts.push(`${pct.toFixed(1)}th percentile`);
      L.push(`- ${labels[code] || code}: ${parts.join('; ')}`);
      for (const b of athlete.benchmarkComparisons?.[code] ?? []) {
        if (b.tierName) {
          const next = b.nextTierName
            ? `; next tier ${b.nextTierName}${b.distanceToNextTier != null ? ` (${display(code, b.distanceToNextTier)} away)` : ''}`
            : '';
          L.push(`  - ${b.tierGroupName || b.benchmarkName}: ${b.tierName}${next}${b.coachingNote ? `. ${b.coachingNote}` : ''}`);
        } else {
          L.push(`  - ${b.benchmarkName}: target ${display(code, b.benchmarkValue)}, ${b.meetsOrExceeds ? 'meets' : 'below'}`);
        }
      }
    }
    L.push('');
  }
  if (trends) {
    L.push('## Progress Over Time', '');
    for (const [code, t] of Object.entries(trends)) {
      L.push(`- ${labels[code] || code}: ${t.series.map((p) => `${p.date} ${display(code, p.value)}`).join(', ')}`);
    }
    L.push('');
  }
  if (fv) {
    L.push(
      '## Force-Velocity Profile', '',
      `- Session: ${fv.date} (${fv.distanceUnit} protocol)`,
      `- F0 (relative): ${fv.f0Rel ?? 'n/a'}`,
      `- V0: ${fv.v0 ?? 'n/a'}`,
      `- Pmax (relative): ${fv.pmaxRel ?? 'n/a'}`,
      `- F-V slope: ${fv.fvSlope ?? 'n/a'}`,
      `- Fit R²: ${fv.fitR2 ?? 'n/a'}`,
      '',
    );
  }
  if (written) {
    L.push('## Coaching Insights', '', written.text, '');
    if (written.date) L.push(`Evaluation Written: ${written.date}`, '');
  }
  const glossary = codes.filter((c) => data.metricExplanations?.[c]);
  if (glossary.length) {
    L.push('## Metric Glossary', '');
    for (const c of glossary) {
      const e = data.metricExplanations![c];
      L.push(`- ${e.title}: ${e.shortDescription} ${e.unitNote}`);
    }
  }
  return { content: L.join('\n').trimEnd() + '\n', filename: filename('md'), mimeType: 'text/markdown' };
}
