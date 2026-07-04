// packages/web/src/components/reports/TeamBenchmarkStandingSection.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TierProgressChart } from '@/components/charts/TierProgressChart';
import { BenchmarkStandingBar } from '@/components/charts/BenchmarkStandingBar';
import type { AthleteMarkerValue } from '@/components/charts/BenchmarkStandingBar';
import { evaluateTierStanding } from '@/components/charts/tier-progress-utils';
import { deriveTierGroupName } from '@shared/benchmark-utils';
import { formatDateRange } from './report-utils';
import type { BenchmarkComparison } from '@shared/benchmark-types';
import type { TeamStatistic, AthleteRanking, TimeframeConfig } from '@/types/report-types';

interface Props {
  teamStatistics: TeamStatistic[];
  metricLabels?: Record<string, string>;
  metricUnits?: Record<string, string>;
  /** Per-metric direction from the report payload (server-computed) — not
   *  derived client-side, since this section also renders on the public
   *  report view, which has no authenticated org context. */
  metricDirections?: Record<string, 'higher' | 'lower'>;
  /** Per-athlete rankings for the same report. When provided, each chart also
   *  plots one small marker per athlete (their best value within the report's
   *  timeframe for that metric) alongside the bold team-average marker. */
  athleteRankings?: AthleteRanking[];
  /** The report's overall timeframe, used only to caption the section with the
   *  date range each athlete's plotted (best-in-range) value was drawn from. */
  timeframe?: TimeframeConfig;
}

/** Per-athlete values for one metric, built from athleteRankings — athletes with no
 *  recorded value for this metric are omitted (a benchmark chart can't plot them). */
function buildAthleteValuesForMetric(metric: string, athleteRankings: AthleteRanking[]): AthleteMarkerValue[] {
  return athleteRankings
    .filter((a) => a.measurements[metric] != null)
    .map((a) => ({ athleteId: a.userId, athleteName: a.userName, value: a.measurements[metric] }));
}

/**
 * Build one synthetic BenchmarkComparison per benchmark for a metric's team
 * average — a tiered group of Benchmark rows (sharing tierGroupId) becomes ONE
 * tiered comparison (rendered via TierProgressChart); a standalone single-value
 * benchmark becomes its own comparison (rendered via BenchmarkStandingBar).
 * Mirrors the same TierProgressChart-vs-BenchmarkStandingBar decision
 * IndividualReportView makes, just fed team-average data instead of one
 * athlete's value.
 */
function buildTeamComparisons(stat: TeamStatistic, lowerIsBetter: boolean): BenchmarkComparison[] {
  if (stat.average == null || !stat.benchmarks || stat.benchmarks.length === 0) return [];

  const comparisons: BenchmarkComparison[] = [];

  const tieredGroups = new Map<string, NonNullable<TeamStatistic['benchmarks']>>();
  const singleValue: NonNullable<TeamStatistic['benchmarks']> = [];

  for (const b of stat.benchmarks) {
    if (b.tierGroupId) {
      const group = tieredGroups.get(b.tierGroupId) ?? [];
      group.push(b);
      tieredGroups.set(b.tierGroupId, group);
    } else {
      singleValue.push(b);
    }
  }

  for (const group of tieredGroups.values()) {
    const allTiers = group
      .filter((b) => b.tierName)
      .map((b) => ({
        tierName: b.tierName!,
        tierColor: b.tierColor || 'gray',
        tierOrder: b.tierOrder ?? 0,
        minValue: b.minValue ?? null,
        maxValue: b.maxValue ?? null,
      }));
    if (allTiers.length === 0) continue;
    const tierGroupName = deriveTierGroupName(group[0]?.name || '');
    comparisons.push(evaluateTierStanding(stat.average!, allTiers, tierGroupName, lowerIsBetter));
  }

  for (const b of singleValue) {
    if (b.value == null || !b.comparisonOperator) continue;
    const meets =
      b.comparisonOperator === 'gte' ? stat.average! >= b.value
      : b.comparisonOperator === 'lte' ? stat.average! <= b.value
      : Math.abs(stat.average! - b.value) < 0.01;
    comparisons.push({
      benchmarkName: b.name,
      benchmarkValue: b.value,
      athleteValue: stat.average!,
      meetsOrExceeds: meets,
      percentageDiff: b.value !== 0 ? ((stat.average! - b.value) / Math.abs(b.value)) * 100 : 0,
      comparisonOperator: b.comparisonOperator,
    });
  }

  return comparisons;
}

export function TeamBenchmarkStandingSection({
  teamStatistics,
  metricLabels = {},
  metricUnits = {},
  metricDirections = {},
  athleteRankings = [],
  timeframe,
}: Props) {
  const rows = teamStatistics
    .map((stat) => ({
      stat,
      comparisons: buildTeamComparisons(stat, metricDirections[stat.metric] === 'lower'),
      athleteValues: buildAthleteValuesForMetric(stat.metric, athleteRankings),
    }))
    .filter(({ comparisons }) => comparisons.length > 0);

  if (rows.length === 0) return null;

  // Echoed in each athlete-marker tooltip so "best" is unambiguous without
  // looking back up at this header — omitted (not a vague fallback string)
  // when the report has no timeframe, so the tooltip never references an
  // undefined "range".
  const rangeLabel = timeframe ? formatDateRange(timeframe) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Benchmark Standing</CardTitle>
        {timeframe && (
          <CardDescription>Best performance within {formatDateRange(timeframe)}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map(({ stat, comparisons, athleteValues }) =>
          comparisons.map((comparison, i) => {
            const label = metricLabels[stat.metric] || stat.metric;
            const unit = metricUnits[stat.metric] ?? stat.units;
            return comparison.allTiers && comparison.allTiers.length > 0 ? (
              <TierProgressChart
                key={`${stat.metric}-${i}`}
                label={label}
                metricCode={stat.metric}
                comparison={comparison}
                unit={unit}
                athleteValues={athleteValues}
                rangeLabel={rangeLabel}
              />
            ) : (
              <BenchmarkStandingBar
                key={`${stat.metric}-${i}`}
                label={label}
                metricCode={stat.metric}
                comparison={comparison}
                unit={unit}
                athleteValues={athleteValues}
                rangeLabel={rangeLabel}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default TeamBenchmarkStandingSection;
