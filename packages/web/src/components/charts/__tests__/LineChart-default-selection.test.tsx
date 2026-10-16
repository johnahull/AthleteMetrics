/**
 * LineChart default top-N selection: picks the best athletes in the metric's direction
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { TrendData } from '@shared/analytics-types';
import { LineChart } from '../LineChart';

// Mutable so a test can simulate the metric list still loading (no config)
const metricConfigState: { config: { label: string; unit: string; metricType: string; displayFormat: string } | null } = {
  config: null,
};

vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: () => metricConfigState.config,
    isLoaded: metricConfigState.config !== null,
    metricsMap: {},
  }),
}));

vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ getLabel: (code: string) => code }),
}));

// Render the dataset labels so the test can see which athletes were picked
vi.mock('react-chartjs-2', () => ({
  Line: ({ data }: { data: { datasets: Array<{ label: string }> } }) => (
    <ul>
      {data.datasets.map(d => (
        <li key={d.label} data-testid="dataset">{d.label}</li>
      ))}
    </ul>
  ),
}));

function trend(athleteId: string, metric: string, values: number[]): TrendData {
  return {
    athleteId,
    athleteName: athleteId,
    metric,
    data: values.map((value, i) => ({ date: new Date(2024, 0, i + 1), value })),
  } as unknown as TrendData;
}

const config = { type: 'line_chart' as const, title: 'Trend', showLegend: true, showTooltips: true, responsive: true };

function pickedAthletes(metric: string) {
  render(
    <LineChart
      data={[trend('Slow', metric, [2.0]), trend('Fast', metric, [1.5]), trend('Mid', metric, [1.7])]}
      config={config}
      maxAthletes={2}
    />
  );
  return screen.getAllByTestId('dataset').map(el => el.textContent);
}

describe('LineChart default top-N selection', () => {
  afterEach(() => {
    metricConfigState.config = null;
  });

  it('picks the fastest athletes for a lower-is-better metric from the metric list', () => {
    metricConfigState.config = { label: 'Mile Run', unit: 's', metricType: 'lower_is_better', displayFormat: 'duration' };
    expect(pickedAthletes('MILE_RUN').sort()).toEqual(['Fast', 'Mid']);
  });

  it('picks the fastest athletes for a built-in time metric while the metric list loads', () => {
    expect(pickedAthletes('FLY10_TIME').sort()).toEqual(['Fast', 'Mid']);
  });

  it('picks the highest athletes for a higher-is-better metric', () => {
    metricConfigState.config = { label: 'Vertical Jump', unit: 'in', metricType: 'higher_is_better', displayFormat: 'decimal' };
    expect(pickedAthletes('VERTICAL_JUMP').sort()).toEqual(['Mid', 'Slow']);
  });
});
