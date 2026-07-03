// packages/web/src/components/reports/TeamBenchmarkStandingSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TierProgressChart } from '@/components/charts/TierProgressChart';
import { BenchmarkStandingBar } from '@/components/charts/BenchmarkStandingBar';
import { evaluateTierStanding } from '@/components/charts/tier-progress-utils';
import { deriveTierGroupName } from '@shared/benchmark-utils';
import { useMetricConfig } from '@/hooks/use-metric-config';
import type { BenchmarkComparison } from '@shared/benchmark-types';
import type { TeamStatistic } from '@/types/report-types';

interface Props {
  teamStatistics: TeamStatistic[];
  metricLabels?: Record<string, string>;
  metricUnits?: Record<string, string>;
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

export function TeamBenchmarkStandingSection({ teamStatistics, metricLabels = {}, metricUnits = {} }: Props) {
  const { getMetricConfig } = useMetricConfig();
  const rows = teamStatistics
    .map((stat) => ({
      stat,
      comparisons: buildTeamComparisons(stat, getMetricConfig(stat.metric)?.lowerIsBetter ?? false),
    }))
    .filter(({ comparisons }) => comparisons.length > 0);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle>Team Benchmark Standing</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {rows.map(({ stat, comparisons }) =>
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
              />
            ) : (
              <BenchmarkStandingBar
                key={`${stat.metric}-${i}`}
                label={label}
                metricCode={stat.metric}
                comparison={comparison}
                unit={unit}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default TeamBenchmarkStandingSection;
