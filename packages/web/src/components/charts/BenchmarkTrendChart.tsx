// packages/web/src/components/charts/BenchmarkTrendChart.tsx
import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import type { MetricTrend } from '@shared/report-trends-types';
import { buildTrendChartData, overlayToAnnotations, shouldReverseYAxis } from './trend-utils';

// Chart.js + annotation plugin are registered globally in lib/chart-setup.ts

interface BenchmarkTrendChartProps {
  metricCode: string;
  trend: MetricTrend;
  label: string;
  unit?: string;
}

export function BenchmarkTrendChart({ metricCode, trend, label, unit }: BenchmarkTrendChartProps) {
  const data = useMemo(() => buildTrendChartData(trend, label), [trend, label]);
  const annotations = useMemo<Record<string, AnnotationOptions>>(
    () => overlayToAnnotations(trend.benchmark),
    [trend.benchmark],
  );

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // deterministic render for PDF capture
    plugins: {
      legend: { display: false },
      title: { display: true, text: label, font: { size: 14, weight: 'bold' } },
      subtitle: {
        display: true,
        text: trend.direction === 'lower' ? 'Lower is better · axis flipped so up = improvement' : 'Higher is better',
        font: { size: 10 },
      },
      annotation: Object.keys(annotations).length > 0 ? { annotations } : undefined,
    },
    scales: {
      x: { title: { display: true, text: 'Date' } },
      y: {
        reverse: shouldReverseYAxis(trend.direction),
        title: { display: true, text: unit ? `${label} (${unit})` : label },
      },
    },
  };

  return (
    <div
      data-chart-metric={metricCode}
      className="w-full h-[300px]"
      role="img"
      aria-label={`Progress over time for ${label}`}
    >
      <Line data={data} options={options} />
    </div>
  );
}

export default BenchmarkTrendChart;
