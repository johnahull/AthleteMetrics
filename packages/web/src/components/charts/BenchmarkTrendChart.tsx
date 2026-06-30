// packages/web/src/components/charts/BenchmarkTrendChart.tsx
import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import type { MetricTrend } from '@shared/report-trends-types';
import {
  buildTrendChartData,
  overlayToAnnotations,
  directionCue,
  personalBestIndex,
  currentTierName,
} from './trend-utils';

// Chart.js + annotation plugin are registered globally in lib/chart-setup.ts

interface BenchmarkTrendChartProps {
  metricCode: string;
  trend: MetricTrend;
  label: string;
  unit?: string;
}

export function BenchmarkTrendChart({ metricCode, trend, label, unit }: BenchmarkTrendChartProps) {
  const cue = useMemo(() => directionCue(trend.direction), [trend.direction]);

  // Index of the personal-best point so we can enlarge + star it on the line.
  const pbIdx = useMemo(
    () => personalBestIndex(trend.series, trend.direction),
    [trend.series, trend.direction],
  );

  // Build the dataset and apply per-point styling: the PB point renders as a
  // larger star, every other point as a normal circle.
  const styledData = useMemo(() => {
    const d = buildTrendChartData(trend, label);
    const ds = d.datasets[0] as Record<string, unknown>;
    // PB point: large gold star with a dark border so it clearly stands out
    // from the regular blue circles.
    ds.pointRadius = trend.series.map((_, i) => (i === pbIdx ? 10 : 3));
    ds.pointHoverRadius = trend.series.map((_, i) => (i === pbIdx ? 12 : 5));
    ds.pointStyle = trend.series.map((_, i) => (i === pbIdx ? 'star' : 'circle'));
    ds.pointBackgroundColor = trend.series.map((_, i) => (i === pbIdx ? '#f59e0b' : '#2563eb'));
    ds.pointBorderColor = trend.series.map((_, i) => (i === pbIdx ? '#b45309' : '#2563eb'));
    ds.pointBorderWidth = trend.series.map((_, i) => (i === pbIdx ? 2 : 1));
    return d;
  }, [trend, label, pbIdx]);

  const annotations = useMemo<Record<string, AnnotationOptions>>(() => {
    const ann = overlayToAnnotations(trend.benchmark);
    // Benchmark-crossing flag: first point where the athlete moves into a
    // different tier in the improving direction. TierBand carries no explicit
    // order, so "better" is inferred from a tier-name change combined with a
    // value movement toward the metric's better direction.
    if (trend.benchmark.kind === 'tiers') {
      let crossIdx = -1;
      for (let i = 1; i < trend.series.length; i++) {
        const prev = currentTierName(trend.benchmark, trend.series[i - 1].value);
        const cur = currentTierName(trend.benchmark, trend.series[i].value);
        const improved = trend.direction === 'lower'
          ? trend.series[i].value < trend.series[i - 1].value
          : trend.series[i].value > trend.series[i - 1].value;
        if (cur && prev && cur !== prev && improved) {
          crossIdx = i;
          break;
        }
      }
      if (crossIdx >= 0) {
        const xLabel = new Date(trend.series[crossIdx].date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        ann.crossing = {
          type: 'label',
          xValue: xLabel,
          yValue: trend.series[crossIdx].value,
          content: ['▲ reached ' + currentTierName(trend.benchmark, trend.series[crossIdx].value)],
          color: '#16a34a',
          font: { size: 10, weight: 'bold' },
          position: 'start',
        } as AnnotationOptions;
      }
    }
    // Label the personal-best point so it's unmistakable (not just a styled point).
    if (pbIdx >= 0 && trend.series.length > 1) {
      const pbLabel = new Date(trend.series[pbIdx].date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      ann.personalBest = {
        type: 'label',
        xValue: pbLabel,
        yValue: trend.series[pbIdx].value,
        content: ['★ Personal best'],
        color: '#b45309',
        backgroundColor: 'rgba(251, 191, 36, 0.18)',
        borderRadius: 4,
        padding: 4,
        font: { size: 10, weight: 'bold' },
        position: 'center',
        yAdjust: -22,
      } as AnnotationOptions;
    }
    return ann;
  }, [trend.benchmark, trend.series, trend.direction, pbIdx]);

  const yTitle = unit ? `${label} (${unit})` : label;

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // deterministic render for PDF capture
    plugins: {
      legend: { display: false },
      title: { display: true, text: label, font: { size: 14, weight: 'bold' } },
      annotation: Object.keys(annotations).length > 0 ? { annotations } : undefined,
    },
    scales: {
      x: { title: { display: true, text: 'Date' } },
      y: {
        title: { display: true, text: `${yTitle}  ${cue.arrow} better` },
      },
    },
  };

  return (
    <div
      data-chart-metric={metricCode}
      className="w-full"
      role="img"
      aria-label={`Progress over time for ${label}. ${cue.betterText}; improvement is ${cue.word}.`}
    >
      {/* Plain-language direction cue (HTML, not canvas) so it renders crisply
          on screen and is captured into the PDF. */}
      <div className="mb-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <span aria-hidden="true">{cue.arrow}</span>
          {cue.betterText} — improvement trends {cue.word}
        </span>
      </div>
      <div className="w-full h-[300px]">
        <Line data={styledData} options={options} />
      </div>
    </div>
  );
}

export default BenchmarkTrendChart;
