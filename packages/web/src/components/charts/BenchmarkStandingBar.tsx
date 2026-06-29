import type { BenchmarkComparison } from '@shared/benchmark-types';
import { benchmarkStandingPct, benchmarkStandingCaption } from './tier-progress-utils';

interface BenchmarkStandingBarProps {
  label: string;
  comparison: BenchmarkComparison;
  unit?: string;
}

export function BenchmarkStandingBar({ label, comparison, unit }: BenchmarkStandingBarProps) {
  const pos = benchmarkStandingPct(comparison);
  const meets = comparison.meetsOrExceeds;
  const athleteVal = Math.round(comparison.athleteValue * 100) / 100;
  const benchVal = Math.round(comparison.benchmarkValue * 100) / 100;
  return (
    <div data-report-chart={`bench:${label}`} data-report-chart-title={`${label} — vs benchmark`} className="w-full">
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className="relative h-6 w-full rounded border bg-muted/40 overflow-hidden">
        {/* benchmark reference line at center */}
        <div className="absolute top-0 h-6 w-px bg-slate-400" style={{ left: '50%' }} aria-hidden="true" />
        {/* athlete marker */}
        <div
          className={`absolute top-1 h-4 w-4 -ml-2 rounded-full border-2 border-white ${meets ? 'bg-green-600' : 'bg-red-500'}`}
          style={{ left: `${pos * 100}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        You: {athleteVal}{unit ? ` ${unit}` : ''} · {comparison.benchmarkName}: {benchVal}{unit ? ` ${unit}` : ''} · {benchmarkStandingCaption(comparison, unit)}
      </div>
    </div>
  );
}
export default BenchmarkStandingBar;
