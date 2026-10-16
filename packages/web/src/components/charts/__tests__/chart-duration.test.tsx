/**
 * Duration (mm:ss) metrics in charts: tooltips, value axis ticks and stat panels show m:ss.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const captured: { options?: any } = {};
vi.mock('react-chartjs-2', () => ({
  Bar: ({ options }: any) => { captured.options = options; return <div data-testid="bar" />; },
  Scatter: ({ options }: any) => { captured.options = options; return <div data-testid="scatter" />; },
}));

const configs: Record<string, any> = {
  MILE_RUN: { label: 'Mile Run', unit: 's', metricType: 'lower_is_better', lowerIsBetter: true, displayFormat: 'duration', decimalPrecision: 1 },
};
vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({ getMetricConfig: (code: string) => configs[code] ?? null, isLoaded: true, metricsMap: {} }),
}));

import { BarChart } from '../BarChart';
import { SwarmChart } from '../SwarmChart';

const point = (athleteId: string, value: number) => ({
  athleteId, athleteName: `Athlete ${athleteId}`, value, metric: 'MILE_RUN', date: new Date('2024-01-01'), teamName: 'T',
});
const data = [point('a', 402.5), point('b', 410.5)];
const statistics = { MILE_RUN: { count: 2, mean: 406.5, median: 406.5, min: 402.5, max: 410.5, std: 4, variance: 16, percentiles: {} } } as any;
const config = { type: 'bar_chart', title: 'Mile', showLegend: false, showTooltips: true, responsive: true } as any;

describe('charts: duration (mm:ss) metrics', () => {
  beforeEach(() => { captured.options = undefined; });

  it('BarChart tooltip, value axis and stats use m:ss', () => {
    render(<BarChart data={data as any} config={config} statistics={statistics} />);
    const tooltip = captured.options.plugins.tooltip.callbacks.label({ parsed: { x: 402.5 } });
    expect(tooltip).toContain('6:42.5');
    expect(captured.options.scales.x.ticks.callback(420)).toBe('7:00');
    expect(captured.options.scales.x.title.text).toContain('(mm:ss)');
    expect(screen.getByText('6:42.5')).toBeInTheDocument(); // best performance panel
  });

  it('SwarmChart tooltip and y axis use m:ss', () => {
    render(<SwarmChart data={data as any} config={config} statistics={statistics} />);
    const tooltip = captured.options.plugins.tooltip.callbacks.label({ raw: { y: 402.5 }, parsed: { y: 402.5 } });
    expect(tooltip).toContain('6:42.5');
    expect(captured.options.scales.y.ticks.callback(405)).toBe('6:45');
  });
});
