// packages/web/src/components/charts/TierProgressChart.tsx
import type { BenchmarkComparison } from '@shared/benchmark-types';
import { tierSegments, athletePositionPct, nextTierCaption } from './tier-progress-utils';

interface TierProgressChartProps {
  label: string;
  comparison: BenchmarkComparison;
  unit?: string;
}

export function TierProgressChart({ label, comparison, unit }: TierProgressChartProps) {
  const segs = tierSegments(comparison);
  if (segs.length === 0) return null;
  const pos = athletePositionPct(comparison);
  const caption = nextTierCaption(comparison, unit);

  return (
    <div data-report-chart={`tier:${label}`} data-report-chart-title={`${label} — tier`} className="w-full">
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className="relative h-6 w-full flex rounded overflow-hidden border">
        {segs.map((t) => (
          <div
            key={t.tierName}
            className="flex-1 flex items-center justify-center text-[10px] text-slate-700"
            style={{ backgroundColor: t.tierColor || '#e2e8f0' }}
          >
            {t.tierName}
          </div>
        ))}
        <div
          className="absolute top-0 h-6 w-0.5 bg-slate-900"
          style={{ left: `${pos * 100}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        You: {Math.round(comparison.athleteValue * 100) / 100}{unit ? ` ${unit}` : ''} · {comparison.tierName} · {caption}
      </div>
    </div>
  );
}

export default TierProgressChart;
