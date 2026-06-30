import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BoxPlotChart } from '@/components/charts/BoxPlotChart';
import type { ReportDistributions } from '@shared/report-trends-types';

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
          // Drop one occurrence of the athlete's own value from the peer dots — the
          // athlete is shown separately as the highlighted star (the box stats still
          // reflect the full population, computed on the backend).
          const peerVals = [...dist.values];
          const selfIdx = peerVals.indexOf(dist.athleteValue);
          if (selfIdx !== -1) peerVals.splice(selfIdx, 1);
          const points = peerVals.map((v, i) => ({
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
