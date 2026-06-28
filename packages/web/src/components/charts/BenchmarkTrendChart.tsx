// packages/web/src/components/charts/BenchmarkTrendChart.tsx
import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import type { MetricTrend } from '@shared/report-trends-types';
import { buildTrendChartData, overlayToAnnotations, directionCue } from './trend-utils';

// Chart.js + annotation plugin are registered globally in lib/chart-setup.ts

interface BenchmarkTrendChartProps {
  metricCode: string;
  trend: MetricTrend;
  label: string;
  unit?: string;
}

export function BenchmarkTrendChart({ metricCode, trend, label, unit }: BenchmarkTrendChartProps) {
  const data = useMemo(() => buildTrendChartData(trend, label), [trend, label]);
  const cue = useMemo(() => directionCue(trend.direction), [trend.direction]);
  const annotations = useMemo<Record<string, AnnotationOptions>>(
    () => overlayToAnnotations(trend.benchmark),
    [trend.benchmark],
  );

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
        <Line data={data} options={options} />
      </div>
    </div>
  );
}

export default BenchmarkTrendChart;
