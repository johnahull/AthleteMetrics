/**
 * Shared cases: chart labels for calendar-date keys ('YYYY-MM-DD') show the
 * stored day. Imported by per-timezone test files.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatDateLabel } from '../utils/timeSeriesDataProcessor';
import { BenchmarkProgressChart } from '../BenchmarkProgressChart';
import { MeasurementProgressChart } from '@/components/athlete/MeasurementProgressChart';

vi.mock('react-chartjs-2', () => ({
  Line: ({ data }: any) => <div data-testid="chart-labels">{JSON.stringify(data.labels)}</div>,
}));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ labels: {}, getLabel: (code: string) => code, isLoading: false }),
}));

export function describeChartCalendarDateCases(zone: string) {
  describe(`chart calendar-date labels show the stored day (${zone})`, () => {
    it('formatDateLabel', () => {
      expect(formatDateLabel('2026-03-10')).toBe('Mar 10');
    });

    it('BenchmarkProgressChart x-axis labels', () => {
      render(
        <BenchmarkProgressChart
          data={{ benchmarkName: 'Speed', snapshots: [{ date: '2026-03-10', achievementRate: 50, athletesMet: 1, applicableAthletes: 2 }] }}
        />
      );
      expect(screen.getByTestId('chart-labels')).toHaveTextContent('["Mar 10"]');
    });

    it('MeasurementProgressChart x-axis labels', () => {
      const m: any = {
        id: 'm1', metric: 'FLY10_TIME', value: '1.23', units: 's', date: '2026-03-10', isVerified: true, userId: 'u1',
      };
      render(<MeasurementProgressChart measurements={[m, { ...m, id: 'm2', date: '2026-03-12', value: '1.20' }]} />);
      expect(screen.getByTestId('chart-labels')).toHaveTextContent('["Mar 10","Mar 12"]');
    });
  });
}
