// packages/web/src/components/reports/TeamBoxSwarmSection.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BoxPlotChart } from '@/components/charts/BoxPlotChart';
import { buildStatisticalSummary } from '@/components/charts/chart-stats-utils';
import type { TeamReportDistributions } from '@shared/report-trends-types';
import type { ChartDataPoint } from '@shared/analytics-types';

interface Props {
  distributions: TeamReportDistributions;
  metricLabels?: Record<string, string>;
  generatedAt: string;
}

export function TeamBoxSwarmSection({ distributions, metricLabels = {}, generatedAt }: Props) {
  const entries = Object.entries(distributions).filter(([, dist]) => dist.athletes.length >= 2);
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Distribution</CardTitle>
        <CardDescription>The spread of every athlete's performance per metric</CardDescription>
      </CardHeader>
      <CardContent className="space-y-10">
        {entries.map(([code, dist]) => {
          const label = metricLabels[code] || code;
          const points: ChartDataPoint[] = dist.athletes.map((a) => ({
            athleteId: a.athleteId,
            athleteName: a.athleteName,
            value: a.value,
            date: new Date(generatedAt),
            metric: code,
          }));
          const statistics = { [code]: buildStatisticalSummary(dist.values) };

          return (
            <div key={code} data-report-chart={`boxswarm:${code}`} data-report-chart-title={`${label} — team distribution`} className="space-y-4">
              <h3 className="text-base font-semibold">{label}</h3>
              <div className="h-[340px]">
                <BoxPlotChart
                  data={points}
                  config={{ type: 'box_plot', title: `${label} — spread`, showLegend: false, showTooltips: true, responsive: true }}
                  statistics={statistics}
                  showAllPoints
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default TeamBoxSwarmSection;
