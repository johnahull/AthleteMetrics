import { describe, it, expect } from 'vitest';
import { parseDuration, formatDuration, formatMeasurement, parseImportValue, formatDurationExact } from '../duration-format';

describe('parseDuration', () => {
  it.each([
    ['402.5', 402.5],
    ['7', 7],
    ['6:42.5', 402.5],
    ['7:15', 435],
    ['06:42.5', 402.5],
    ['0:59.99', 59.99],
    ['1:00:05', 3605],
    [' 6:42 ', 402],
  ])('parses %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(['6:60', '6:5', '-1:00', '-5', '6:42,5', '1e3', 'Infinity', 'abc', '1:2:3:4', ':30', '6:', '1:00:60'])(
    'rejects %s',
    (input) => {
      expect(parseDuration(input)).toBeNull();
    },
  );

  it('returns null for empty input', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('   ')).toBeNull();
  });

  it('rounds to 3 decimals', () => {
    expect(parseDuration('0:01.23456')).toBe(1.235);
  });
});

describe('formatDuration', () => {
  it.each([
    [402.5, 1, '6:42.5'],
    [435, 1, '7:15.0'],
    [435, 0, '7:15'],
    [59.5, 1, '0:59.5'],
    [3605, 1, '1:00:05.0'],
    [-4.2, 1, '-0:04.2'],
    [0, 1, '0:00.0'],
  ])('formats %s at %s decimals as %s', (sec, decimals, expected) => {
    expect(formatDuration(sec, decimals)).toBe(expected);
  });

  it('rolls 59.996 over to the next minute instead of printing 0:60.00', () => {
    expect(formatDuration(59.996, 2)).toBe('1:00.00');
  });

  it('returns empty string for NaN', () => {
    expect(formatDuration(NaN, 1)).toBe('');
  });
});

describe('formatMeasurement', () => {
  it('formats duration metrics as mm:ss', () => {
    expect(formatMeasurement(402.5, { unit: 's', displayFormat: 'duration', decimalPrecision: 1 })).toBe('6:42.5');
  });

  it('formats decimal metrics with unit and precision', () => {
    expect(formatMeasurement(4.2, { unit: 's', displayFormat: 'decimal', decimalPrecision: 2 })).toBe('4.20 s');
  });

  it('treats a missing displayFormat as decimal', () => {
    expect(formatMeasurement(4.2, { unit: 's', decimalPrecision: 2 })).toBe('4.20 s');
  });
});

describe('parseImportValue', () => {
  it('reads mm:ss as seconds', () => {
    expect(parseImportValue('6:42.5')).toBe(402.5);
  });

  it('keeps the existing plain-number behavior for values without a colon', () => {
    expect(parseImportValue('4.35')).toBe(4.35);
    expect(parseImportValue('4.35s')).toBe(4.35);
  });

  it('returns null for an invalid time or a non-number', () => {
    expect(parseImportValue('6:60')).toBeNull();
    expect(parseImportValue('abc')).toBeNull();
    expect(parseImportValue('')).toBeNull();
  });
});

describe('formatDurationExact', () => {
  it('keeps up to 3 decimals and drops trailing zeros', () => {
    expect(formatDurationExact(402.5)).toBe('6:42.5');
    expect(formatDurationExact(435)).toBe('7:15');
    expect(formatDurationExact(400)).toBe('6:40');
    expect(formatDurationExact(402.125)).toBe('6:42.125');
    expect(formatDurationExact(3605)).toBe('1:00:05');
  });
});
