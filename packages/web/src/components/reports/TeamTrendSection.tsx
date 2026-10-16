// packages/web/src/components/reports/TeamTrendSection.tsx
import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { TeamReportTrends } from '@shared/report-trends-types';
import { BenchmarkTrendChart } from '@/components/charts/BenchmarkTrendChart';
import { MAX_FAINT_ATHLETES } from '@/components/charts/trend-utils';
import { TrendAtAGlanceCards } from './TrendAtAGlanceCards';
import type { MeasurementFormat } from '@shared/duration-format';
import { MetricGroupBlocks } from './MetricGroupHeading';
import type { MetricGroup } from '@shared/metric-order';

interface TeamTrendSectionProps {
  trends: TeamReportTrends;
  metricLabels?: Record<string, string>;
  metricUnits?: Record<string, string>;
  /** Duration (mm:ss) metrics only; others keep their unit display */
  metricFormats?: Record<string, MeasurementFormat>;
  metricGroups?: MetricGroup[];
}

export function TeamTrendSection({ trends, metricLabels = {}, metricUnits = {}, metricFormats = {}, metricGroups }: TeamTrendSectionProps) {
  const entries = useMemo(() => Object.entries(trends), [trends]);
  // Stabilize each chart's faint-athlete series so BenchmarkTrendChart's own
  // useMemo (keyed on this array) doesn't invalidate on every parent render.
  const backgroundSeriesByMetric = useMemo(
    () => Object.fromEntries(
      entries.map(([code, trend]) => [code, trend.athleteSeries.slice(0, MAX_FAINT_ATHLETES).map((a) => a.series)]),
    ),
    [entries],
  );

  if (entries.length === 0) return null;

  return (
    <Card data-testid="team-trend-section">
      <CardHeader>
        <CardTitle>Team Progress Over Time</CardTitle>
        <CardDescription>
          Bold line = team average; faint lines = individual athletes (up to {MAX_FAINT_ATHLETES}) for context
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <TrendAtAGlanceCards entries={entries} metricLabels={metricLabels} metricUnits={metricUnits} metricFormats={metricFormats} />

        {/* Detail charts: team-average bold line + up to 8 faint athlete lines */}
        <div className="space-y-8">
          <MetricGroupBlocks
            codes={entries.map(([code]) => code)}
            metricGroups={metricGroups}
            section="team-trends"
            className="space-y-8"
            render={(code) => {
              const trend = trends[code];
              return (
                <BenchmarkTrendChart
                  key={code}
                  metricCode={code}
                  trend={{
                    series: trend.teamSeries,
                    direction: trend.direction,
                    delta: trend.delta,
                    benchmark: trend.benchmark,
                  }}
                  label={metricLabels[code] || code}
                  unit={metricUnits[code]}
                  format={metricFormats[code]}
                  backgroundSeries={backgroundSeriesByMetric[code]}
                />
              );
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default TeamTrendSection;
