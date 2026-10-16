import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { TrendData } from '@shared/analytics-types';
import { AthleteSelector } from '../athlete-selector-enhanced';

vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: (code: string) =>
      code === 'MILE_RUN'
        ? { label: 'Mile Run', unit: 's', metricType: 'lower_is_better', displayFormat: 'duration' }
        : { label: '10-Yard Fly Time', unit: 's', metricType: 'lower_is_better', displayFormat: 'decimal' },
    isLoaded: true,
    metricsMap: {},
  }),
}));

vi.mock('@/hooks/useContextualLabels', () => ({
  useContextualLabels: () => ({ athletes: 'Athletes', teams: 'Teams' }),
}));

const point = (value: number) => ({ date: new Date(2026, 0, 1), value, isPersonalBest: false });

function renderSelector(metric: string, data: TrendData[]) {
  render(<AthleteSelector data={data} selectedAthleteIds={[]} onSelectionChange={vi.fn()} metric={metric} />);
  fireEvent.click(screen.getByRole('button', { name: 'Manage Selection' }));
}

describe('AthleteSelector (enhanced)', () => {
  it('names the metric by label and unit in the footer and lists the fastest first', () => {
    renderSelector('FLY10_TIME', [
      { athleteId: 'slow', athleteName: 'Slow', metric: 'FLY10_TIME', data: [point(1.9)] },
      { athleteId: 'fast', athleteName: 'Fast', metric: 'FLY10_TIME', data: [point(1.5)] },
    ] as TrendData[]);

    expect(screen.getByText('Best 10-Yard Fly Time (s) performers shown first')).toBeInTheDocument();
    expect(screen.queryByText(/FLY10_TIME/)).not.toBeInTheDocument();
    const names = screen.getAllByText(/^(Fast|Slow)$/).map(el => el.textContent);
    expect(names).toEqual(['Fast', 'Slow']);
    expect(screen.getByText('1.50s')).toBeInTheDocument();
  });

  it('shows duration values as mm:ss', () => {
    renderSelector('MILE_RUN', [
      { athleteId: 'a', athleteName: 'Ann', metric: 'MILE_RUN', data: [point(402.5)] },
    ] as TrendData[]);

    expect(screen.getByText('Best Mile Run performers shown first')).toBeInTheDocument();
    expect(screen.getByText('6:42.5')).toBeInTheDocument();
  });
});
