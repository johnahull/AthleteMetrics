import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MeasurementsTimeline } from '../measurements-timeline';

vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({
    labels: {},
    getLabel: (c: string) => c,
    formats: { MILE_RUN: { unit: 's', displayFormat: 'duration', decimalPrecision: 1 } },
    isLoading: false,
  }),
}));

const entry = (metricType: string, value: number) => ({
  id: metricType, athleteId: 'a1', athleteName: 'Sam', metricType, value, date: '2024-01-15',
});

describe('MeasurementsTimeline: duration (mm:ss) metrics', () => {
  it('shows a duration value as m:ss and leaves a decimal metric as before', () => {
    render(<MeasurementsTimeline measurements={[entry('MILE_RUN', 402.5), entry('FLY10_TIME', 1.5)]} />);
    expect(screen.getByText('6:42.5')).toBeInTheDocument();
    expect(screen.getByText('1.50s')).toBeInTheDocument();
  });
});
