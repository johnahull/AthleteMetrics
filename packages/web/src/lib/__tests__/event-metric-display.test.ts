/**
 * getEventMetricDisplay: readable label, unit and category for an event metric,
 * read from the `metricDetails` (site metric) the server attaches to each row.
 */
import { describe, it, expect } from 'vitest';
import { getEventMetricDisplay } from '../event-metric-display';

const details = { label: 'Vertical Jump', unit: 'in', category: 'power' };

describe('getEventMetricDisplay', () => {
  it('uses the site metric label, unit and category from metricDetails', () => {
    expect(getEventMetricDisplay({ metricCode: 'VERTICAL_JUMP', customLabel: null, metricDetails: details })).toEqual({
      code: 'VERTICAL_JUMP',
      label: 'Vertical Jump',
      unit: 'in',
      category: 'power',
    });
  });

  it('prefers the event custom label over the site label', () => {
    const display = getEventMetricDisplay({ metricCode: 'VERTICAL_JUMP', customLabel: 'CMJ (no arms)', metricDetails: details });
    expect(display.label).toBe('CMJ (no arms)');
    expect(display.unit).toBe('in');
  });

  it('ignores a blank custom label', () => {
    expect(getEventMetricDisplay({ metricCode: 'VERTICAL_JUMP', customLabel: '  ', metricDetails: details }).label).toBe(
      'Vertical Jump',
    );
  });

  it('falls back to the code with no unit or category when the site metric is missing', () => {
    expect(getEventMetricDisplay({ metricCode: 'OLD_METRIC', customLabel: null, metricDetails: null })).toEqual({
      code: 'OLD_METRIC',
      label: 'OLD_METRIC',
      unit: undefined,
      category: undefined,
    });
  });

  it('treats an empty unit (e.g. RSI) as no unit', () => {
    expect(
      getEventMetricDisplay({ metricCode: 'RSI', metricDetails: { label: 'Reactive Strength Index', unit: '', category: 'power' } }).unit,
    ).toBeUndefined();
  });

  it('does not read legacy flat label/units fields (the server never sends them)', () => {
    const legacy = { metricCode: 'VERTICAL_JUMP', label: 'Flat Label', units: 'cm' } as any;
    expect(getEventMetricDisplay(legacy)).toEqual({
      code: 'VERTICAL_JUMP',
      label: 'VERTICAL_JUMP',
      unit: undefined,
      category: undefined,
    });
  });
});
