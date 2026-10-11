import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import {
  ATHLETE_ID_HEADER,
  buildRecordingSheet,
  sheetIgnoredMetrics,
  sheetMqMetrics,
  parseCsvSheet,
  parseXlsxSheet,
  recordingSheetToCsv,
  recordingSheetToXlsx,
  type SheetCell,
  type SheetMetric,
} from '../recording-sheet';
import {
  applyImportPlan,
  discardImport,
  planSheetImport,
  resolveConflict,
  type SheetImportAthlete,
} from '../recording-sheet-import';

const METRICS: SheetMetric[] = [
  { code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in' },
  { code: 'FLY10_TIME', label: '10-Yard Fly', unit: 's' },
];
const HEADER = [ATHLETE_ID_HEADER, 'Athlete', 'Vertical Jump (in) [VERTICAL_JUMP]', '10-Yard Fly (s) [FLY10_TIME]'];
const ID_ROW = ['Event ID', 'ev-1'];
const TOP = [['Event', 'Spring Screen'], ['Date', '2026-03-10'], ID_ROW];

const athletes = (saved: Record<string, Record<string, number>> = {}): SheetImportAthlete[] => [
  { userId: 'ath-1', name: 'Jordan Lee', saved: saved['ath-1'] ?? {} },
  { userId: 'ath-2', name: 'Sam Park', saved: saved['ath-2'] ?? {} },
];

const planRows = (rows: SheetCell[][], opts: Partial<Parameters<typeof planSheetImport>[0]> = {}) =>
  planSheetImport({
    rows,
    format: 'csv',
    eventId: 'ev-1',
    athletes: athletes(),
    metrics: METRICS,
    ignoredMetrics: [],
    ...opts,
  });
/** A sheet of this event: the Event ID row (row 1), then the given rows */
const plan = (rows: SheetCell[][], opts: Partial<Parameters<typeof planSheetImport>[0]> = {}) => planRows([ID_ROW, ...rows], opts);
const NO_EVENT_ID = 'This sheet has no Event ID row, so it cannot be checked against this event. Download a fresh sheet for this event.';

describe('planSheetImport', () => {
  it('imports values into empty cells and skips blank and "-" cells', () => {
    const result = planRows([...TOP, HEADER, ['ath-1', 'Jordan Lee', ' 30.5 ', '-'], ['ath-2', 'Sam Park', '', '1.62']]);
    expect(result.fileError).toBeUndefined();
    expect(result.rejections).toEqual([]);
    expect(result.cells).toEqual([
      { userId: 'ath-1', metricCode: 'VERTICAL_JUMP', value: '30.5', kind: 'imported' },
      { userId: 'ath-2', metricCode: 'FLY10_TIME', value: '1.62', kind: 'imported' },
    ]);
  });

  it('flags a value that differs from the saved one as a conflict; an equal number is unchanged', () => {
    const result = plan([HEADER, ['ath-1', 'Jordan Lee', '30.50', '1.70']], {
      athletes: athletes({ 'ath-1': { VERTICAL_JUMP: 30.5, FLY10_TIME: 1.65 } }),
    });
    expect(result.cells).toEqual([
      { userId: 'ath-1', metricCode: 'VERTICAL_JUMP', value: '30.50', kind: 'unchanged', savedValue: 30.5 },
      { userId: 'ath-1', metricCode: 'FLY10_TIME', value: '1.70', kind: 'conflict', savedValue: 1.65 },
    ]);
  });

  it('matches columns by [CODE] even when the label was edited, then by exact label', () => {
    const result = plan([
      [ATHLETE_ID_HEADER, 'Athlete', 'my jump [VERTICAL_JUMP]', '10-yard fly'],
      ['ath-1', 'Jordan Lee', '30', '1.6'],
    ]);
    expect(result.cells.map((c) => c.metricCode)).toEqual(['VERTICAL_JUMP', 'FLY10_TIME']);
    expect(result.warnings).toEqual([]);
  });

  it('matches a "Label (unit)" header without the code', () => {
    const result = plan([[ATHLETE_ID_HEADER, 'Athlete', 'Vertical Jump (in)'], ['ath-1', 'Jordan Lee', '30']]);
    expect(result.cells).toHaveLength(1);
  });

  it('ignores unknown columns and columns of metrics that are not typed, with a warning', () => {
    const result = plan(
      [
        [ATHLETE_ID_HEADER, 'Athlete', 'Notes', 'Momentum [MOMENTUM]', 'Jump [MQ_JUMP]', 'Vertical Jump [VERTICAL_JUMP]'],
        ['ath-1', 'Jordan Lee', 'fast', '500', '2', '30'],
      ],
      {
        ignoredMetrics: [
          { code: 'MOMENTUM', label: 'Momentum', reason: 'calculated from other metrics' },
          { code: 'MQ_JUMP', label: 'Jump', reason: 'a test reason' },
        ],
      },
    );
    expect(result.cells).toEqual([{ userId: 'ath-1', metricCode: 'VERTICAL_JUMP', value: '30', kind: 'imported' }]);
    expect(result.warnings).toEqual([
      'Column "Notes" is not a metric of this event and was ignored.',
      'Column "Momentum [MOMENTUM]" was ignored: Momentum is calculated from other metrics.',
      'Column "Jump [MQ_JUMP]" was ignored: Jump is a test reason.',
    ]);
  });

  it('ignores a second column for the same metric', () => {
    const result = plan([
      [ATHLETE_ID_HEADER, 'Athlete', 'Vertical Jump [VERTICAL_JUMP]', 'Again [VERTICAL_JUMP]'],
      ['ath-1', 'Jordan Lee', '30', '31'],
    ]);
    expect(result.cells.map((c) => c.value)).toEqual(['30']);
    expect(result.warnings[0]).toMatch(/Again \[VERTICAL_JUMP\].*ignored/);
  });

  it('rejects the whole file when its event id is another event', () => {
    const result = planRows([['Event ID', 'ev-2'], HEADER, ['ath-1', 'Jordan Lee', '30', '']]);
    expect(result.fileError).toMatch(/different event/i);
    expect(result.cells).toEqual([]);
  });

  it('rejects the whole file when it has no Event ID row', () => {
    const result = planRows([HEADER, ['ath-1', 'Jordan Lee', '30', '']]);
    expect(result.fileError).toBe(NO_EVENT_ID);
    expect(result.cells).toEqual([]);
  });

  it('rejects the whole file when its Event ID is blank', () => {
    expect(planRows([['Event ID', '   '], HEADER, ['ath-1', 'Jordan Lee', '30', '']]).fileError).toBe(NO_EVENT_ID);
    expect(planRows([['Event ID'], HEADER, ['ath-1', 'Jordan Lee', '30', '']]).fileError).toBe(NO_EVENT_ID);
  });

  it('rejects the whole file when the Event ID label was renamed', () => {
    expect(planRows([['Event identifier', 'ev-1'], HEADER, ['ath-1', 'Jordan Lee', '30', '']]).fileError).toBe(NO_EVENT_ID);
  });

  it('compares the event id ignoring case and surrounding spaces', () => {
    const result = planRows([[' event id ', '  EV-1 '], HEADER, ['ath-1', 'Jordan Lee', '30', '']]);
    expect(result.fileError).toBeUndefined();
    expect(result.cells).toHaveLength(1);
  });

  it('rejects a file without the athlete id or athlete name column', () => {
    expect(plan([['Athlete', 'Vertical Jump [VERTICAL_JUMP]']]).fileError).toMatch(/Athlete ID/);
    expect(plan([[ATHLETE_ID_HEADER, 'Vertical Jump [VERTICAL_JUMP]']]).fileError).toMatch(/"Athlete" column/);
  });

  it('names the missing header, not the row count, for a long file of another format', () => {
    const rows = Array.from({ length: 1500 }, () => ['a', 'b']);
    expect(plan(rows).fileError).toMatch(/Could not find the table header/);
  });

  it('rejects a file with more than 1000 rows', () => {
    const rows = [HEADER, ...Array.from({ length: 1001 }, () => ['ath-1', 'Jordan Lee', '', ''])];
    expect(plan(rows).fileError).toMatch(/1000 rows/);
  });

  it('rejects rows with a missing or unknown athlete id, and names that do not match the id', () => {
    const result = plan([
      HEADER,
      ['', 'Jordan Lee', '30', ''],
      ['ath-9', 'Pat Doe', '30', ''],
      ['ath-2', 'Jordan Lee', '30', ''],
      ['ath-1', ' jordan  LEE ', '30', ''],
    ]);
    expect(result.rejections).toEqual([
      { row: 3, message: expect.stringMatching(/no athlete id/i) },
      { row: 4, message: expect.stringMatching(/Pat Doe.*not on this event/) },
      { row: 5, message: expect.stringMatching(/"Jordan Lee" does not match.*Sam Park/) },
    ]);
    expect(result.cells).toEqual([{ userId: 'ath-1', metricCode: 'VERTICAL_JUMP', value: '30', kind: 'imported' }]);
  });

  it('rejects every row of an athlete that appears more than once', () => {
    const result = plan([HEADER, ['ath-1', 'Jordan Lee', '30', ''], ['ath-2', 'Sam Park', '28', ''], ['ath-1', 'Jordan Lee', '', '1.6']]);
    expect(result.rejections).toEqual([
      { row: 3, message: expect.stringMatching(/more than once \(rows 3, 5\)/) },
      { row: 5, message: expect.stringMatching(/more than once \(rows 3, 5\)/) },
    ]);
    expect(result.cells.map((c) => c.userId)).toEqual(['ath-2']);
  });

  it('strips the leading apostrophe of the CSV formula escape (before = + - @ tab or CR) only', () => {
    const result = plan([HEADER, ['ath-1', "'-Jordan Lee", '30', ''], ['ath-2', "'Ike Park", '31', '']], {
      athletes: [
        { userId: 'ath-1', name: '-Jordan Lee', saved: {} },
        { userId: 'ath-2', name: "'Ike Park", saved: {} },
      ],
    });
    expect(result.rejections).toEqual([]);
    expect(result.cells).toHaveLength(2);
    expect(plan([HEADER, ['ath-1', "'=Jordan", '30', '']], { athletes: [{ userId: 'ath-1', name: '=Jordan', saved: {} }] }).rejections).toEqual([]);
  });

  it('does not strip an apostrophe that is part of a name', () => {
    expect(plan([HEADER, ['ath-1', "'Jordan Lee", '30', '']]).rejections).toHaveLength(1);
  });

  it('matches names written with decomposed accents (NFD) to the same name (NFC)', () => {
    const result = plan([HEADER, ['ath-1', 'Jose\u0301 Pe\u0301rez', '30', '']], {
      athletes: [{ userId: 'ath-1', name: 'Jos\u00e9 P\u00e9rez', saved: {} }],
    });
    expect(result.rejections).toEqual([]);
    expect(result.cells).toHaveLength(1);
  });

  it('matches a metric header written with decomposed accents', () => {
    const result = plan([[ATHLETE_ID_HEADER, 'Athlete', 'Sa\u0301lto'], ['ath-1', 'Jordan Lee', '30']], {
      metrics: [{ code: 'JUMP_X', label: 'S\u00e1lto' }],
    });
    expect(result.warnings).toEqual([]);
    expect(result.cells).toHaveLength(1);
  });

  it('does not strip the apostrophe from XLSX names', () => {
    const result = plan([HEADER, ['ath-1', "'Jordan Lee", '30', '']], { format: 'xlsx' });
    expect(result.rejections).toHaveLength(1);
  });

  it('reports invalid values per cell: comma decimals, text, zero, negatives, date cells', () => {
    const result = plan([
      HEADER,
      ['ath-1', 'Jordan Lee', '1,200', 'DNF'],
      ['ath-2', 'Sam Park', '0', { error: 'Dates are not accepted' }],
    ]);
    expect(result.cells).toEqual([]);
    expect(result.cellErrors).toEqual([
      { row: 3, userId: 'ath-1', metricCode: 'VERTICAL_JUMP', raw: '1,200', message: expect.stringMatching(/dot for decimals/i) },
      { row: 3, userId: 'ath-1', metricCode: 'FLY10_TIME', raw: 'DNF', message: 'Value must be a finite number' },
      { row: 4, userId: 'ath-2', metricCode: 'VERTICAL_JUMP', raw: '0', message: 'Value must be positive' },
      { row: 4, userId: 'ath-2', metricCode: 'FLY10_TIME', raw: '', message: 'Dates are not accepted' },
    ]);
  });

  it('skips blank rows and does not change its inputs', () => {
    const rows = [HEADER, [], ['', '', ''], ['ath-1', 'Jordan Lee', '30', '']];
    const before = JSON.stringify(rows);
    expect(plan(rows).cells).toHaveLength(1);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe('round trip: generate, fill, read back, plan', () => {
  const sheet = buildRecordingSheet({
    event: { id: 'ev-1', name: '=Spring', startDate: '2026-03-10T00:00:00.000Z' },
    metrics: [
      { metricCode: 'VERTICAL_JUMP', metricDetails: { label: 'Vertical Jump', unit: 'in', category: null } },
      { metricCode: 'FLY10_TIME', metricDetails: { label: '10-Yard Fly', unit: 's', category: null } },
    ],
    athletes: [
      { userId: 'ath-1', name: 'Jordan Lee' },
      { userId: 'ath-2', name: '-Sam Park' },
    ],
  });
  const saved = [
    { userId: 'ath-1', name: 'Jordan Lee', saved: { FLY10_TIME: 1.65 } },
    { userId: 'ath-2', name: '-Sam Park', saved: {} },
  ];
  const expected = [
    { userId: 'ath-1', metricCode: 'VERTICAL_JUMP', value: '30.5', kind: 'imported' },
    { userId: 'ath-1', metricCode: 'FLY10_TIME', value: '1.7', kind: 'conflict', savedValue: 1.65 },
    { userId: 'ath-2', metricCode: 'FLY10_TIME', value: '1.62', kind: 'imported' },
  ];

  it('CSV', () => {
    const rows = parseCsvSheet(recordingSheetToCsv(sheet)) as string[][];
    rows[4][2] = '30.5';
    rows[4][3] = '1.7';
    rows[5][3] = '1.62';
    const filled = parseCsvSheet(Papa.unparse(rows));
    const result = planSheetImport({ rows: filled, format: 'csv', eventId: 'ev-1', athletes: saved, metrics: sheet.metrics, ignoredMetrics: [] });
    expect(result).toMatchObject({ rejections: [], cellErrors: [], warnings: [], cells: expected });
  });

  it('XLSX', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await recordingSheetToXlsx(sheet)) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    ws.getCell('C5').value = 30.5;
    ws.getCell('D5').value = { formula: '1.6+0.1', result: 1.7 } as ExcelJS.CellFormulaValue;
    ws.getCell('D6').value = '1.62';
    const rows = await parseXlsxSheet((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const result = planSheetImport({ rows, format: 'xlsx', eventId: 'ev-1', athletes: saved, metrics: sheet.metrics, ignoredMetrics: [] });
    expect(result).toMatchObject({ rejections: [], cellErrors: [], warnings: [], cells: expected });
  });
});

describe('applyImportPlan / resolveConflict / discardImport', () => {
  const cell = (extra: Record<string, unknown> = {}) => ({ value: '', isDirty: false, savedCount: 0, ...extra });
  const grid = () => ({
    'ath-1': { userId: 'ath-1', measurements: { VERTICAL_JUMP: cell(), FLY10_TIME: cell({ value: '1.65', originalValue: 1.65, savedCount: 1 }) } },
  });
  const importPlan = planSheetImport({
    rows: [ID_ROW, HEADER, ['ath-1', 'Jordan Lee', '30', '1.70']],
    format: 'csv',
    eventId: 'ev-1',
    athletes: athletes({ 'ath-1': { FLY10_TIME: 1.65 } }),
    metrics: METRICS,
    ignoredMetrics: [],
  });

  it('fills imported cells as unsaved and keeps the saved value of a conflict cell', () => {
    const before = grid();
    const { grid: next, skipped } = applyImportPlan(before, importPlan);
    expect(skipped).toEqual([]);
    expect(next['ath-1'].measurements.VERTICAL_JUMP).toMatchObject({ value: '30', isDirty: true, fromImport: true });
    expect(next['ath-1'].measurements.FLY10_TIME).toMatchObject({ value: '1.65', isDirty: false, importedValue: '1.70' });
    expect(before['ath-1'].measurements.VERTICAL_JUMP.value).toBe('');
  });

  it('skips cells typed in or already holding a file value since the file was chosen, and reports them', () => {
    const before = grid();
    before['ath-1'].measurements.VERTICAL_JUMP = cell({ value: '29', isDirty: true });
    before['ath-1'].measurements.FLY10_TIME = cell({ value: '1.65', originalValue: 1.65, savedCount: 1, importedValue: '1.80' });
    const { grid: next, skipped } = applyImportPlan(before, importPlan);
    expect(next['ath-1'].measurements.VERTICAL_JUMP).toEqual(cell({ value: '29', isDirty: true }));
    expect(next['ath-1'].measurements.FLY10_TIME).toMatchObject({ value: '1.65', importedValue: '1.80' });
    expect(skipped).toEqual([
      expect.objectContaining({ userId: 'ath-1', metricCode: 'VERTICAL_JUMP', value: '30' }),
      expect.objectContaining({ userId: 'ath-1', metricCode: 'FLY10_TIME', value: '1.70' }),
    ]);
  });

  it('keeps the saved value or uses the file value', () => {
    const conflict = applyImportPlan(grid(), importPlan).grid['ath-1'].measurements.FLY10_TIME;
    expect(resolveConflict(conflict, 'saved')).toMatchObject({ value: '1.65', isDirty: false, importedValue: undefined });
    expect(resolveConflict(conflict, 'file')).toMatchObject({ value: '1.70', isDirty: true, fromImport: true, importedValue: undefined });
  });

  it('discards file values back to the saved state, leaving typed edits alone', () => {
    const next = applyImportPlan(grid(), importPlan).grid;
    expect(discardImport(next['ath-1'].measurements.VERTICAL_JUMP)).toMatchObject({ value: '', isDirty: false, fromImport: false });
    expect(discardImport(next['ath-1'].measurements.FLY10_TIME)).toMatchObject({ value: '1.65', importedValue: undefined });
    const typed = cell({ value: '5', isDirty: true });
    expect(discardImport(typed)).toBe(typed);
  });
});

describe('round trip of a sheet with pre-printed saved values', () => {
  const withValues = buildRecordingSheet({
    event: { id: 'ev-1', name: 'Spring Screen', startDate: '2026-03-10T00:00:00.000Z' },
    metrics: [
      { metricCode: 'VERTICAL_JUMP', metricDetails: { label: 'Vertical Jump', unit: 'in', category: null } },
      { metricCode: 'FLY10_TIME', metricDetails: { label: '10-Yard Fly', unit: 's', category: null } },
    ],
    athletes: [
      { userId: 'ath-1', name: 'Jordan Lee', values: { VERTICAL_JUMP: '30.5', FLY10_TIME: '1.65' }, trials: { FLY10_TIME: 2 } },
      { userId: 'ath-2', name: 'Sam Park', values: { FLY10_TIME: '1.8' } },
    ],
  });
  const saved = [
    { userId: 'ath-1', name: 'Jordan Lee', saved: { VERTICAL_JUMP: 30.5, FLY10_TIME: 1.65 } },
    { userId: 'ath-2', name: 'Sam Park', saved: { FLY10_TIME: 1.8 } },
  ];
  const planOf = (rows: SheetCell[][], format: 'csv' | 'xlsx') =>
    planSheetImport({ rows, format, eventId: 'ev-1', athletes: saved, metrics: withValues.metrics, ignoredMetrics: [] });

  it('CSV uploaded untouched: every printed value is unchanged, nothing imported, no conflict', () => {
    const result = planOf(parseCsvSheet(recordingSheetToCsv(withValues)), 'csv');
    expect(result).toMatchObject({ rejections: [], cellErrors: [], warnings: [] });
    expect(result.cells.map((c) => c.kind)).toEqual(['unchanged', 'unchanged', 'unchanged']);
  });

  it('XLSX uploaded untouched: every printed value is unchanged', async () => {
    const bytes = await recordingSheetToXlsx(withValues);
    const rows = await parseXlsxSheet(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const result = planOf(rows, 'xlsx');
    expect(result).toMatchObject({ rejections: [], cellErrors: [], warnings: [] });
    expect(result.cells.map((c) => c.kind)).toEqual(['unchanged', 'unchanged', 'unchanged']);
  });

  it('an edited printed value is a conflict and a cleared one changes nothing', () => {
    const rows = parseCsvSheet(recordingSheetToCsv(withValues)) as string[][];
    expect(rows[3][0]).toBe('Note');
    rows[5][3] = '1.60'; // Jordan Lee, 10-Yard Fly
    rows[6][3] = ''; // Sam Park, 10-Yard Fly cleared
    const result = planOf(parseCsvSheet(Papa.unparse(rows)), 'csv');
    expect(result.cells).toEqual([
      { userId: 'ath-1', metricCode: 'VERTICAL_JUMP', value: '30.5', kind: 'unchanged', savedValue: 30.5 },
      { userId: 'ath-1', metricCode: 'FLY10_TIME', value: '1.60', kind: 'conflict', savedValue: 1.65 },
    ]);
  });
});

describe('Movement Quality columns', () => {
  const MQ = sheetMqMetrics(['MQ_DECEL']);
  const MQ_HEADER = [ATHLETE_ID_HEADER, 'Athlete', 'Deceleration (0-3) [MQ_DECEL]', 'Jump (0-3) [MQ_JUMP]'];
  const planMq = (cells: SheetCell[], saved: Record<string, number> = {}, extraHeader: string[] = [], extraIgnored = false) =>
    plan([[...MQ_HEADER, ...extraHeader], ['ath-1', 'Jordan Lee', ...cells]], {
      metrics: MQ,
      athletes: athletes({ 'ath-1': saved }),
      ignoredMetrics: extraIgnored
        ? sheetIgnoredMetrics([{ metricCode: 'MQI_TOTAL', metricDetails: { label: 'MQI', unit: 'score', category: null } }])
        : [],
    });

  it.each(['0', '1', '2', '3'])('accepts the score %s', (score) => {
    expect(planMq([score, '']).cells).toEqual([{ userId: 'ath-1', metricCode: 'MQ_DECEL', value: score, kind: 'imported' }]);
  });

  it.each([
    ['4', /at most 3/],
    ['1.5', /whole number/],
    ['-1', /at least 0/],
    ['3,0', /dot for decimals/],
  ])('refuses %s', (raw, message) => {
    const result = planMq([raw, '']);
    expect(result.cells).toEqual([]);
    expect(result.cellErrors).toEqual([expect.objectContaining({ metricCode: 'MQ_DECEL', raw, message: expect.stringMatching(message) })]);
  });

  it('a blank or "-" changes nothing', () => {
    expect(planMq(['', '-'], { MQ_DECEL: 2, MQ_JUMP: 1 }).cells).toEqual([]);
  });

  it('a saved 2 against a file 3 is a conflict; a file 2 against a saved 2 is unchanged; a saved 0 counts', () => {
    expect(planMq(['3', '2'], { MQ_DECEL: 2, MQ_JUMP: 2 }).cells).toEqual([
      { userId: 'ath-1', metricCode: 'MQ_DECEL', value: '3', kind: 'conflict', savedValue: 2 },
      { userId: 'ath-1', metricCode: 'MQ_JUMP', value: '2', kind: 'unchanged', savedValue: 2 },
    ]);
    expect(planMq(['1', ''], { MQ_DECEL: 0 }).cells).toEqual([
      { userId: 'ath-1', metricCode: 'MQ_DECEL', value: '1', kind: 'conflict', savedValue: 0 },
    ]);
  });

  it('ignores a column of MQI_TOTAL with a warning', () => {
    const result = planMq(['2', '', '14'], {}, ['MQI [MQI_TOTAL]'], true);
    expect(result.cells.map((c) => c.metricCode)).toEqual(['MQ_DECEL']);
    expect(result.warnings).toEqual(['Column "MQI [MQI_TOTAL]" was ignored: MQI is calculated from the Movement Quality scores.']);
  });
});
