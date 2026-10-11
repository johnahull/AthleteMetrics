/**
 * Recording sheet for an event: a CSV / XLSX table with one row per athlete of the data-entry
 * grid and one column per metric that can be typed. Generated and read in the browser only;
 * values from a filled sheet are planned by recording-sheet-import.ts and saved through the grid.
 */
import Papa from "papaparse";
import { format as formatDate } from "date-fns";
import { isMovementQualityMetric } from "@shared/peer-comparison-exclusions";
import { getEventMetricDisplay, type EventMetricWithSiteDetails } from "@/lib/event-metric-display";
import { toCalendarDate } from "@/utils/date-utils";

export const ATHLETE_ID_HEADER = "Athlete ID (do not edit)";
export const ATHLETE_NAME_HEADER = "Athlete";
export const MAX_SHEET_FILE_BYTES = 1024 * 1024;
export const MAX_SHEET_ROWS = 1000;
export const MAX_SHEET_COLUMNS = 200;
export const MAX_SHEET_ZIP_ENTRIES = 50;
export const MAX_SHEET_UNZIPPED_BYTES = 20 * 1024 * 1024;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface SheetMetric {
  code: string;
  label: string;
  unit?: string;
}

export interface RecordingSheet {
  eventId: string;
  eventName: string;
  /** yyyy-mm-dd */
  eventDate: string;
  metrics: SheetMetric[];
  athletes: Array<{ userId: string; name: string }>;
}

/** A cell read from an uploaded file: its text, or why it cannot be used (a date, a formula error) */
export type SheetCell = string | { error: string };

/** Why a metric gets no sheet column, or null when it can be typed on the sheet */
export function sheetExclusionReason(metric: EventMetricWithSiteDetails): string | null {
  if (isMovementQualityMetric(metric.metricCode)) return "entered in the Movement Quality panel";
  if (metric.metricDetails?.isDerived) return "calculated from other metrics";
  if (metric.metricDetails?.auxiliaryInputConfig) return "a paired-input metric and is not entered from a sheet";
  return null;
}

/** Event metrics without a sheet column, for the import's "column ignored" warnings */
export function sheetIgnoredMetrics(metrics: EventMetricWithSiteDetails[]) {
  return metrics.flatMap((m) => {
    const reason = sheetExclusionReason(m);
    return reason ? [{ code: m.metricCode, label: getEventMetricDisplay(m).label, reason }] : [];
  });
}

export function buildRecordingSheet(input: {
  event: { id: string; name: string; startDate: string | Date };
  metrics: EventMetricWithSiteDetails[];
  athletes: Array<{ userId: string; name: string }>;
}): RecordingSheet {
  const date = toCalendarDate(input.event.startDate);
  return {
    eventId: input.event.id,
    eventName: input.event.name,
    eventDate: date ? formatDate(date, "yyyy-MM-dd") : "",
    metrics: input.metrics
      .filter((m) => sheetExclusionReason(m) === null)
      .map((m) => {
        const { code, label, unit } = getEventMetricDisplay(m);
        return { code, label, unit };
      }),
    athletes: input.athletes,
  };
}

export function metricHeader(metric: SheetMetric): string {
  return `${metric.label}${metric.unit ? ` (${metric.unit})` : ""} [${metric.code}]`;
}

export function isAthleteIdHeader(cell: SheetCell | undefined): boolean {
  const text = cellText(cell).toLowerCase();
  return text === ATHLETE_ID_HEADER.toLowerCase() || text === "athlete id";
}

/** A cell's text, trimmed and in one Unicode form (NFC), so "é" typed either way compares equal */
export function cellText(cell: SheetCell | undefined): string {
  return typeof cell === "string" ? cell.normalize("NFC").trim() : "";
}

/** The sheet as rows of text, the same for CSV and XLSX */
export function recordingSheetTable(sheet: RecordingSheet): string[][] {
  return [
    ["Event", sheet.eventName],
    ["Date", sheet.eventDate],
    ["Event ID", sheet.eventId],
    [ATHLETE_ID_HEADER, ATHLETE_NAME_HEADER, ...sheet.metrics.map(metricHeader)],
    ...sheet.athletes.map((a) => [a.userId, a.name, ...sheet.metrics.map(() => "")]),
  ];
}

/** CSV with formula injection escaped (a leading ' on cells starting with = + - @ tab or CR) */
export function recordingSheetToCsv(sheet: RecordingSheet): string {
  return Papa.unparse(recordingSheetTable(sheet), { escapeFormulae: true });
}

