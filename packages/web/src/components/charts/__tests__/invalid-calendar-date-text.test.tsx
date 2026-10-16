/**
 * An unparseable date must not print "undefined" or an empty "()" next to a value.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConnectedScatterChart } from '../ConnectedScatterChart';
import { MetricProgressCard } from '@/components/athlete/MetricProgressCard';

let scatterOptions: any;
vi.mock('react-chartjs-2', () => ({
  Scatter: ({ options }: any) => {
    scatterOptions = options;
    return <div data-testid="scatter" />;
  },
  Line: () => <div data-testid="sparkline-chart" />,
}));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('@/hooks/use-metric-config', () => ({ useMetricConfig: () => ({ getMetricConfig: () => null }) }));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ labels: {}, getLabel: (code: string) => code, isLoading: false }),
}));

describe('invalid date text', () => {
  it('ConnectedScatterChart tooltip leaves out an invalid date', () => {
    const day = new Date(Date.UTC(2026, 2, 10));
    const trend = (metric: string, value: number) => ({ athleteId: 'a1', athleteName: 'Lucy', metric, data: [{ date: day, value }] });
    render(
      <ConnectedScatterChart
        data={[trend('FLY10_TIME', 1.5), trend('VERTICAL_JUMP', 30)] as any}
        config={{ title: 'T' } as any}
        highlightAthlete="a1"
      />
    );
    const { title, label } = scatterOptions.plugins.tooltip.callbacks;
    const ctx = { raw: { x: 1.5, y: 30, date: 'not-a-date' }, dataset: { label: 'Lucy' } };
    expect(title([ctx])).toBe('Lucy');
    expect(String(label(ctx))).not.toMatch(/undefined|Date:/);
  });

  it('MetricProgressCard shows no "()" for an invalid PR date', () => {
    const { container } = render(
      <MetricProgressCard
        metric="FLY10_TIME"
        displayName="Fly 10"
        units="s"
        measurements={[{
          id: 'm1', userId: 'u1', isVerified: true, date: '2026-03-10', metric: 'FLY10_TIME', value: '1.52', units: 's',
        } as any]}
        personalRecord={{
          metric: 'FLY10_TIME', displayName: 'Fly 10', value: 1.52, units: 's', date: 'not-a-date',
          isRecent: false, improvement: null, improvementText: null,
        } as any}
      />
    );
    expect(container).not.toHaveTextContent('()');
    expect(container).toHaveTextContent('1.52');
  });
});
