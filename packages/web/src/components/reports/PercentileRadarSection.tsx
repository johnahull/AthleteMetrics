// packages/web/src/components/reports/PercentileRadarSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadarChart } from '@/components/charts/RadarChart';
import { radarDataFromPercentiles } from '@/components/charts/trend-utils';

interface Props {
  athleteId: string;
  athleteName: string;
  percentiles: Record<string, number>;
  measurements: Record<string, number>;
}

export function PercentileRadarSection({ athleteId, athleteName, percentiles, measurements }: Props) {
  const metricCount = Object.keys(percentiles || {}).length;
  if (metricCount < 3) return null;
  const data = [radarDataFromPercentiles(athleteId, athleteName, percentiles, measurements)];
  return (
    <Card data-report-chart="radar" data-report-chart-title="All-around profile">
      <CardHeader><CardTitle>All-Around Profile (percentiles)</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          Each spoke is a performance test. The farther a point sits from the center, the
          higher this athlete ranks against the group — the outer edge is the 100th
          percentile (best). A larger, more even shape means a stronger all-around athlete.
        </p>
        <div className="h-[340px] overflow-hidden max-w-md mx-auto">
          <RadarChart
            data={data}
            config={{
              type: 'radar_chart',
              title: '',
              showLegend: false,
              showTooltips: true,
              responsive: true,
            }}
            highlightAthlete={athleteId}
            compact
          />
        </div>
      </CardContent>
    </Card>
  );
}
export default PercentileRadarSection;
