// packages/web/src/components/reports/TrendAtAGlanceCards.tsx
import { Badge } from '@/components/ui/badge';
import type { BenchmarkOverlay } from '@shared/report-trends-types';
import { formatDelta, currentTierName } from '@/components/charts/trend-utils';

/** The subset of a trend (individual or team) the at-a-glance cards need. */
interface TrendCardData {
  delta: { to: number; pct: number };
  benchmark: BenchmarkOverlay;
}

interface Props {
  entries: Array<[string, TrendCardData]>;
  metricLabels?: Record<string, string>;
  metricUnits?: Record<string, string>;
}

/**
 * The "at-a-glance" metric cards atop both TrendSection and TeamTrendSection —
 * shared so a future fix to this layout/logic only needs to happen once.
 */
export function TrendAtAGlanceCards({ entries, metricLabels = {}, metricUnits = {} }: Props) {
  return (
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
  );
}

export default TrendAtAGlanceCards;
