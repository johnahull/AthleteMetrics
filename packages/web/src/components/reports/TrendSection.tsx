// packages/web/src/components/reports/TrendSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReportTrends } from '@shared/report-trends-types';
import { BenchmarkTrendChart } from '@/components/charts/BenchmarkTrendChart';
import { TrendAtAGlanceCards } from './TrendAtAGlanceCards';

interface TrendSectionProps {
  trends: ReportTrends;
  metricLabels?: Record<string, string>;
  metricUnits?: Record<string, string>;
}

export function TrendSection({ trends, metricLabels = {}, metricUnits = {} }: TrendSectionProps) {
  const entries = Object.entries(trends);
  if (entries.length === 0) return null;

  return (
    <Card data-testid="trend-section">
      <CardHeader>
        <CardTitle>Progress Over Time</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <TrendAtAGlanceCards entries={entries} metricLabels={metricLabels} metricUnits={metricUnits} />

        {/* Detail charts */}
        <div className="space-y-8">
          {entries.map(([code, trend]) => (
            <BenchmarkTrendChart
              key={code}
              metricCode={code}
              trend={trend}
              label={metricLabels[code] || code}
              unit={metricUnits[code]}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default TrendSection;
