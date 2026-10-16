import { describe, it, expect } from 'vitest';
import { formatValueWithUnit } from '../metrics';

describe('formatValueWithUnit', () => {
  it('separates the unit from the value with a space', () => {
    expect(formatValueWithUnit(2.34, 's')).toBe('2.34 s');
    expect(formatValueWithUnit('28', 'in')).toBe('28 in');
    expect(formatValueWithUnit(21.5, 'mph')).toBe('21.5 mph');
  });

  it('attaches %, inch and foot marks without a space', () => {
    expect(formatValueWithUnit(99.14, '%')).toBe('99.14%');
    expect(formatValueWithUnit(32, '"')).toBe('32"');
    expect(formatValueWithUnit(6, "'")).toBe("6'");
  });

  it('returns the bare value when there is no unit', () => {
    expect(formatValueWithUnit(1.8, '')).toBe('1.8');
    expect(formatValueWithUnit(1.8, null)).toBe('1.8');
    expect(formatValueWithUnit(1.8)).toBe('1.8');
  });

  it('returns blank value unchanged, without a lone unit', () => {
    expect(formatValueWithUnit('', 's')).toBe('');
    expect(formatValueWithUnit('  ', 's')).toBe('  ');
  });
});