/** XLSX with every cell written as text, so no cell can become a formula */
export async function recordingSheetToXlsx(sheet: RecordingSheet): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Recording sheet", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 4 }],
  });
  recordingSheetTable(sheet).forEach((row) => worksheet.addRow(row));
  worksheet.getRow(4).font = { bold: true };
  worksheet.getColumn(1).width = 38;
  worksheet.getColumn(2).width = 28;
  sheet.metrics.forEach((_, i) => {
    worksheet.getColumn(i + 3).width = 18;
  });
  for (let r = 5; r <= worksheet.rowCount; r++) {
    worksheet.getCell(r, 1).font = { color: { argb: "FF808080" } };
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export function recordingSheetFilename(sheet: RecordingSheet, ext: "csv" | "xlsx"): string {
  const slug =
    sheet.eventName
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .slice(0, 60)
      .replace(/^-+|-+$/g, "") || "event";
  return `recording-sheet-${slug}${sheet.eventDate ? `-${sheet.eventDate}` : ""}.${ext}`;
}

export async function downloadRecordingSheet(sheet: RecordingSheet, format: "csv" | "xlsx"): Promise<void> {
  // The BOM makes Excel read the CSV as UTF-8 (accented names)
  const blob =
    format === "csv"
      ? new Blob(["﻿" + recordingSheetToCsv(sheet)], { type: "text/csv;charset=utf-8" })
      : new Blob([await recordingSheetToXlsx(sheet)], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = recordingSheetFilename(sheet, format);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    // Some browsers start the download after click() returns; revoking at once can cancel it
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Checked before the file is read into memory */
export function checkSheetFile(file: { name: string; size: number }): string | null {
  if (!/\.(csv|xlsx)$/i.test(file.name)) return "Choose a .csv or .xlsx file (the recording sheet you downloaded).";
  if (file.size > MAX_SHEET_FILE_BYTES) return "The file is larger than 1 MB.";
  return null;
}

/** Row and column caps, checked after parsing */
export function checkSheetSize(rows: SheetCell[][]): string | null {
  if (rows.some((row) => row.length > MAX_SHEET_COLUMNS)) return `The sheet has more than ${MAX_SHEET_COLUMNS} columns.`;
  const header = rows.findIndex((row) => row.some(isAthleteIdHeader));
  const dataRows = rows.slice(header + 1).filter((row) => row.some((c) => typeof c !== "string" || c.trim() !== ""));
  if (dataRows.length > MAX_SHEET_ROWS) return `The sheet has more than ${MAX_SHEET_ROWS} rows of athletes.`;
  return null;
}

/** Rows of a CSV file; blank lines are kept so row numbers match the spreadsheet */
export function parseCsvSheet(text: string): SheetCell[][] {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: false });
  const quoteError = result.errors.find((e) => e.type === "Quotes");
  if (quoteError) throw new Error("A quoted value is not closed (a \" is missing).");
  const rows = result.data;
  const last = rows[rows.length - 1];
  if (last && last.length === 1 && last[0] === "") rows.pop(); // the file's final newline
  return rows;
}

function readXlsxValue(value: unknown): SheetCell {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return { error: "A date is not a result value" };
  if (typeof value !== "object") return String(value);
  const v = value as Record<string, any>;
  if ("formula" in v || "sharedFormula" in v) {
    return v.result === undefined || v.result === null
      ? { error: "Formula without a saved result (open and save the file in a spreadsheet app)" }
      : readXlsxValue(v.result);
  }
  if ("error" in v) return { error: `The cell shows an error (${v.error})` };
  if (Array.isArray(v.richText)) return v.richText.map((part: { text: string }) => part.text).join("");
  if ("text" in v) return String(v.text);
  return { error: "Unsupported cell content" };
}

/**
 * Refuse a zip (XLSX) with many parts or a large unpacked size before exceljs unpacks it.
 * shortcut: the sizes are the ones the zip declares (a crafted file can understate them); parsing
 * is client-side only, so a bomb can at worst hang this tab. Upgrade if sheets are ever parsed on the server.
 */
async function checkXlsxZip(data: ArrayBuffer): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data); // reads the central directory; nothing is unpacked yet
  const entries = Object.values(zip.files);
  if (entries.length > MAX_SHEET_ZIP_ENTRIES) {
    throw new Error(`The file has more than ${MAX_SHEET_ZIP_ENTRIES} parts; a recording sheet has far fewer.`);
  }
  // uncompressedSize is not in JSZip's typings, but every loaded entry has it (from the central directory);
  // private JSZip field; when upgrading jszip re-verify this field name or the guard becomes a no-op (the 20 MB zip-guard test catches a rename)
  const unpacked = entries.reduce(
    (sum, entry) => sum + ((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0),
    0,
  );
  // fail closed: a real workbook has more than 3 parts and unpacks to more than 0 bytes
  if (entries.length > 3 && unpacked === 0) {
    throw new Error("Could not check the size of this workbook (zip size check unavailable). Please export it again.");
  }
  if (unpacked > MAX_SHEET_UNZIPPED_BYTES) throw new Error("The file is larger than 20 MB when unpacked.");
}

/** Rows of the first worksheet of an XLSX file; a formula cell gives its saved result */
export async function parseXlsxSheet(data: ArrayBuffer): Promise<SheetCell[][]> {
  await checkXlsxZip(data);
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const worksheet = workbook.worksheets[0];
  const rows: SheetCell[][] = [];
  worksheet?.eachRow((row, rowNumber) => {
    const cells: SheetCell[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = readXlsxValue(cell.value);
    });
    rows[rowNumber - 1] = Array.from(cells, (c) => c ?? "");
  });
  return Array.from(rows, (row) => row ?? []);
}

/** Check, then read an uploaded sheet. Throws an Error with a message for the user. */
export async function readSheetFile(file: File): Promise<{ format: "csv" | "xlsx"; rows: SheetCell[][] }> {
  const problem = checkSheetFile(file);
  if (problem) throw new Error(problem);
  const format = /\.csv$/i.test(file.name) ? "csv" : "xlsx";
  try {
    const rows = format === "csv" ? parseCsvSheet(await file.text()) : await parseXlsxSheet(await file.arrayBuffer());
    return { format, rows };
  } catch (error) {
    throw new Error(`Could not read ${file.name}: ${error instanceof Error ? error.message : "not a valid file"}`);
  }
}
