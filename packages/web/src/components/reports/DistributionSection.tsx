import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BoxPlotChart } from '@/components/charts/BoxPlotChart';
import type { ReportDistributions } from '@shared/report-trends-types';
import type { StatisticalSummary } from '@shared/analytics-types';

interface Props {
  athleteId: string;
  athleteName: string;
  distributions: ReportDistributions;
  metricLabels?: Record<string, string>;
}

export function DistributionSection({
  athleteId,
  athleteName,
  distributions,
  metricLabels = {},
}: Props) {
  const entries = Object.entries(distributions);
  if (entries.length === 0) return null;

  return (
    <Card data-report-chart="distribution" data-report-chart-title="Distribution vs peers">
      <CardHeader>
        <CardTitle>Where You Stand (vs your group)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Each blue dot is an athlete in your organization with this test; you are the highlighted green star.
        </p>
        {entries.map(([code, dist]) => {
          const label = metricLabels[code] || code;
          // dist.values are the peer dots — the backend already excludes one
          // occurrence of the athlete's own value (before sampling), so the athlete
          // is not double-plotted. The athlete is added below as the highlighted star.
          const points = dist.values.map((v, i) => ({
            athleteId: `peer-${i}`,
            athleteName: '',
            value: v,
            date: new Date(),
            metric: code,
          }));
          points.push({
            athleteId,
            athleteName,
            value: dist.athleteValue,
            date: new Date(),
            metric: code,
          });
          // Pass the backend's full-population five-number summary so the box reflects
          // the true distribution rather than the sampled dots. Percentiles not carried
          // by dist.stats are filled monotonically from min/q1/median/q3/max.
          const s = dist.stats;
          const statistics: Record<string, StatisticalSummary> = {
            [code]: {
              count: dist.values.length + 1,
              mean: s.median,
              median: s.median,
              min: s.min,
              max: s.max,
              std: 0,
              variance: 0,
              percentiles: {
                p5: s.min,
                p10: s.min,
                p20: s.min,
                p25: s.q1,
                p30: s.q1,
                p40: s.median,
                p50: s.median,
                p60: s.median,
                p70: s.q3,
                p75: s.q3,
                p80: s.q3,
                p90: s.max,
                p95: s.max,
              },
            },
          };
          return (
            <div
              key={code}
              data-report-chart={`dist:${code}`}
              data-report-chart-title={`${label} — distribution`}
              className="h-[260px]"
            >
              <BoxPlotChart
                data={points}
                rawData={points}
                statistics={statistics}
                highlightAthlete={athleteId}
                showAllPoints
                compact
                config={{
                  type: 'box_swarm_combo',
                  title: label,
                  showLegend: false,
                  showTooltips: true,
                  responsive: true,
                }}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default DistributionSection;
