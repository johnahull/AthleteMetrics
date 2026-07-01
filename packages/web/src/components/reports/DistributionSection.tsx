import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReportDistributions, MetricDistribution } from '@shared/report-trends-types';
import { computeHistogram, percentBetterThanPeers } from './histogram-utils';

interface Props {
  athleteName: string;
  distributions: ReportDistributions;
  metricLabels?: Record<string, string>;
  metricUnits?: Record<string, string>;
  /** Direction-normalized "better than X%" per metric, from the report (preferred). */
  percentiles?: Record<string, number>;
}

/** Compact number: integers as-is, otherwise one decimal. */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * "Where you stand" histogram for one metric. Bars = how many athletes scored in
 * each value range; the athlete's bar is highlighted with a "You" tag. A plain
 * sentence states the percentile so the takeaway lands without reading the chart.
 */
function MetricHistogram({
  dist,
  label,
  unit,
  percentile,
  captureCode,
  captureTitle,
}: {
  dist: MetricDistribution;
  label: string;
  unit?: string;
  percentile?: number;
  captureCode: string;
  captureTitle: string;
}) {
  const bins = computeHistogram(dist.values, dist.athleteValue);
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  const pct =
    percentile !== undefined
      ? Math.max(0, Math.min(100, Math.round(percentile)))
      : percentBetterThanPeers(dist.values, dist.athleteValue, dist.direction);

  const betterSide = dist.direction === 'higher' ? 'farther right = better' : 'farther left = better';
  const yourValue = `${fmt(dist.athleteValue)}${unit ? ` ${unit}` : ''}`;

  // SVG layout (viewBox units).
  const W = 600;
  const plotLeft = 40;
  const plotRight = 585;
  const plotWidth = plotRight - plotLeft;
  const baseline = 195;
  const maxBarH = 150;
  const n = bins.length;
  const bw = plotWidth / n;
  const gap = Math.min(8, bw * 0.2);
  const barW = bw - gap;

  return (
    <div data-report-chart={`dist:${captureCode}`} data-report-chart-title={captureTitle} className="space-y-1">
      <p className="text-sm text-foreground">
        <span className="font-medium">{label}.</span> You scored better than{' '}
        <span className="font-semibold text-green-600">{pct}% of your group</span> ({yourValue}).
      </p>
      <p className="text-xs text-muted-foreground">
        Each bar shows how many athletes scored in that range · you are the green bar ★
      </p>
      <svg viewBox={`0 0 ${W} 240`} className="w-full" role="img" aria-label={`${label} distribution histogram`}>
        <line x1={plotLeft} y1={baseline} x2={plotRight} y2={baseline} stroke="#cbd5e1" />
        {bins.map((b, i) => {
          const h = (b.count / maxCount) * maxBarH;
          const x = plotLeft + i * bw + gap / 2;
          const y = baseline - h;
          const cx = x + barW / 2;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} fill={b.isAthlete ? '#16a34a' : '#cbd5e1'} rx={2} />
              {b.count > 0 && (
                <text x={cx} y={y - 4} textAnchor="middle" fontSize={10} fill="#94a3b8">
                  {b.count}
                </text>
              )}
              {b.isAthlete && (
                <text x={cx} y={Math.max(12, y - 16)} textAnchor="middle" fontSize={11} fontWeight={700} fill="#16a34a">
                  ★ You
                </text>
              )}
              <text x={cx} y={210} textAnchor="middle" fontSize={9} fill="#64748b">
                {`${fmt(b.start)}–${fmt(b.end)}`}
              </text>
            </g>
          );
        })}
        <text x={W / 2} y={232} textAnchor="middle" fontSize={11} fill="#64748b">
          {`${label}${unit ? ` (${unit})` : ''} — ${betterSide}`}
        </text>
      </svg>
    </div>
  );
}

export function DistributionSection({
  athleteName,
  distributions,
  metricLabels = {},
  metricUnits = {},
  percentiles = {},
}: Props) {
  const entries = Object.entries(distributions);
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where You Stand (vs your group)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {entries.map(([code, dist]) => {
          const label = metricLabels[code] || code;
          return (
            <MetricHistogram
              key={code}
              dist={dist}
              label={label}
              unit={metricUnits[code]}
              percentile={percentiles[code]}
              captureCode={code}
              captureTitle={`${label} — where ${athleteName} stands`}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

export default DistributionSection;
