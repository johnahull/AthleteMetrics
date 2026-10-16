import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { TrendData } from '@shared/analytics-types';
import { usePerformanceAthleteSelector } from '../usePerformanceAthleteSelector';

const metricList: Record<string, { label: string; unit: string; metricType: string; displayFormat: string; decimalPrecision?: number }> = {
  FLY10_TIME: { label: '10-Yard Fly Time', unit: 's', metricType: 'lower_is_better', displayFormat: 'decimal' },
  MILE_RUN: { label: 'Mile Run', unit: 's', metricType: 'lower_is_better', displayFormat: 'duration' },
  VERTICAL_JUMP: { label: 'Vertical Jump', unit: 'in', metricType: 'higher_is_better', displayFormat: 'decimal' },
  BODY_WEIGHT: { label: 'Body Weight', unit: 'lbs', metricType: 'tracking', displayFormat: 'decimal' },
};

// Mutable so a test can simulate the metric list still loading
const metricConfigState = { loaded: true };

vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: (code: string) => (metricConfigState.loaded ? metricList[code] ?? null : null),
    isLoaded: metricConfigState.loaded,
    metricsMap: {},
  }),
}));

function trend(athleteId: string, athleteName: string, metric: string, values: number[]): TrendData {
  return {
    athleteId,
    athleteName,
    metric,
    teamName: 'Team',
    data: values.map((value, i) => ({ date: new Date(2026, 0, i + 1), value, isPersonalBest: false })),
  } as unknown as TrendData;
}

function render(metric: string, data: TrendData[], maxSelection = 2) {
  const onSelectionChange = vi.fn();
  const { result } = renderHook(() =>
    usePerformanceAthleteSelector({ data, selectedAthleteIds: [], onSelectionChange, maxSelection, metric })
  );
  return { result, onSelectionChange };
}

describe('usePerformanceAthleteSelector', () => {
  afterEach(() => {
    metricConfigState.loaded = true;
  });

  it.each(['FLY10_TIME', 'MILE_RUN'])('ranks a lower-is-better metric (%s) fastest first', (metric) => {
    const data = [
      trend('slow', 'Slow', metric, [2.0, 1.9]),
      trend('fast', 'Fast', metric, [1.7, 1.5]),
      trend('mid', 'Mid', metric, [1.6, 1.8]),
    ];
    const { result, onSelectionChange } = render(metric, data);

    expect(result.current.athleteOptions.map(a => a.id)).toEqual(['fast', 'mid', 'slow']);
    expect(result.current.athleteOptions.map(a => a.bestValue)).toEqual([1.5, 1.6, 1.9]);

    result.current.selectTopPerformers();
    expect(onSelectionChange).toHaveBeenCalledWith(['fast', 'mid']);
  });

  it('ranks a higher-is-better metric highest first', () => {
    const data = [
      trend('low', 'Low', 'VERTICAL_JUMP', [20, 22]),
      trend('high', 'High', 'VERTICAL_JUMP', [30, 28]),
    ];
    const { result } = render('VERTICAL_JUMP', data);

    expect(result.current.athleteOptions.map(a => a.id)).toEqual(['high', 'low']);
    expect(result.current.athleteOptions.map(a => a.bestValue)).toEqual([30, 22]);
  });

  it('shows the most recent value for a tracking metric, sorted by name', () => {
    const data = [
      trend('z', 'Zed', 'BODY_WEIGHT', [150, 160]),
      trend('a', 'Amy', 'BODY_WEIGHT', [140, 135]),
    ];
    const { result } = render('BODY_WEIGHT', data);

    expect(result.current.athleteOptions.map(a => a.id)).toEqual(['a', 'z']);
    expect(result.current.athleteOptions.map(a => a.bestValue)).toEqual([135, 160]);
  });

  it('takes the label and unit from the metric list', () => {
    const { result } = render('FLY10_TIME', []);
    expect(result.current.metricLabel).toBe('10-Yard Fly Time');
    expect(result.current.unit).toBe('s');
    expect(result.current.formatValue(1.5)).toBe('1.50 s');
  });

  it('shows duration metrics as mm:ss with no unit', () => {
    const { result } = render('MILE_RUN', []);
    expect(result.current.metricLabel).toBe('Mile Run');
    expect(result.current.unit).toBe('');
    expect(result.current.formatValue(402.5)).toBe('6:42.5');
  });

  it('formats with the metric decimal precision and keeps 2 decimals when none is set', () => {
    metricList.CMJ = { label: 'CMJ', unit: 'cm', metricType: 'higher_is_better', displayFormat: 'decimal', decimalPrecision: 1 };
    try {
      expect(render('CMJ', []).result.current.formatValue(28.54)).toBe('28.5 cm');
      expect(render('VERTICAL_JUMP', []).result.current.formatValue(28.5)).toBe('28.50 in');
    } finally {
      delete metricList.CMJ;
    }
  });

  it('ignores non-numeric values instead of ranking them as 0', () => {
    const data = [
      trend('bad', 'Bad', 'FLY10_TIME', [Number.NaN, 1.8]),
      trend('fast', 'Fast', 'FLY10_TIME', [1.5]),
      trend('none', 'None', 'FLY10_TIME', [Number.NaN]),
    ];
    const { result } = render('FLY10_TIME', data);

    expect(result.current.athleteOptions.map(a => a.id)).toEqual(['fast', 'bad', 'none']);
    expect(result.current.athleteOptions.map(a => a.bestValue).slice(0, 2)).toEqual([1.5, 1.8]);
  });

  it('reports whether the metric list has loaded', () => {
    expect(render('FLY10_TIME', []).result.current.isMetricConfigLoaded).toBe(true);
    metricConfigState.loaded = false;
    expect(render('FLY10_TIME', []).result.current.isMetricConfigLoaded).toBe(false);
  });

  it('ranks a built-in time metric fastest first while the metric list loads', () => {
    metricConfigState.loaded = false;
    const data = [
      trend('slow', 'Slow', 'FLY10_TIME', [2.0]),
      trend('fast', 'Fast', 'FLY10_TIME', [1.5]),
      trend('mid', 'Mid', 'FLY10_TIME', [1.7]),
    ];
    expect(render('FLY10_TIME', data).result.current.athleteOptions.map(a => a.id)).toEqual(['fast', 'mid', 'slow']);
  });

  it('falls back to the code for an unknown metric', () => {
    const { result } = render('UNKNOWN', []);
    expect(result.current.metricLabel).toBe('UNKNOWN');
    expect(result.current.unit).toBe('');
  });
});
