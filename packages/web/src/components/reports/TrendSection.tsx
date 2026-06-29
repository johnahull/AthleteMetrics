// packages/web/src/components/reports/TrendSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ReportTrends } from '@shared/report-trends-types';
import { BenchmarkTrendChart } from '@/components/charts/BenchmarkTrendChart';
import { formatDelta, currentTierName } from '@/components/charts/trend-utils';

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
        {/* At-a-glance cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {entries.map(([code, trend]) => {
            const label = metricLabels[code] || code;
            const unit = metricUnits[code] || '';
            const tier = currentTierName(trend.benchmark, trend.delta.to);
            const improving = trend.delta.pct > 0;
            return (
              <div key={code} className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-xl font-bold">{trend.delta.to}{unit ? ` ${unit}` : ''}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge variant={improving ? 'default' : 'secondary'}>{formatDelta(trend.delta)}</Badge>
                  {tier && <Badge variant="outline">{tier}</Badge>}
                </div>
              </div>
            );
          })}
        </div>

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
