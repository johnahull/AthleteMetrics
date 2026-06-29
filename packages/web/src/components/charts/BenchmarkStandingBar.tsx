import type { BenchmarkComparison } from '@shared/benchmark-types';
import {
  benchmarkStandingPct,
  benchmarkStandingCaption,
  benchmarkBetterDirection,
} from './tier-progress-utils';

interface BenchmarkStandingBarProps {
  label: string;
  comparison: BenchmarkComparison;
  unit?: string;
}

export function BenchmarkStandingBar({ label, comparison, unit }: BenchmarkStandingBarProps) {
  const pos = benchmarkStandingPct(comparison);
  const meets = comparison.meetsOrExceeds;
  const dir = benchmarkBetterDirection(comparison); // 'higher' | 'lower' | 'none'
  const athleteVal = Math.round(comparison.athleteValue * 100) / 100;
  const benchVal = Math.round(comparison.benchmarkValue * 100) / 100;

  // Shade the "better" half green and the worse half red, oriented by direction:
  // higher-is-better → right half good; lower-is-better → left half good.
  const goodSide = dir === 'higher' ? 'right' : dir === 'lower' ? 'left' : null;

  return (
    <div data-report-chart={`bench:${label}`} data-report-chart-title={`${label} — vs benchmark`} className="w-full">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        {dir !== 'none' && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {dir === 'lower' ? '← lower is better' : 'higher is better →'}
          </span>
        )}
      </div>
      <div className="relative h-6 w-full rounded border overflow-hidden">
        {/* better / worse halves (only when direction is known) */}
        {goodSide && (
          <>
            <div
              className={`absolute top-0 h-6 w-1/2 ${goodSide === 'left' ? 'bg-green-100' : 'bg-red-100'}`}
              style={{ left: 0 }}
              aria-hidden="true"
            />
            <div
              className={`absolute top-0 h-6 w-1/2 ${goodSide === 'right' ? 'bg-green-100' : 'bg-red-100'}`}
              style={{ left: '50%' }}
              aria-hidden="true"
            />
          </>
        )}
        {/* benchmark reference line at center */}
        <div className="absolute top-0 h-6 w-0.5 bg-slate-500" style={{ left: '50%' }} aria-hidden="true" />
        {/* athlete marker, placed at its true value relative to the benchmark */}
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
