import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMetricLabels } from '../use-metric-labels';
import type { AvailableMetric } from '../use-available-metrics';

const mockAvailableMetrics = {
  metrics: [] as AvailableMetric[],
  isLoading: false,
  error: null as Error | null,
};

vi.mock('../use-available-metrics', () => ({
  useAvailableMetrics: () => mockAvailableMetrics,
}));

function fixture(code: string, label: string): AvailableMetric {
  return {
    code,
    label,
    unit: '',
    metricType: 'higher_is_better',
    lowerIsBetter: false,
  };
}

describe('useMetricLabels', () => {
  beforeEach(() => {
    mockAvailableMetrics.metrics = [];
    mockAvailableMetrics.isLoading = false;
    mockAvailableMetrics.error = null;
  });

  it('builds a code → label map from useAvailableMetrics', () => {
    mockAvailableMetrics.metrics = [
      fixture('FLY10_TIME', '10-Yard Fly Time'),
      fixture('VERTICAL_JUMP', 'Vertical Jump'),
    ];

    const { result } = renderHook(() => useMetricLabels());

    expect(result.current.labels).toEqual({
      FLY10_TIME: '10-Yard Fly Time',
      VERTICAL_JUMP: 'Vertical Jump',
    });
  });

  it('getLabel returns the human-readable label for a known code', () => {
    mockAvailableMetrics.metrics = [fixture('FLY10_TIME', '10-Yard Fly Time')];

    const { result } = renderHook(() => useMetricLabels());

    expect(result.current.getLabel('FLY10_TIME')).toBe('10-Yard Fly Time');
  });

  it('getLabel underscore-splits unknown codes for a readable fallback', () => {
    mockAvailableMetrics.metrics = [fixture('FLY10_TIME', '10-Yard Fly Time')];

    const { result } = renderHook(() => useMetricLabels());

    // Codes not in the labels map (archived/deleted/migrated/loading) fall
    // back to the underscore-split form so users see prose, not raw codes.
    expect(result.current.getLabel('ARCHIVED_METRIC')).toBe('ARCHIVED METRIC');
    expect(result.current.getLabel('CUSTOM_DEADLIFT_1RM')).toBe('CUSTOM DEADLIFT 1RM');
  });

  it('returns isLoading from the underlying useAvailableMetrics', () => {
    mockAvailableMetrics.isLoading = true;

    const { result } = renderHook(() => useMetricLabels());

    expect(result.current.isLoading).toBe(true);
  });

  it('returns an empty map while loading; getLabel underscore-splits codes', () => {
    mockAvailableMetrics.isLoading = true;
    mockAvailableMetrics.metrics = [];

    const { result } = renderHook(() => useMetricLabels());

    expect(result.current.labels).toEqual({});
    // During the loading window the fallback path runs for every code; it
    // produces underscore-split prose so a first-paint flash doesn't show
    // raw underscored codes to the user.
    expect(result.current.getLabel('FLY10_TIME')).toBe('FLY10 TIME');
  });

  it('reflects custom labels from the upstream hook', () => {
    mockAvailableMetrics.metrics = [
      fixture('FLY10_TIME', 'My Org Fly Time'),
    ];

    const { result } = renderHook(() => useMetricLabels());

    expect(result.current.getLabel('FLY10_TIME')).toBe('My Org Fly Time');
  });
});
