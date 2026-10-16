import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeerMetricCard } from '../PeerMetricCard';

vi.mock('@/hooks/usePeerComparison', () => ({
  getPercentileLabel: () => ({ label: 'ABOVE AVERAGE' }),
  usePeerDistribution: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({
    labels: {},
    getLabel: (c: string) => c,
    formats: { MILE_RUN: { unit: 's', displayFormat: 'duration', decimalPrecision: 1 } },
    isLoading: false,
  }),
}));

const result = (metric: string, athleteValue: number) => ({
  metric, athleteValue, percentile: 60, sampleSize: 30, label: '', message: '', distribution: { p25: null, p50: null, p75: null },
});

describe('PeerMetricCard: duration (mm:ss) metrics', () => {
  it('shows the athlete value and benchmark target as m:ss', () => {
    render(
      <PeerMetricCard
        result={result('MILE_RUN', 402.5)}
        benchmark={{ metricCode: 'MILE_RUN', benchmarkName: 'Varsity', targetValue: 390, currentValue: 402.5, isMet: false, progress: 80, source: 'Global' }}
      />
    );
    expect(screen.getByText('6:42.5')).toBeInTheDocument();
    expect(screen.getByText(/Target: 6:30\.0/)).toBeInTheDocument();
  });

  it('keeps a decimal metric at two decimals', () => {
    render(<PeerMetricCard result={result('FLY10_TIME', 1.234)} />);
    expect(screen.getByText(/1\.23/)).toBeInTheDocument();
  });
});

import { DistributionBoxPlot } from '@/components/charts/DistributionBoxPlot';

describe('DistributionBoxPlot: duration (mm:ss) metric', () => {
  it('labels the percentiles as m:ss', () => {
    render(
      <DistributionBoxPlot
        distribution={{ p10: 390, p25: 395, p50: 402.5, p75: 410, p90: 420, mean: 403, sampleSize: 30 } as any}
        athleteValue={402.5}
        metricName="Mile"
        lowerIsBetter
        format={{ unit: 's', displayFormat: 'duration', decimalPrecision: 1 }}
      />
    );
    expect(screen.getByText('6:30.0')).toBeInTheDocument();
    expect(screen.getByText('7:00.0')).toBeInTheDocument();
  });
});
