// packages/web/src/components/reports/TrendSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReportTrends } from '@shared/report-trends-types';
import { BenchmarkTrendChart } from '@/components/charts/BenchmarkTrendChart';
import { TrendAtAGlanceCards } from './TrendAtAGlanceCards';
import type { MeasurementFormat } from '@shared/duration-format';
import { MetricGroupBlocks } from './MetricGroupHeading';
import type { MetricGroup } from '@shared/metric-order';

interface TrendSectionProps {
  trends: ReportTrends;
  metricLabels?: Record<string, string>;
  metricUnits?: Record<string, string>;
  /** Duration (mm:ss) metrics only; others keep their unit display */
  metricFormats?: Record<string, MeasurementFormat>;
  metricGroups?: MetricGroup[];
}

export function TrendSection({ trends, metricLabels = {}, metricUnits = {}, metricFormats = {}, metricGroups }: TrendSectionProps) {
  const entries = Object.entries(trends);
  if (entries.length === 0) return null;

  return (
    <Card data-testid="trend-section">
      <CardHeader>
        <CardTitle>Progress Over Time</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <TrendAtAGlanceCards entries={entries} metricLabels={metricLabels} metricUnits={metricUnits} metricFormats={metricFormats} />

        {/* Detail charts */}
        <div className="space-y-8">
          <MetricGroupBlocks
            codes={entries.map(([code]) => code)}
            metricGroups={metricGroups}
            section="trends"
            className="space-y-8"
            render={(code) => (
              <BenchmarkTrendChart
                key={code}
                metricCode={code}
                trend={trends[code]}
                label={metricLabels[code] || code}
                unit={metricUnits[code]}
                format={metricFormats[code]}
              />
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default TrendSection;
