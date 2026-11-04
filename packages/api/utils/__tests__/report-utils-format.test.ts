import { describe, it, expect } from 'vitest';
import { tierLegendRows, formatReportDate } from '../report-utils';

describe('tierLegendRows', () => {
  // HS boys 40yd as evaluateTierBenchmark now emits it (cutoffs turned into bands)
  const dash40 = [
    { tierName: 'Elite', tierOrder: 1, minValue: null, maxValue: 4.6 },
    { tierName: 'Excellent', tierOrder: 2, minValue: 4.6, maxValue: 4.8 },
    { tierName: 'Below Average', tierOrder: 3, minValue: 4.8, maxValue: null },
  ];

  it('prints the same boundaries as the web labels, in ASCII (the PDF font is WinAnsi-only)', () => {
    expect(tierLegendRows(dash40, 's')).toEqual([
      ['#1', 'Elite', '<= 4.60 s'],
      ['#2', 'Excellent', '4.60 - 4.80 s'],
      ['#3', 'Below Average', '> 4.80 s'],
    ]);
  });

  it('prints >= for an open-top best tier', () => {
    const vj = [
      { tierName: 'Elite', tierOrder: 1, minValue: 28, maxValue: null },
      { tierName: 'JV', tierOrder: 2, minValue: null, maxValue: 28 },
    ];
    expect(tierLegendRows(vj, 'in').map((r) => r[2])).toEqual(['>= 28.00 in', '< 28.00 in']);
  });

  it('prints a dash for tiers with no bounds (old snapshots)', () => {
    expect(tierLegendRows([{ tierName: 'Elite', tierOrder: 1, minValue: null, maxValue: null }])[0][2]).toBe('-');
  });

  it('prints m:ss for duration metrics', () => {
    const format = { unit: 's', displayFormat: 'duration' as const, decimalPrecision: 0 };
    const rows = tierLegendRows([{ tierName: 'Elite', tierOrder: 1, minValue: null, maxValue: 300 }], 's', format);
    expect(rows[0][2]).toBe('<= 5:00');
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
