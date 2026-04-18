import { describe, it, expect } from 'vitest';
import {
  DASHR_COLUMNS,
  buildDashrCsv,
  sanitizeDashrFilename,
} from '../dashr-export';

describe('DASHR_COLUMNS', () => {
  it('has exactly 22 columns in Dashr template order', () => {
    expect(DASHR_COLUMNS).toHaveLength(22);
    expect(DASHR_COLUMNS[0]).toBe('First Name (Required)');
    expect(DASHR_COLUMNS[1]).toBe('Middle Name');
    expect(DASHR_COLUMNS[2]).toBe('Last Name (Required)');
    expect(DASHR_COLUMNS[21]).toBe('Custom Field 4');
  });
});

describe('buildDashrCsv', () => {
  it('returns header-only output for empty athlete list', () => {
    const csv = buildDashrCsv([]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0].split(',')).toHaveLength(22);
    expect(lines[0].startsWith('First Name (Required),Middle Name,Last Name (Required)')).toBe(true);
  });

  it('populates First Name (col 0) and Last Name (col 2) only; other 20 cols blank', () => {
    const csv = buildDashrCsv([{ firstName: 'Jonathan', lastName: 'Sherman' }]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);

    const cells = lines[1].split(',');
    expect(cells).toHaveLength(22);
    expect(cells[0]).toBe('Jonathan');
    expect(cells[1]).toBe('');
    expect(cells[2]).toBe('Sherman');
    for (let i = 3; i < 22; i++) {
      expect(cells[i]).toBe('');
    }
  });

  it('emits one data row per athlete', () => {
    const csv = buildDashrCsv([
      { firstName: 'Jonathan', lastName: 'Sherman' },
      { firstName: 'Test', lastName: 'Athlete' },
      { firstName: 'Jane', lastName: 'Doe' },
    ]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1].split(',')[0]).toBe('Jonathan');
    expect(lines[2].split(',')[0]).toBe('Test');
    expect(lines[3].split(',')[0]).toBe('Jane');
  });

  it('sanitizes formula-injection attempts in names', () => {
    const csv = buildDashrCsv([{ firstName: '=1+1', lastName: '@cmd' }]);
    const dataRow = csv.split('\n')[1];
    expect(dataRow).not.toMatch(/^=1\+1/);
    expect(dataRow).toContain("'=1+1");
    expect(dataRow).toContain("'@cmd");
  });

  it('quotes names containing commas', () => {
    const csv = buildDashrCsv([{ firstName: 'Smith, Jr.', lastName: 'Doe' }]);
    const dataRow = csv.split('\n')[1];
    expect(dataRow).toContain('"Smith, Jr."');
    expect(dataRow.split(',').length).toBeGreaterThan(22);
  });
});

describe('sanitizeDashrFilename', () => {
  it('lowercases and replaces unsafe characters with hyphens', () => {
    expect(sanitizeDashrFilename('Varsity Soccer 2025')).toBe('dashr-varsity-soccer-2025.csv');
  });

  it('strips leading and trailing separators', () => {
    expect(sanitizeDashrFilename('  !!team!!  ')).toBe('dashr-team.csv');
  });

  it('falls back to a default stem when input is empty or all-unsafe', () => {
    expect(sanitizeDashrFilename('')).toBe('dashr-athletes.csv');
    expect(sanitizeDashrFilename('///')).toBe('dashr-athletes.csv');
  });

  it('preserves hyphens, underscores, and digits', () => {
    expect(sanitizeDashrFilename('U14_boys-A')).toBe('dashr-u14_boys-a.csv');
  });
});
