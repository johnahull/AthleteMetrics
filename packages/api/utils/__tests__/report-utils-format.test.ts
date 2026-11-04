import { describe, it, expect } from 'vitest';
import { formatTierRange, formatReportDate } from '../report-utils';

describe('formatTierRange', () => {
  it('prints both bounds', () => {
    expect(formatTierRange(4.3, 4.5)).toBe('4.30 - 4.50');
  });

  it('prints an open upper bound as >= (ASCII: the PDF font is WinAnsi-only)', () => {
    expect(formatTierRange(28, null)).toBe('>= 28.00');
  });

  it('prints an open lower bound as <=', () => {
    expect(formatTierRange(null, 4.6)).toBe('<= 4.60');
  });

  it('prints a dash when both bounds are open', () => {
    expect(formatTierRange(null, null)).toBe('-');
    expect(formatTierRange(undefined, undefined)).toBe('-');
  });

  it('keeps stored sentinel-looking bounds as real values', () => {
    expect(formatTierRange(0, 4.099)).toBe('0.00 - 4.10');
    expect(formatTierRange(4.751, 10)).toBe('4.75 - 10.00');
  });
});

describe('formatReportDate', () => {
  const d = '2026-11-01T02:30:00.000Z'; // Oct 31, 9:30 PM in Chicago

  it('prints a short date in the given time zone', () => {
    expect(formatReportDate(d, 'America/Chicago')).toBe('Oct 31, 2026');
    expect(formatReportDate(d, 'UTC')).toBe('Nov 1, 2026');
  });

  it('adds h:mm AM/PM with plain ASCII spaces (the PDF font is WinAnsi-only)', () => {
    const s = formatReportDate(d, 'America/Chicago', true);
    expect(s).toBe('Oct 31, 2026, 9:30 PM');
    expect(/^[\x20-\x7e]*$/.test(s)).toBe(true);
  });
});
