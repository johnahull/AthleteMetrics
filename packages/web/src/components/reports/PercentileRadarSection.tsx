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
        <div className="h-[340px]">
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
          />
        </div>
      </CardContent>
    </Card>
  );
}
export default PercentileRadarSection;
