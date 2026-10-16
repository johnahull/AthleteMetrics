import { describe, it, expect } from 'vitest';
import { groupedCodes } from '../metric-groups';

const metricGroups = [
  { group: 'speed', label: 'Speed', codes: ['DASH_10YD', 'DASH_20YD'] },
  { group: 'power', label: 'Power', codes: ['JUMP_CMJ_HOH'] },
] as any[];

describe('groupedCodes', () => {
  it('splits the present codes by group in group order, dropping empty groups', () => {
    expect(groupedCodes(['JUMP_CMJ_HOH', 'DASH_20YD'], metricGroups)).toEqual([
      { group: 'speed', label: 'Speed', codes: ['DASH_20YD'] },
      { group: 'power', label: 'Power', codes: ['JUMP_CMJ_HOH'] },
    ]);
  });

  it('puts codes unknown to metricGroups last, without a heading', () => {
    expect(groupedCodes(['MYSTERY', 'DASH_10YD'], metricGroups)).toEqual([
      { group: 'speed', label: 'Speed', codes: ['DASH_10YD'] },
      { group: null, label: null, codes: ['MYSTERY'] },
    ]);
  });

  it('returns one unlabelled group in entry order when metricGroups is absent or empty', () => {
    expect(groupedCodes(['B', 'A'], undefined)).toEqual([{ group: null, label: null, codes: ['B', 'A'] }]);
    expect(groupedCodes(['B', 'A'], [])).toEqual([{ group: null, label: null, codes: ['B', 'A'] }]);
  });

  it('returns nothing for no codes', () => {
    expect(groupedCodes([], metricGroups)).toEqual([]);
  });
});
