import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_METRIC_MEANINGS,
  NO_MEANING,
  PENDING_MEANING,
  getMetricMeaning,
  metricMeaningCodes,
} from '../metric-explanations/meanings';
import { BUILT_IN_METRIC_CODE_LIST } from './fixtures/built-in-metric-codes';

const mapped = (code: string) => metricMeaningCodes().includes(code);

describe('built-in metric meanings coverage', () => {
  it('every built-in code is mapped, NO_MEANING or PENDING_MEANING', () => {
    const missing = BUILT_IN_METRIC_CODE_LIST.filter((c) => !mapped(c) && !NO_MEANING.includes(c) && !PENDING_MEANING.includes(c));
    expect(missing).toEqual([]);
  });

  it('no code is in two lists', () => {
    const all = [...metricMeaningCodes(), ...NO_MEANING, ...PENDING_MEANING];
    const dupes = all.filter((c, i) => all.indexOf(c) !== i);
    expect(dupes).toEqual([]);
  });

  it('the checked-in list has no duplicates', () => {
    expect(BUILT_IN_METRIC_CODE_LIST.filter((c, i) => BUILT_IN_METRIC_CODE_LIST.indexOf(c) !== i)).toEqual([]);
  });

  it('meaning text has no digits and stays within 60 words', () => {
    for (const [code, entry] of Object.entries(BUILT_IN_METRIC_MEANINGS)) {
      expect(entry, code).not.toMatch(/\d/);
      expect(entry.split(/\s+/).length, code).toBeLessThanOrEqual(60);
    }
  });

  it('the Chris battery is mapped', () => {
    for (const c of ['DASH_10YD', 'DASH_40YD', 'FLY10_TIME_RI10', 'AGILITY_5105', 'JUMP_CMJ_HOH', 'JUMP_SJ_HEIGHT', 'POWER_EUR', 'HOP_SL_TRIPLE_LSI', 'JUMP_BROAD', 'PEAK_POWER_REL', 'TOP_SPEED']) {
      expect(mapped(c), c).toBe(true);
    }
  });

  it('height, weight and absolute watts have no meaning', () => {
    expect(NO_MEANING).toEqual(expect.arrayContaining(['HEIGHT_IN', 'WEIGHT_LBS', 'PEAK_POWER_W']));
  });
});

describe('getMetricMeaning', () => {
  it('returns the built-in text, marked as built-in', () => {
    const m = getMetricMeaning('DASH_40YD');
    expect(m?.text).toBe(BUILT_IN_METRIC_MEANINGS.DASH_40YD);
    expect(m?.orgWritten).toBe(false);
  });
  it('one entry serves every listed code variant', () => {
    expect(getMetricMeaning('FLY10_TIME_RI5')?.text).toBe(getMetricMeaning('FLY10_TIME_RI30')?.text);
  });
  it('precedence: custom > site > built-in', () => {
    expect(getMetricMeaning('DASH_40YD', { siteMap: { DASH_40YD: 'site' }, customMap: { DASH_40YD: 'custom' } })).toEqual({ text: 'custom', orgWritten: true });
    expect(getMetricMeaning('DASH_40YD', { siteMap: { DASH_40YD: 'site' } })).toEqual({ text: 'site', orgWritten: false });
  });
  it('blank override text falls through', () => {
    expect(getMetricMeaning('DASH_40YD', { customMap: { DASH_40YD: '  ' } })?.text).toBe(BUILT_IN_METRIC_MEANINGS.DASH_40YD);
  });
  it('unknown, pending and NO_MEANING codes have no meaning', () => {
    expect(getMetricMeaning('NOPE')).toBeUndefined();
    expect(getMetricMeaning('MQI_TOTAL')).toBeUndefined();
    expect(getMetricMeaning('WEIGHT_LBS')).toBeUndefined();
  });
  it('a custom meaning on a NO_MEANING code is still not used', () => {
    expect(getMetricMeaning('WEIGHT_LBS', { customMap: { WEIGHT_LBS: 'x' } })).toBeUndefined();
  });
});
