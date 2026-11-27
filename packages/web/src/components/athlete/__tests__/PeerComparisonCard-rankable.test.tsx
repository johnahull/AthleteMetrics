/**
 * The dashboard peer card drops metrics the server never ranks (tracking, custom,
 * Movement Quality) before it takes its first few, so they cannot use up the slots.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PeerComparisonCard } from '../PeerComparisonCard';

const state = vi.hoisted(() => ({ listLoading: false }));
const usePeerPercentiles = vi.hoisted(() =>
  vi.fn(() => ({ data: undefined, isLoading: false, isError: false, error: null })),
);

vi.mock('@/hooks/usePeerComparison', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePeerComparison')>()),
  usePeerComparisonStatus: () => ({ data: { optedIn: true }, isLoading: false }),
  usePeerPercentiles,
}));

vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => ({
    metrics: state.listLoading
      ? []
      : [
          { code: 'WEIGHT_LBS', label: 'Weight', metricType: 'tracking', isCustom: false },
          { code: 'ORG_X_SPRINT', label: 'Custom sprint', metricType: 'lower_is_better', isCustom: true },
          { code: 'MQ_JUMP', label: 'Jump quality', metricType: 'higher_is_better', isCustom: false },
          { code: 'FLY10_TIME', label: 'Fly 10', metricType: 'lower_is_better', isCustom: false },
          { code: 'VERTICAL_JUMP', label: 'Vertical', metricType: 'higher_is_better', isCustom: false },
          { code: 'RSI', label: 'RSI', metricType: 'higher_is_better', isCustom: false },
          { code: 'DASH_40YD', label: '40 yd', metricType: 'lower_is_better', isCustom: false },
        ],
    isLoading: state.listLoading,
    error: null,
  }),
}));

// Unranked metrics first, as an alphabetical list can order them
const MEASURED = ['WEIGHT_LBS', 'ORG_X_SPRINT', 'MQ_JUMP', 'FLY10_TIME', 'NOT_LISTED', 'VERTICAL_JUMP', 'RSI', 'DASH_40YD'];

const requested = () => usePeerPercentiles.mock.calls[usePeerPercentiles.mock.calls.length - 1] as unknown as [string, string[], unknown, { enabled: boolean }];

describe('PeerComparisonCard: metrics it asks to rank', () => {
  beforeEach(() => {
    state.listLoading = false;
    usePeerPercentiles.mockClear();
  });

  it('takes the first three rankable metrics, keeping codes the list does not know', () => {
    render(<PeerComparisonCard userId="u1" athleteId="a1" availableMetrics={MEASURED} compact />);
    expect(requested()[1]).toEqual(['FLY10_TIME', 'NOT_LISTED', 'VERTICAL_JUMP']);
    expect(requested()[3].enabled).toBe(true);
  });

  it('takes five when not compact', () => {
    render(<PeerComparisonCard userId="u1" athleteId="a1" availableMetrics={MEASURED} />);
    expect(requested()[1]).toEqual(['FLY10_TIME', 'NOT_LISTED', 'VERTICAL_JUMP', 'RSI', 'DASH_40YD']);
  });

  it('requests nothing and shows the empty state when no metric can be ranked', () => {
    render(<PeerComparisonCard userId="u1" athleteId="a1" availableMetrics={['WEIGHT_LBS', 'ORG_X_SPRINT', 'MQ_JUMP']} />);
    expect(requested()[1]).toEqual([]); // the hook sends nothing for an empty list
    expect(screen.getByText(/Once you have measurements/)).toBeInTheDocument();
  });

  it('sends no request while the metric list is loading', () => {
    state.listLoading = true;
    render(<PeerComparisonCard userId="u1" athleteId="a1" availableMetrics={MEASURED} compact />);
    expect(requested()[3].enabled).toBe(false);
  });
});
