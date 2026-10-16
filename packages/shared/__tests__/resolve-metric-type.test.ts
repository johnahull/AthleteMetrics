import { describe, it, expect } from 'vitest';
import * as analyticsTypes from '../analytics-types';
import { resolveMetricType, isLowerBetterType } from '../analytics-types';

describe('resolveMetricType', () => {
  it('uses the metric type from the metric row when one is given', () => {
    // MILE_RUN and the ORG_* code are not built-ins: only the type can say lower is better
    expect(resolveMetricType('MILE_RUN', 'lower_is_better')).toBe('lower_is_better');
    expect(resolveMetricType('ORG_SPRINT', 'lower_is_better')).toBe('lower_is_better');
    expect(resolveMetricType('HEIGHT', 'tracking')).toBe('tracking');
  });

  it('lets the metric type win over the built-in fallback list', () => {
    expect(resolveMetricType('FLY10_TIME', 'higher_is_better')).toBe('higher_is_better');
  });

  it('falls back to higher_is_better for a code with no type outside the built-in list', () => {
    expect(resolveMetricType('MILE_RUN')).toBe('higher_is_better');
    expect(resolveMetricType('ORG_SPRINT', undefined)).toBe('higher_is_better');
    expect(resolveMetricType('ORG_SPRINT', null)).toBe('higher_is_better');
  });

  it.each([
    ['FLY10_TIME', 'lower_is_better'],
    ['DASH_40YD', 'lower_is_better'],
    ['DASH_10YD', 'lower_is_better'],
    ['AGILITY_COD_DEFICIT_M', 'lower_is_better'],
    ['VERTICAL_JUMP', 'higher_is_better'],
    ['RSI', 'higher_is_better'],
    ['TOP_SPEED', 'higher_is_better'],
  ] as const)('built-in %s without a type falls back to %s (unchanged)', (code, expected) => {
    expect(resolveMetricType(code)).toBe(expected);
  });
});

describe('loading: empty types map, then the loaded one', () => {
  it('keeps built-in times lower on first paint and lets the loaded type take over', () => {
    const loading: Record<string, 'lower_is_better' | 'higher_is_better' | 'tracking'> = {};
    const loaded = { FLY10_TIME: 'lower_is_better', ORG_SPRINT: 'lower_is_better' } as const;

    expect(resolveMetricType('FLY10_TIME', loading.FLY10_TIME)).toBe('lower_is_better');
    expect(resolveMetricType('FLY10_TIME', loaded.FLY10_TIME)).toBe('lower_is_better');
    expect(resolveMetricType('ORG_SPRINT', loading.ORG_SPRINT)).toBe('higher_is_better');
    expect(resolveMetricType('ORG_SPRINT', loaded.ORG_SPRINT)).toBe('lower_is_better');
  });
});

describe('isLowerBetterType', () => {
  it('is true only when the resolved type is lower_is_better', () => {
    expect(isLowerBetterType('MILE_RUN', 'lower_is_better')).toBe(true);
    expect(isLowerBetterType('MILE_RUN')).toBe(false);
    expect(isLowerBetterType('FLY10_TIME')).toBe(true);
    expect(isLowerBetterType('FLY10_TIME', 'higher_is_better')).toBe(false);
    expect(isLowerBetterType('HEIGHT', 'tracking')).toBe(false);
  });
});

describe('analytics-types exports', () => {
  it('exposes the fallback list only through the resolver', () => {
    for (const name of ['LOWER_IS_BETTER_METRICS', 'isLowerIsBetterMetric', 'getMetricTypeWithFallback']) {
      expect(analyticsTypes).not.toHaveProperty(name);
    }
  });
});
