// packages/web/src/components/reports/LeaderboardBarSection.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart } from '@/components/charts/BarChart';
import { sortAthletesByMetric } from '@/lib/report-utils';
import { buildStatisticalSummary } from '@/components/charts/chart-stats-utils';
import type { AthleteRanking, TeamStatistic } from '@/types/report-types';
import type { ChartDataPoint } from '@shared/analytics-types';
import { MetricGroupBlocks } from './MetricGroupHeading';
import type { MetricGroup } from '@shared/metric-order';

interface Props {
  athleteRankings: AthleteRanking[];
  teamStatistics: TeamStatistic[];
  metricLabels?: Record<string, string>;
  generatedAt: string;
  /** The report's resolved team name(s) (e.g. "Varsity Squad"), shown in each
   *  athlete's hover tooltip. Every athlete plotted here is already scoped to
   *  this report's roster, so without this the shared chart tooltip's
   *  `teamName || 'Independent'` fallback incorrectly labels every athlete
   *  as unaffiliated. */
  teamName?: string;
  metricGroups?: MetricGroup[];
}

export function LeaderboardBarSection({ athleteRankings, teamStatistics, metricLabels = {}, generatedAt, teamName, metricGroups }: Props) {
  const rows = teamStatistics
    .map((stat) => ({ stat, sorted: sortAthletesByMetric(athleteRankings, stat.metric) }))
    .filter(({ sorted }) => sorted.length > 0);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leaderboard</CardTitle>
        <CardDescription>Ranked performance per metric, best to worst</CardDescription>
      </CardHeader>
      <CardContent className="space-y-10">
        <MetricGroupBlocks
          codes={rows.map(({ stat }) => stat.metric)}
          metricGroups={metricGroups}
          className="space-y-10"
          render={(code) => {
          const { stat, sorted } = rows.find((r) => r.stat.metric === code)!;
          const label = metricLabels[stat.metric] || stat.metric;
          const points: ChartDataPoint[] = sorted.map((athlete) => ({
            athleteId: athlete.userId,
            athleteName: athlete.userName,
            value: athlete.measurements[stat.metric],
            date: new Date(generatedAt),
            metric: stat.metric,
            teamName,
          }));
          const statistics = { [stat.metric]: buildStatisticalSummary(points.map((p) => p.value)) };

          return (
            <div key={stat.metric} data-report-chart={`leaderboard:${stat.metric}`} data-report-chart-title={`${label} — leaderboard`} className="h-[420px]">
              <BarChart
                data={points}
                config={{ type: 'bar_chart', title: label, showLegend: false, showTooltips: true, responsive: true }}
                statistics={statistics}
              />
            </div>
          );
          }}
        />
      </CardContent>
    </Card>
  );
}

export default LeaderboardBarSection;
