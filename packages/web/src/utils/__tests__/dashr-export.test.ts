import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  DASHR_COLUMNS,
  buildDashrXlsxBuffer,
  sanitizeDashrFilename,
} from '../dashr-export';

async function parseWorkbook(buffer: Uint8Array | ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const ws = wb.worksheets[0];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, row => {
    const cells: string[] = [];
    for (let i = 1; i <= DASHR_COLUMNS.length; i++) {
      const v = row.getCell(i).value;
      cells.push(v == null ? '' : String(v));
    }
    rows.push(cells);
  });
  return { worksheet: ws, rows };
}

describe('DASHR_COLUMNS', () => {
  it('has exactly 22 columns in Dashr template order', () => {
    expect(DASHR_COLUMNS).toHaveLength(22);
    expect(DASHR_COLUMNS[0]).toBe('First Name (Required)');
    expect(DASHR_COLUMNS[1]).toBe('Middle Name');
    expect(DASHR_COLUMNS[2]).toBe('Last Name (Required)');
    expect(DASHR_COLUMNS[21]).toBe('Custom Field 4');
  });
});

describe('buildDashrXlsxBuffer', () => {
  it('emits a single worksheet named "Athletes"', async () => {
    const buf = await buildDashrXlsxBuffer([]);
    const { worksheet } = await parseWorkbook(buf);
    expect(worksheet.name).toBe('Athletes');
  });

  it('produces header row only for empty athlete list', async () => {
    const buf = await buildDashrXlsxBuffer([]);
    const { rows } = await parseWorkbook(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([...DASHR_COLUMNS]);
  });

  it('populates First Name (col 1) and Last Name (col 3) only; other 20 cols blank', async () => {
    const buf = await buildDashrXlsxBuffer([
      { firstName: 'Jonathan', lastName: 'Sherman' },
    ]);
    const { rows } = await parseWorkbook(buf);
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('Jonathan');
    expect(rows[1][1]).toBe('');
    expect(rows[1][2]).toBe('Sherman');
    for (let i = 3; i < 22; i++) {
      expect(rows[1][i]).toBe('');
    }
  });

  it('emits one data row per athlete in input order', async () => {
    const buf = await buildDashrXlsxBuffer([
      { firstName: 'Jonathan', lastName: 'Sherman' },
      { firstName: 'Test', lastName: 'Athlete' },
      { firstName: 'Jane', lastName: 'Doe' },
    ]);
    const { rows } = await parseWorkbook(buf);
    expect(rows).toHaveLength(4);
    expect(rows[1][0]).toBe('Jonathan');
    expect(rows[2][0]).toBe('Test');
    expect(rows[3][0]).toBe('Jane');
  });

  it('passes names with leading =/+/-/@ through unchanged (XLSX stores them as shared strings, not formulas)', async () => {
    const buf = await buildDashrXlsxBuffer([
      { firstName: '=1+1', lastName: '@cmd' },
    ]);
    const { rows } = await parseWorkbook(buf);
    expect(rows[1][0]).toBe('=1+1');
    expect(rows[1][2]).toBe('@cmd');
  });

  it('emits blank cells for empty first/last name strings', async () => {
    const buf = await buildDashrXlsxBuffer([
      { firstName: '', lastName: '' },
    ]);
    const { rows } = await parseWorkbook(buf);
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('');
    expect(rows[1][2]).toBe('');
  });

  it('preserves names containing commas without CSV quoting artifacts', async () => {
    const buf = await buildDashrXlsxBuffer([
      { firstName: 'Smith, Jr.', lastName: 'Doe' },
    ]);
    const { rows } = await parseWorkbook(buf);
    expect(rows[1][0]).toBe('Smith, Jr.');
    expect(rows[1][2]).toBe('Doe');
  });

  it('bolds the header row', async () => {
    const buf = await buildDashrXlsxBuffer([]);
    const { worksheet } = await parseWorkbook(buf);
    expect(worksheet.getRow(1).font?.bold).toBe(true);
  });
});

describe('sanitizeDashrFilename', () => {
  it('lowercases and replaces unsafe characters with hyphens, emits .xlsx', () => {
    expect(sanitizeDashrFilename('Varsity Soccer 2025')).toBe('dashr-varsity-soccer-2025.xlsx');
  });

  it('strips leading and trailing separators', () => {
    expect(sanitizeDashrFilename('  !!team!!  ')).toBe('dashr-team.xlsx');
  });

  it('falls back to a default stem when input is empty or all-unsafe', () => {
    expect(sanitizeDashrFilename('')).toBe('dashr-athletes.xlsx');
    expect(sanitizeDashrFilename('///')).toBe('dashr-athletes.xlsx');
  });

  it('preserves hyphens, underscores, and digits', () => {
    expect(sanitizeDashrFilename('U14_boys-A')).toBe('dashr-u14_boys-a.xlsx');
  });
});
