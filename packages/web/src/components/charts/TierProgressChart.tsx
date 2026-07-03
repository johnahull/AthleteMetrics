// packages/web/src/components/charts/TierProgressChart.tsx
import type { BenchmarkComparison } from '@shared/benchmark-types';
import { tierSegments, athletePositionPct, athletePositionPctForValue, nextTierCaption } from './tier-progress-utils';
import { generateDeterministicJitter } from './utils/boxPlotStatistics';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AthleteMarkerValue } from './BenchmarkStandingBar';

interface TierProgressChartProps {
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

/** Vertical jitter range (px) applied to individual athlete markers so tied/close values don't visually merge. */
const ATHLETE_MARKER_JITTER_PX = 6;

export function TierProgressChart({ label, metricCode, comparison, unit, athleteValues, rangeLabel }: TierProgressChartProps) {
  const segs = tierSegments(comparison);
  if (segs.length === 0) return null;
  const pos = athletePositionPct(comparison);
  const caption = nextTierCaption(comparison, unit);
  const unitSuffix = unit ? ` ${unit}` : '';
  const hasAthleteValues = !!athleteValues && athleteValues.length > 0;
  const primaryLabel = hasAthleteValues ? 'Team Average' : 'You';
  const primaryVal = Math.round(comparison.athleteValue * 100) / 100;
  const bestInRangeSuffix = rangeLabel ? ` (best within ${rangeLabel})` : '';

  return (
    <TooltipProvider>
      <div data-report-chart={`tier:${metricCode}`} data-report-chart-title={`${label} — tier`} className="w-full">
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
          {/* individual athlete markers, rendered first (visually subordinate) so the
              primary marker stacks on top and reads as the dominant element */}
          {hasAthleteValues && athleteValues!.map((a) => {
            const apos = athletePositionPctForValue(a.value, segs);
            const jitter = generateDeterministicJitter(a.athleteId, ATHLETE_MARKER_JITTER_PX);
            const aval = Math.round(a.value * 100) / 100;
            return (
              <Tooltip key={a.athleteId}>
                <TooltipTrigger asChild>
                  <div
                    data-testid={`tier-marker-${a.athleteId}`}
                    className="absolute h-2.5 w-2.5 rounded-full bg-slate-600/60"
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
                data-testid={hasAthleteValues ? 'tier-marker-team-average' : 'tier-marker-self'}
                className="absolute top-0 h-6 w-0.5 bg-slate-900"
                style={{ left: `${pos * 100}%` }}
                aria-hidden="true"
              />
            </TooltipTrigger>
            <TooltipContent>{primaryLabel}: {primaryVal}{unitSuffix}</TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {primaryLabel}: {primaryVal}{unitSuffix} · {comparison.tierName} · {caption}
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

export default TierProgressChart;
