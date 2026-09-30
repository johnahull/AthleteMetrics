import type { BenchmarkComparison } from '@shared/benchmark-types';
import {
  benchmarkStandingPct,
  benchmarkStandingPctForValue,
  benchmarkStandingCaption,
  benchmarkBetterDirection,
} from './tier-progress-utils';
import { generateDeterministicJitter } from './utils/boxPlotStatistics';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** One athlete's value for a metric, used to plot per-athlete markers alongside the team average. */
export interface AthleteMarkerValue {
  athleteId: string;
  athleteName: string;
  value: number;
}

interface BenchmarkStandingBarProps {
  label: string;
  metricCode: string;
  comparison: BenchmarkComparison;
  unit?: string;
  /** Optional per-athlete values for this metric. When provided (team-report
   *  usage), an additional small marker is rendered per athlete, visually
   *  subordinate to the primary marker (which then represents the team
   *  average). Absent/empty (individual-report usage) renders only the
   *  primary marker, exactly as before. */
  athleteValues?: AthleteMarkerValue[];
  /** Pre-formatted report date range (e.g. "Jan 1 – Jun 30, 2026"), echoed in
   *  each athlete-marker tooltip so "best" is unambiguous without needing to
   *  look back up at the section header. Omitted entirely when not supplied
   *  (e.g. legacy reports with no timeframe) rather than referencing an
   *  undefined "range". */
  rangeLabel?: string;
}

/** Vertical jitter range (px) applied to individual athlete dots so tied/close values don't visually merge. */
const ATHLETE_DOT_JITTER_PX = 6;

export function BenchmarkStandingBar({ label, metricCode, comparison, unit, athleteValues, rangeLabel }: BenchmarkStandingBarProps) {
  const pos = benchmarkStandingPct(comparison);
  const meets = comparison.meetsOrExceeds;
  const dir = benchmarkBetterDirection(comparison); // 'higher' | 'lower' | 'none'
  const athleteVal = Math.round(comparison.athleteValue * 100) / 100;
  const benchVal = Math.round(comparison.benchmarkValue * 100) / 100;
  const unitSuffix = unit ? ` ${unit}` : '';
  const hasAthleteValues = !!athleteValues && athleteValues.length > 0;
  const primaryLabel = hasAthleteValues ? 'Team Average' : 'You';
  const bestInRangeSuffix = rangeLabel ? ` (best within ${rangeLabel})` : '';

  // Shade the "better" half green and the worse half red, oriented by direction:
  // higher-is-better → right half good; lower-is-better → left half good.
  const goodSide = dir === 'higher' ? 'right' : dir === 'lower' ? 'left' : null;

  return (
    <TooltipProvider>
      <div data-report-chart={`bench:${metricCode}:${comparison.benchmarkName}`} data-report-chart-title={`${label} — vs benchmark`} className="w-full">
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
          {/* individual athlete markers, rendered first (visually subordinate) so the
              primary marker stacks on top and reads as the dominant element */}
          {hasAthleteValues && athleteValues!.map((a) => {
            const apos = benchmarkStandingPctForValue(a.value, comparison.benchmarkValue);
            const jitter = generateDeterministicJitter(a.athleteId, ATHLETE_DOT_JITTER_PX);
            const aval = Math.round(a.value * 100) / 100;
            return (
              <Tooltip key={a.athleteId}>
                <TooltipTrigger asChild>
                  <div
                    data-testid={`benchmark-marker-${a.athleteId}`}
                    className="absolute h-2.5 w-2.5 rounded-full bg-slate-400/70"
                    style={{ left: `${apos * 100}%`, top: `calc(50% + ${jitter}px)`, marginLeft: '-5px', marginTop: '-5px' }}
                    aria-hidden="true"
                  />
                </TooltipTrigger>
                <TooltipContent>{a.athleteName}: {aval}{unitSuffix}{bestInRangeSuffix}</TooltipContent>
              </Tooltip>
            );
          })}
          {/* primary marker: team average (when athleteValues is present) or the
              individual athlete's own value (individual-report usage) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                data-testid={hasAthleteValues ? 'benchmark-marker-team-average' : 'benchmark-marker-self'}
                className={`absolute top-1 h-4 w-4 -ml-2 rounded-full border-2 border-white ${meets ? 'bg-green-600' : 'bg-red-500'}`}
                style={{ left: `${pos * 100}%` }}
                aria-hidden="true"
              />
            </TooltipTrigger>
            <TooltipContent>{primaryLabel}: {athleteVal}{unitSuffix}</TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {primaryLabel}: {athleteVal}{unitSuffix} · {comparison.benchmarkName}: {benchVal}{unitSuffix} · {benchmarkStandingCaption(comparison, unit)}
        </div>
        {hasAthleteValues && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            Bold marker = team average; small dots = individual athletes
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
export default BenchmarkStandingBar;
