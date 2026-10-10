import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  ATHLETE_ID_HEADER,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_FILE_BYTES,
  MAX_SHEET_ROWS,
  buildRecordingSheet,
  checkSheetFile,
  checkSheetSize,
  metricHeader,
  parseCsvSheet,
  parseXlsxSheet,
  recordingSheetFilename,
  recordingSheetTable,
  recordingSheetToCsv,
  recordingSheetToXlsx,
  sheetExclusionReason,
  sheetIgnoredMetrics,
  type RecordingSheet,
} from '../recording-sheet';

const metric = (metricCode: string, details: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  metricCode,
  customLabel: null,
  metricDetails: { label: metricCode, unit: 's', category: 'speed', isDerived: false, auxiliaryInputConfig: null, ...details },
  ...extra,
});

const SHEET: RecordingSheet = {
  eventId: 'ev-1',
  eventName: 'Spring Screen',
  eventDate: '2026-03-10',
  metrics: [
    { code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in' },
    { code: 'FLY10_TIME', label: '10-Yard Fly', unit: 's' },
  ],
  athletes: [
    { userId: 'ath-1', name: 'Jordan Lee' },
    { userId: 'ath-2', name: 'Sam Park' },
  ],
};

describe('sheetExclusionReason', () => {
  it('keeps typed metrics', () => {
    expect(sheetExclusionReason(metric('FLY10_TIME'))).toBeNull();
    expect(sheetExclusionReason({ metricCode: 'FLY10_TIME', metricDetails: null })).toBeNull();
  });

  it('excludes derived, paired-input and Movement Quality metrics', () => {
    expect(sheetExclusionReason(metric('MOMENTUM', { isDerived: true }))).toMatch(/calculated/i);
    expect(sheetExclusionReason(metric('SQUAT_1RM', { auxiliaryInputConfig: { inputs: [] } }))).toMatch(/paired/i);
    expect(sheetExclusionReason(metric('MQ_JUMP'))).toMatch(/Movement Quality/);
    expect(sheetExclusionReason(metric('MQI_TOTAL'))).toMatch(/Movement Quality/);
  });
});

describe('sheetIgnoredMetrics', () => {
  it('lists the excluded metrics with their label and reason', () => {
    expect(sheetIgnoredMetrics([metric('FLY10_TIME'), metric('MOMENTUM', { label: 'Momentum', isDerived: true })])).toEqual([
      { code: 'MOMENTUM', label: 'Momentum', reason: 'calculated from other metrics' },
    ]);
  });
});

describe('buildRecordingSheet', () => {
  it('uses the event label and unit and only metrics that can be typed', () => {
    const sheet = buildRecordingSheet({
      event: { id: 'ev-1', name: 'Spring Screen', startDate: '2026-03-10T00:00:00.000Z' },
      metrics: [
        metric('VERTICAL_JUMP', { label: 'Vertical Jump', unit: 'in' }, { customLabel: 'CMJ' }),
        metric('MOMENTUM', { isDerived: true }),
        metric('MQ_JUMP'),
      ],
      athletes: SHEET.athletes,
    });
    expect(sheet).toEqual({
      eventId: 'ev-1',
      eventName: 'Spring Screen',
      eventDate: '2026-03-10',
      metrics: [{ code: 'VERTICAL_JUMP', label: 'CMJ', unit: 'in' }],
      athletes: SHEET.athletes,
    });
  });
});

describe('recordingSheetTable', () => {
  it('has three event rows, the table header and one blank row per athlete', () => {
    expect(recordingSheetTable(SHEET)).toEqual([
      ['Event', 'Spring Screen'],
      ['Date', '2026-03-10'],
      ['Event ID', 'ev-1'],
      [ATHLETE_ID_HEADER, 'Athlete', 'Vertical Jump (in) [VERTICAL_JUMP]', '10-Yard Fly (s) [FLY10_TIME]'],
      ['ath-1', 'Jordan Lee', '', ''],
      ['ath-2', 'Sam Park', '', ''],
    ]);
  });

  it('leaves the unit out of the header when the metric has none', () => {
    expect(metricHeader({ code: 'RSI', label: 'Reactive Strength Index' })).toBe('Reactive Strength Index [RSI]');
  });
});

describe('recordingSheetToCsv', () => {
  it('escapes names and the event name that a spreadsheet would run as a formula', () => {
    const csv = recordingSheetToCsv({
      ...SHEET,
      eventName: '=HYPERLINK("http://x")',
      athletes: [
        { userId: 'ath-1', name: '=cmd|calc' },
        { userId: 'ath-2', name: '+1' },
        { userId: 'ath-3', name: '@x' },
      ],
    });
    const rows = parseCsvSheet(csv);
    expect(rows[0][1]).toBe(`'=HYPERLINK("http://x")`);
    expect(rows.slice(4).map((r) => r[1])).toEqual([`'=cmd|calc`, `'+1`, `'@x`]);
  });

  it('round-trips through parseCsvSheet', () => {
    expect(parseCsvSheet(recordingSheetToCsv(SHEET))).toEqual(recordingSheetTable(SHEET));
  });
});

describe('parseCsvSheet', () => {
  it('strips a byte order mark and reads CRLF files', () => {
    expect(parseCsvSheet('﻿Event,Spring\r\nDate,2026-03-10\r\n')).toEqual([['Event', 'Spring'], ['Date', '2026-03-10']]);
  });

  it('refuses a file with an unclosed quote instead of merging rows', () => {
    expect(() => parseCsvSheet('a,"b\nc,d\n')).toThrow(/not closed/);
  });

  it('keeps blank lines so row numbers match the spreadsheet', () => {
    expect(parseCsvSheet('a\n\nb\n')).toEqual([['a'], [''], ['b']]);
  });
});

describe('recordingSheetToXlsx / parseXlsxSheet', () => {
  it('round-trips and writes names as text, never formulas', async () => {
    const buffer = await recordingSheetToXlsx({ ...SHEET, athletes: [{ userId: 'ath-1', name: '=1+1' }] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const cell = wb.worksheets[0].getCell('B5');
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe('=1+1');

    const rows = await parseXlsxSheet(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    expect(rows).toEqual(recordingSheetTable({ ...SHEET, athletes: [{ userId: 'ath-1', name: '=1+1' }] }));
  });

  it('bolds and freezes the table header', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await recordingSheetToXlsx(SHEET)) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getRow(4).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', xSplit: 2, ySplit: 4 });
  });

  it('reads numbers, numeric text, formula results, and flags dates and formulas without a result', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet');
    ws.addRow([4.52, '4.52', { formula: '4+0.5', result: 4.5 }, new Date(Date.UTC(2026, 2, 10)), { formula: 'A1*2' }]);
    ws.addRow([{ richText: [{ text: 'Jor' }, { text: 'dan' }] }, null, { error: '#DIV/0!' }]);
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    const rows = await parseXlsxSheet(buffer);
    expect(rows[0].slice(0, 3)).toEqual(['4.52', '4.52', '4.5']);
    expect(rows[0][3]).toEqual({ error: expect.stringMatching(/date/i) });
    expect(rows[0][4]).toEqual({ error: expect.stringMatching(/formula/i) });
    expect(rows[1][0]).toBe('Jordan');
    expect(rows[1][1]).toBe('');
    expect(rows[1][2]).toEqual({ error: expect.stringMatching(/#DIV\/0!/) });
  });

  it('reads the first worksheet only and keeps empty rows in place', async () => {
    const wb = new ExcelJS.Workbook();
    const first = wb.addWorksheet('First');
    first.getCell('A1').value = 'a';
    first.getCell('A3').value = 'c';
    wb.addWorksheet('Second').getCell('A1').value = 'other';
    const rows = await parseXlsxSheet((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(rows).toEqual([['a'], [], ['c']]);
  });
});

describe('checkSheetFile', () => {
  it.each(['sheet.csv', 'SHEET.XLSX'])('accepts %s', (name) => {
    expect(checkSheetFile({ name, size: 100 })).toBeNull();
  });

  it.each(['sheet.xlsm', 'sheet.xls', 'sheet.ods', 'sheet.txt', 'csv'])('rejects %s', (name) => {
    expect(checkSheetFile({ name, size: 100 })).toMatch(/\.csv or \.xlsx/);
  });

  it('rejects a file over 1 MB', () => {
    expect(checkSheetFile({ name: 'a.csv', size: MAX_SHEET_FILE_BYTES })).toBeNull();
    expect(checkSheetFile({ name: 'a.csv', size: MAX_SHEET_FILE_BYTES + 1 })).toMatch(/1 MB/);
  });
});

describe('checkSheetSize', () => {
  it('allows 1000 data rows after the header and rejects 1001', () => {
    const rows = (n: number) => [['Event', 'x'], [ATHLETE_ID_HEADER, 'Athlete'], ...Array.from({ length: n }, () => ['id', 'name'])];
    expect(checkSheetSize(rows(MAX_SHEET_ROWS))).toBeNull();
    expect(checkSheetSize(rows(MAX_SHEET_ROWS + 1))).toMatch(/1000 rows/);
  });

  it('rejects more than 200 columns', () => {
    expect(checkSheetSize([Array.from({ length: MAX_SHEET_COLUMNS }, () => 'x')])).toBeNull();
    expect(checkSheetSize([Array.from({ length: MAX_SHEET_COLUMNS + 1 }, () => 'x')])).toMatch(/200 columns/);
  });
});

describe('recordingSheetFilename', () => {
  it('slugs the event name and adds the date', () => {
    expect(recordingSheetFilename({ ...SHEET, eventName: 'Spring Screen #2!' }, 'xlsx')).toBe(
      'recording-sheet-spring-screen-2-2026-03-10.xlsx',
    );
    expect(recordingSheetFilename({ ...SHEET, eventName: '***' }, 'csv')).toBe('recording-sheet-event-2026-03-10.csv');
  });
});
