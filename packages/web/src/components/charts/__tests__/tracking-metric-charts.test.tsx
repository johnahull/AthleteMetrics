/**
 * A 'tracking' metric (body weight, height) has no better direction, so charts never rank athletes on it:
 * no rank or percentile text, no "best" pick, no Elite/Strong/Needs quadrants, athletes ordered by name (#805).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const captured: { options?: any; data?: any } = {};
vi.mock('react-chartjs-2', () => {
  const capture = ({ data, options }: any) => {
    captured.options = options;
    captured.data = data;
    return <div data-testid="chart" />;
  };
  return { Bar: capture, Scatter: capture, Radar: capture, Chart: capture };
});

const configs: Record<string, any> = {
  BODY_WEIGHT: { label: 'Body Weight', unit: 'lbs', metricType: 'tracking', lowerIsBetter: false, displayFormat: 'decimal' },
  HEIGHT: { label: 'Height', unit: 'in', metricType: 'tracking', lowerIsBetter: false, displayFormat: 'decimal' },
  VERTICAL_JUMP: { label: 'Vertical Jump', unit: 'in', metricType: 'higher_is_better', lowerIsBetter: false, displayFormat: 'decimal' },
  FLY10_TIME: { label: 'Fly 10', unit: 's', metricType: 'lower_is_better', lowerIsBetter: true, displayFormat: 'decimal' },
};
vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({ getMetricConfig: (code: string) => configs[code] ?? null, isLoaded: true, metricsMap: {} }),
}));

import { BarChart } from '../BarChart';
import { SwarmChart } from '../SwarmChart';
import { BoxPlotChart } from '../BoxPlotChart';
import { RadarChart } from '../RadarChart';
import { ScatterPlotChart } from '../ScatterPlotChart';
import { ConnectedScatterChart } from '../ConnectedScatterChart';

const point = (athleteName: string, metric: string, value: number) => ({
  athleteId: athleteName.toLowerCase(), athleteName, value, metric, date: new Date('2024-01-01'), teamName: 'T',
});
const stats = (min: number, max: number) =>
  ({ count: 3, mean: (min + max) / 2, median: (min + max) / 2, min, max, std: 1, variance: 1, percentiles: {} }) as any;
const config = { type: 'bar_chart', title: 'Chart', showLegend: false, showTooltips: true, responsive: true } as any;

// Values ordered so that neither higher- nor lower-is-better gives name order
const weights = [point('Cy', 'BODY_WEIGHT', 150), point('Amy', 'BODY_WEIGHT', 210), point('Bob', 'BODY_WEIGHT', 120)];
const asText = (lines: unknown) => [lines].flat().join('\n');

describe('charts: tracking metrics are not ranked', () => {
  beforeEach(() => {
    captured.options = undefined;
    captured.data = undefined;
  });

  it('BarChart orders by name, shows no rank or percentile and picks no best performer', () => {
    render(<BarChart data={weights as any} config={config} statistics={{ BODY_WEIGHT: stats(120, 210) }} />);
    expect(captured.data.labels).toEqual(['Amy', 'Bob', 'Cy']);
    const after = asText(captured.options.plugins.tooltip.callbacks.afterLabel({ dataIndex: 0 }));
    expect(after).toContain('Team: T');
    expect(after).not.toMatch(/Rank|percentile|better than/i);
    expect(screen.queryByText('Best Performance')).not.toBeInTheDocument();
    expect(screen.queryByText(/Top 25/)).not.toBeInTheDocument();
  });

  it('BarChart still ranks a higher-is-better metric', () => {
    const jumps = [point('Cy', 'VERTICAL_JUMP', 20), point('Amy', 'VERTICAL_JUMP', 30), point('Bob', 'VERTICAL_JUMP', 10)];
    render(<BarChart data={jumps as any} config={config} statistics={{ VERTICAL_JUMP: stats(10, 30) }} />);
    expect(captured.data.labels).toEqual(['Amy', 'Cy', 'Bob']);
    expect(asText(captured.options.plugins.tooltip.callbacks.afterLabel({ dataIndex: 0 }))).toContain('Rank: 1 of 3');
    expect(screen.getByText('Best Performance')).toBeInTheDocument();
  });

  it('SwarmChart tooltip gives no percentile for a tracking metric', () => {
    render(<SwarmChart data={weights as any} config={config} statistics={{ BODY_WEIGHT: stats(120, 210) }} />);
    const after = asText(captured.options.plugins.tooltip.callbacks.afterLabel({ raw: { athleteName: 'Amy', teamName: 'T', y: 210 } }));
    expect(after).toContain('Team: T');
    expect(after).not.toMatch(/percentile|better than/i);
  });

  it('BoxPlotChart athlete tooltip gives no percentile for a tracking metric', () => {
    render(<BoxPlotChart data={weights as any} config={config} statistics={{ BODY_WEIGHT: stats(120, 210) }} />);
    const after = asText(captured.options.plugins.tooltip.callbacks.afterLabel({
      raw: { athleteName: 'Amy', teamName: 'T', metric: 'BODY_WEIGHT' },
      parsed: { x: 0, y: 210 },
    }));
    expect(after).toContain('Team: T');
    expect(after).not.toMatch(/percentile|better than/i);
  });

  it('RadarChart leaves tracking metrics off the percentile axes', () => {
    const data = [
      { athleteId: 'amy', athleteName: 'Amy', metrics: { VERTICAL_JUMP: 30, FLY10_TIME: 1.5, BODY_WEIGHT: 210 }, percentileRanks: {} },
      { athleteId: 'bob', athleteName: 'Bob', metrics: { VERTICAL_JUMP: 20, FLY10_TIME: 1.7, BODY_WEIGHT: 120 }, percentileRanks: {} },
    ];
    render(
      <RadarChart
        data={data as any}
        config={config}
        statistics={{ VERTICAL_JUMP: stats(20, 30), FLY10_TIME: stats(1.5, 1.7), BODY_WEIGHT: stats(120, 210) }}
      />
    );
    expect(captured.data.labels).toEqual(['Vertical Jump', 'Fly 10']);
  });

  it('ScatterPlotChart gives neutral quadrants when an axis is a tracking metric', () => {
    const data = [
      point('Amy', 'BODY_WEIGHT', 210), point('Amy', 'HEIGHT', 70),
      point('Bob', 'BODY_WEIGHT', 120), point('Bob', 'HEIGHT', 60),
      point('Cy', 'BODY_WEIGHT', 150), point('Cy', 'HEIGHT', 65),
    ];
    render(<ScatterPlotChart data={data as any} config={config} statistics={{ BODY_WEIGHT: stats(120, 210), HEIGHT: stats(60, 70) }} />);
    expect(screen.getByText('High Body Weight, High Height')).toBeInTheDocument();
    expect(screen.queryByText(/Elite|Strong|Needs/)).not.toBeInTheDocument();
  });

  it('ConnectedScatterChart gives neutral quadrants when an axis is a tracking metric', () => {
    const trend = (athleteName: string, metric: string, values: number[]) => ({
      athleteId: athleteName.toLowerCase(),
      athleteName,
      metric,
      data: values.map((value, i) => ({ date: new Date(2024, 0, i + 1), value, isPersonalBest: false })),
    });
    const data = [
      trend('Amy', 'BODY_WEIGHT', [200, 210]), trend('Amy', 'HEIGHT', [69, 70]),
      trend('Bob', 'BODY_WEIGHT', [120, 125]), trend('Bob', 'HEIGHT', [60, 61]),
    ];
    render(<ConnectedScatterChart data={data as any} config={config} statistics={{ BODY_WEIGHT: stats(120, 210), HEIGHT: stats(60, 70) }} />);
    expect(screen.getByText('High Body Weight, High Height')).toBeInTheDocument();
    expect(screen.queryByText(/Elite|Strong|Needs/)).not.toBeInTheDocument();
  });
});
