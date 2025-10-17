import type { ChartOptions } from 'chart.js';
import { CHART_CONFIG } from '@/constants/chart-config';
import { METRIC_CONFIG } from '@shared/analytics-types';
import type { ChartConfiguration } from '@shared/analytics-types';

export function createTimeSeriesChartOptions(
  config: ChartConfiguration,
  metric: string,
  labels: string[]
): ChartOptions<'scatter'> {
  const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  const unit = metricConfig?.unit || '';
  const metricLabel = metricConfig?.label || metric;

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'point'
    },
    plugins: {
      title: {
        display: true,
        text: config.title,
        font: {
          size: CHART_CONFIG.RESPONSIVE.MOBILE_FONT_SIZE + 6,
          weight: 'bold'
        }
      },
      subtitle: {
        display: !!config.subtitle,
        text: config.subtitle
      },
      tooltip: {
        callbacks: {
          title: (context) => {
            const point = context[0].raw as any;
            return point.athleteName || 'Data Point';
          },
          label: (context) => {
            const point = context.raw as any;
            const value = typeof point.y === 'number' ? point.y.toFixed(2) : point.y;
            return `${metricLabel}: ${value}${unit}`;
          },
          afterLabel: (context) => {
            const point = context.raw as any;
            const result = [];
            if (point.isPersonalBest) {
              result.push('🌟 Personal Best!');
            }
            return result;
          }
        }
      },
      legend: {
        display: config.showLegend,
        position: 'top' as const,
        labels: {
          filter: (legendItem) => {
            // Filter out duplicate athlete names in legend for cleaner display
            return !legendItem.text?.includes('(') || legendItem.text?.includes('PB');
          }
        }
      }
    },
    scales: {
      x: {
        type: 'category',
        labels: labels,
        title: {
          display: true,
          text: 'Date'
        },
        grid: {
          display: true
        }
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: `${metricLabel} (${unit})`
        },
        grid: {
          display: true
        }
      }
    },
    elements: {
      point: {
        hoverRadius: CHART_CONFIG.STYLING.POINT_HOVER_RADIUS.LARGE
      }
    },
    onHover: (event, elements) => {
      if (event.native?.target) {
        (event.native.target as HTMLElement).style.cursor = elements.length > 0 ? 'pointer' : 'default';
      }
    }
  };
}