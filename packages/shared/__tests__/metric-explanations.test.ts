import { describe, it, expect } from 'vitest';
import {
  getMetricExplanation,
  buildMetricExplanationsMap,
  BUILT_IN_METRIC_CODES,
  GENERIC_CUSTOM_METRIC_PLACEHOLDER,
  type MetricExplanation,
} from '../metric-explanations';

const REQUIRED_FIELDS: Array<keyof MetricExplanation> = [
  'title',
  'shortDescription',
  'whatItMeasures',
  'whyItMatters',
  'unitNote',
  'directionOfBetter',
];

describe('getMetricExplanation — built-in metrics', () => {
  it('returns full explanation for FLY10_TIME with directionOfBetter=lower', () => {
    const result = getMetricExplanation('FLY10_TIME');
    expect(result).toBeDefined();
    expect(result.title).toBe('10-Yard Fly');
    expect(result.directionOfBetter).toBe('lower');
    expect(result.whatItMeasures).toMatch(/acceleration|velocity|speed/i);
    expect(result.whyItMatters.length).toBeGreaterThan(20);
    expect(result.unitNote).toMatch(/second/i);
    expect(result.unitNote).toMatch(/lower is better/i);
  });

  it('returns directionOfBetter=higher for VERTICAL_JUMP', () => {
    const result = getMetricExplanation('VERTICAL_JUMP');
    expect(result.directionOfBetter).toBe('higher');
    expect(result.unitNote).toMatch(/inch/i);
    expect(result.unitNote).toMatch(/higher is better/i);
  });

  it('returns directionOfBetter=higher for TOP_SPEED (mph)', () => {
    const result = getMetricExplanation('TOP_SPEED');
    expect(result.directionOfBetter).toBe('higher');
    expect(result.unitNote).toMatch(/mph/i);
  });

  it('returns directionOfBetter=higher for RSI with unit-agnostic note', () => {
    const result = getMetricExplanation('RSI');
    expect(result.directionOfBetter).toBe('higher');
    expect(result.unitNote.length).toBeGreaterThan(0);
  });

  it('exposes BUILT_IN_METRIC_CODES with all 8 documented metrics', () => {
    expect(BUILT_IN_METRIC_CODES).toEqual(
      expect.arrayContaining([
        'FLY10_TIME',
        'VERTICAL_JUMP',
        'AGILITY_505',
        'AGILITY_5105',
        'T_TEST',
        'DASH_40YD',
        'TOP_SPEED',
        'RSI',
      ]),
    );
    expect(BUILT_IN_METRIC_CODES).toHaveLength(8);
  });

  it.each(['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'TOP_SPEED', 'RSI'])(
    '%s has all required fields populated',
    (code) => {
      const result = getMetricExplanation(code);
      for (const field of REQUIRED_FIELDS) {
        expect(result[field], `${code} missing field ${field}`).toBeTruthy();
      }
    },
  );
});

describe('getMetricExplanation — custom metrics fallback', () => {
  it('uses customOrgMetrics.description as whatItMeasures when provided', () => {
    const result = getMetricExplanation('CUSTOM_BROAD_JUMP', {
      CUSTOM_BROAD_JUMP: { label: 'Broad Jump', description: 'Horizontal jump distance from standing start.' },
    });
    expect(result.title).toBe('Broad Jump');
    expect(result.whatItMeasures).toBe('Horizontal jump distance from standing start.');
    expect(result.directionOfBetter).toBe('higher');
  });

  it('falls back to generic placeholder when description is null', () => {
    const result = getMetricExplanation('CUSTOM_NO_DESC', {
      CUSTOM_NO_DESC: { label: 'Custom', description: null },
    });
    expect(result.whatItMeasures).toBe(GENERIC_CUSTOM_METRIC_PLACEHOLDER);
  });

  it('falls back to generic placeholder when description is an empty string', () => {
    const result = getMetricExplanation('CUSTOM_EMPTY', {
      CUSTOM_EMPTY: { label: 'Custom', description: '' },
    });
    expect(result.whatItMeasures).toBe(GENERIC_CUSTOM_METRIC_PLACEHOLDER);
  });

  it('falls back to the raw code as title when no label is available', () => {
    const result = getMetricExplanation('CUSTOM_NO_LABEL', {
      CUSTOM_NO_LABEL: { label: '', description: 'Some description' },
    });
    expect(result.title).toBe('CUSTOM_NO_LABEL');
  });
});

describe('getMetricExplanation — unknown and malformed input', () => {
  it('returns placeholder explanation for unknown code with no custom map', () => {
    const result = getMetricExplanation('UNKNOWN_CODE');
    expect(result).toBeDefined();
    expect(result.whatItMeasures).toBe(GENERIC_CUSTOM_METRIC_PLACEHOLDER);
    expect(result.title).toBe('UNKNOWN_CODE');
  });

  it('returns placeholder when custom map does not contain the code', () => {
    const result = getMetricExplanation('MISSING_CODE', {
      OTHER_CODE: { label: 'Other', description: 'Other description' },
    });
    expect(result.whatItMeasures).toBe(GENERIC_CUSTOM_METRIC_PLACEHOLDER);
    expect(result.title).toBe('MISSING_CODE');
  });

  it('handles empty string code without throwing', () => {
    expect(() => getMetricExplanation('')).not.toThrow();
    const result = getMetricExplanation('');
    expect(result.whatItMeasures).toBe(GENERIC_CUSTOM_METRIC_PLACEHOLDER);
  });

  it('preserves built-in precedence even if a custom map entry exists for the same code', () => {
    const result = getMetricExplanation('FLY10_TIME', {
      FLY10_TIME: { label: 'Hijacked', description: 'Malicious override' },
    });
    expect(result.title).toBe('10-Yard Fly');
    expect(result.whatItMeasures).not.toBe('Malicious override');
  });
});

describe('getMetricExplanation — custom metric direction and unit', () => {
  it('maps metricType=lower_is_better to directionOfBetter=lower', () => {
    const result = getMetricExplanation('CUSTOM_SPRINT', {
      CUSTOM_SPRINT: {
        label: 'Custom Sprint',
        description: 'Timed sprint.',
        unit: 'seconds',
        metricType: 'lower_is_better',
      },
    });
    expect(result.directionOfBetter).toBe('lower');
    expect(result.unitNote).toMatch(/seconds/i);
    expect(result.unitNote).toMatch(/lower is better/i);
  });

  it('maps metricType=higher_is_better to directionOfBetter=higher', () => {
    const result = getMetricExplanation('CUSTOM_POWER', {
      CUSTOM_POWER: {
        label: 'Custom Power',
        description: 'Peak output.',
        unit: 'watts',
        metricType: 'higher_is_better',
      },
    });
    expect(result.directionOfBetter).toBe('higher');
    expect(result.unitNote).toMatch(/watts/i);
    expect(result.unitNote).toMatch(/higher is better/i);
  });

  it('defaults to higher when metricType is missing', () => {
    const result = getMetricExplanation('CUSTOM_UNKNOWN', {
      CUSTOM_UNKNOWN: { label: 'Custom', description: 'x' },
    });
    expect(result.directionOfBetter).toBe('higher');
  });

  it('maps metricType=tracking to directionOfBetter=tracking with a neutral unit note', () => {
    const result = getMetricExplanation('CUSTOM_HEIGHT', {
      CUSTOM_HEIGHT: {
        label: 'Custom Height',
        description: 'Athlete standing height.',
        unit: 'cm',
        metricType: 'tracking',
      },
    });
    expect(result.directionOfBetter).toBe('tracking');
    expect(result.unitNote).toMatch(/cm/);
    expect(result.unitNote).toMatch(/tracked value/i);
    expect(result.unitNote).not.toMatch(/(higher|lower) is better/i);
  });

  it('uses a unit-agnostic note when unit is null', () => {
    const result = getMetricExplanation('CUSTOM_NO_UNIT', {
      CUSTOM_NO_UNIT: {
        label: 'Custom',
        description: 'x',
        unit: null,
        metricType: 'higher_is_better',
      },
    });
    expect(result.unitNote).toMatch(/higher is better/i);
    expect(result.unitNote).not.toMatch(/measured in/i);
  });
});

describe('buildMetricExplanationsMap', () => {
  it('dedups repeated codes so each resolves once', () => {
    const out = buildMetricExplanationsMap(['FLY10_TIME', 'FLY10_TIME', 'VERTICAL_JUMP']);
    expect(Object.keys(out)).toHaveLength(2);
    expect(out.FLY10_TIME.title).toBe('10-Yard Fly');
    expect(out.VERTICAL_JUMP.title).toBe('Vertical Jump');
  });

  it('skips empty-string codes without throwing', () => {
    const out = buildMetricExplanationsMap(['', 'FLY10_TIME']);
    expect(Object.keys(out)).toEqual(['FLY10_TIME']);
  });
});
