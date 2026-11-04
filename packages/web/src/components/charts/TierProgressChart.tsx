// packages/web/src/components/charts/TierProgressChart.tsx
import type { BenchmarkComparison } from '@shared/benchmark-types';
import { formatMeasurement, type MeasurementFormat } from '@shared/duration-format';
import { tierSegments, athletePositionPct, athletePositionPctForValue, nextTierCaption } from './tier-progress-utils';
import { generateDeterministicJitter } from './utils/boxPlotStatistics';
import { resolveTierFill } from '@shared/tier-colors';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AthleteMarkerValue } from './BenchmarkStandingBar';

interface TierProgressChartProps {
  label: string;
  metricCode: string;
  comparison: BenchmarkComparison;
  unit?: string;
  /** Duration (mm:ss) metric format: values print as m:ss with no unit */
  format?: MeasurementFormat;
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

export function TierProgressChart({ label, metricCode, comparison, unit, format, athleteValues, rangeLabel }: TierProgressChartProps) {
  const segs = tierSegments(comparison);
  if (segs.length === 0) return null;
  const pos = athletePositionPct(comparison);
  const caption = nextTierCaption(comparison, unit, format);
  const durationFormat = format?.displayFormat === 'duration' ? format : undefined;
  // m:ss values carry no unit
  const unitSuffix = unit && !durationFormat ? ` ${unit}` : '';
  const showValue = (v: number) => (durationFormat ? formatMeasurement(v, durationFormat) : Math.round(v * 100) / 100);
  const hasAthleteValues = !!athleteValues && athleteValues.length > 0;
  const primaryLabel = hasAthleteValues ? 'Team Average' : 'You';
  const primaryVal = showValue(comparison.athleteValue);
  const bestInRangeSuffix = rangeLabel ? ` (best within ${rangeLabel})` : '';

  return (
    <TooltipProvider>
      <div data-report-chart={`tier:${metricCode}`} data-report-chart-title={`${label} — tier`} className="w-full">
        <div className="text-sm font-medium mb-1">{label}</div>
        {/* mt-6 leaves room for the marker tag inside the captured element */}
        <div className="relative mt-6">
          <div className="h-7 w-full flex rounded overflow-hidden border">
            {segs.map((t) => (
              <div
                key={t.tierName}
                className="flex-1 flex items-center justify-center text-xs font-medium text-slate-900"
                style={{ backgroundColor: resolveTierFill(t.tierColor) }}
              >
                {t.tierName}
              </div>
            ))}
          </div>
          {/* individual athlete markers, rendered first (visually subordinate) so the
              primary marker stacks on top and reads as the dominant element */}
          {hasAthleteValues && athleteValues!.map((a) => {
            const apos = athletePositionPctForValue(a.value, segs);
            const jitter = generateDeterministicJitter(a.athleteId, ATHLETE_MARKER_JITTER_PX);
            const aval = showValue(a.value);
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
              individual athlete's own value (individual-report usage). Border, not
              ring/box-shadow: html2canvas-pro renders box-shadow unreliably. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                data-testid={hasAthleteValues ? 'tier-marker-team-average' : 'tier-marker-self'}
                className="absolute -top-1 -bottom-1 w-1.5 bg-slate-900 border-2 border-white"
                style={{ left: `clamp(3px, ${pos * 100}%, calc(100% - 3px))`, marginLeft: '-3px' }}
                aria-hidden="true"
              />
            </TooltipTrigger>
            <TooltipContent>{primaryLabel}: {primaryVal}{unitSuffix}</TooltipContent>
          </Tooltip>
          {/* pin: the tag shifts by its own width times pos so it stays inside the bar at 0% and 100% */}
          <div
            className="absolute bottom-full mb-3 whitespace-nowrap text-[10px] font-semibold leading-none text-slate-900"
            style={{ left: `${pos * 100}%`, transform: `translateX(-${pos * 100}%)` }}
            aria-hidden="true"
          >
            {primaryLabel}
          </div>
          <div
            className="absolute bottom-full mb-1 text-[8px] leading-none text-slate-900"
            style={{ left: `clamp(3px, ${pos * 100}%, calc(100% - 3px))`, transform: 'translateX(-50%)' }}
            aria-hidden="true"
          >
            ▼
          </div>
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
