/**
 * Import plan for a filled recording sheet (pure): which grid cells get a file value, which
 * file values conflict with saved ones, and which rows, cells and columns are refused and why.
 * Nothing is saved here: the page applies the plan as unsaved cells and saves through the grid.
 */
import { validateMeasurementValue } from "@shared/measurement-value-validation";
import {
  ATHLETE_NAME_HEADER,
  cellText,
  checkSheetSize,
  isAthleteIdHeader,
  type SheetCell,
  type SheetMetric,
} from "@/lib/recording-sheet";

export interface SheetImportAthlete {
  userId: string;
  name: string;
  /** Saved value per metric code (the cell's newest saved row) */
  saved: Record<string, number | undefined>;
}

export interface PlannedCell {
  userId: string;
  metricCode: string;
  /** The file's text, trimmed */
  value: string;
  /** imported: no saved value; conflict: differs from the saved number; unchanged: same number */
  kind: "imported" | "conflict" | "unchanged";
  savedValue?: number;
}

export interface SheetImportPlan {
  /** The whole file was refused; nothing else is set */
  fileError?: string;
  cells: PlannedCell[];
  /** Spreadsheet row numbers (1-based) of rows of which nothing was loaded */
  rejections: Array<{ row: number; message: string }>;
  cellErrors: Array<{ row: number; userId: string; metricCode: string; raw: string; message: string }>;
  warnings: string[];
}

export const emptyImportPlan = (fileError?: string): SheetImportPlan => ({
  fileError,
  cells: [],
  rejections: [],
  cellErrors: [],
  warnings: [],
});

const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export function planSheetImport(input: {
  rows: SheetCell[][];
  format: "csv" | "xlsx";
  eventId: string;
  athletes: SheetImportAthlete[];
  metrics: SheetMetric[];
  /** Event metrics without a sheet column (derived, paired-input, Movement Quality) */
  ignoredMetrics: Array<{ code: string; label: string; reason: string }>;
}): SheetImportPlan {
  const { rows, metrics, ignoredMetrics } = input;
  // Our CSV export prefixes cells that look like formulas with one '
  const text = (cell: SheetCell | undefined) => {
    const t = cellText(cell);
    return input.format === "csv" && t.startsWith("'") ? t.slice(1).trim() : t;
  };

  const sizeError = checkSheetSize(rows);
  if (sizeError) return emptyImportPlan(sizeError);

  const headerIndex = rows.findIndex((row) => row.some(isAthleteIdHeader));
  if (headerIndex === -1) {
    return emptyImportPlan('Could not find the table header: a column named "Athlete ID (do not edit)".');
  }
  const eventIdRow = rows.slice(0, headerIndex).find((row) => text(row[0]).toLowerCase() === "event id");
  const fileEventId = eventIdRow ? text(eventIdRow[1]) : "";
  if (fileEventId && fileEventId !== input.eventId) {
    return emptyImportPlan(
      `This sheet is for a different event (event id ${fileEventId}). Download the recording sheet of this event.`,
    );
  }

  const header = rows[headerIndex];
  const idCol = header.findIndex(isAthleteIdHeader);
  const nameCol = header.findIndex((c) => text(c).toLowerCase() === ATHLETE_NAME_HEADER.toLowerCase());
  if (nameCol === -1) return emptyImportPlan('The sheet has no "Athlete" column (athlete names).');

  // Columns: [CODE] in brackets first, else an exact label or "Label (unit)" match
  const warnings: string[] = [];
  const columns: Array<{ col: number; metric: SheetMetric }> = [];
  header.forEach((cell, col) => {
    const title = text(cell);
    if (col === idCol || col === nameCol || title === "") return;
    const code = /\[([^\]]+)\]\s*$/.exec(title)?.[1].trim().toUpperCase();
    const matches = <T extends { code: string; label: string; unit?: string }>(list: T[]) =>
      code
        ? list.filter((m) => m.code.toUpperCase() === code)
        : list.filter((m) =>
            [m.label, m.unit ? `${m.label} (${m.unit})` : m.label].some((l) => l.toLowerCase() === title.toLowerCase()),
          );
    const found = matches(metrics);
    const ignored = matches(ignoredMetrics);
    if (found.length > 1) {
      warnings.push(`Column "${title}" was ignored: more than one metric has this label; add its [CODE].`);
    } else if (found.length === 1) {
      const earlier = columns.find((c) => c.metric.code === found[0].code);
      if (earlier) warnings.push(`Column "${title}" was ignored: an earlier column is already ${found[0].label}.`);
      else columns.push({ col, metric: found[0] });
    } else if (ignored.length > 0) {
      warnings.push(`Column "${title}" was ignored: ${ignored[0].label} is ${ignored[0].reason}.`);
    } else {
      warnings.push(`Column "${title}" is not a metric of this event and was ignored.`);
    }
  });

  const athletes = new Map(input.athletes.map((a) => [a.userId, a]));
  const dataRows = rows
    .map((row, i) => ({ row, number: i + 1 }))
    .slice(headerIndex + 1)
    .filter(({ row }) => row.some((c) => typeof c !== "string" || c.trim() !== ""));
  const rowsById = new Map<string, number[]>();
  dataRows.forEach(({ row, number }) => {
    const id = text(row[idCol]);
    if (id) rowsById.set(id, [...(rowsById.get(id) ?? []), number]);
  });

  const plan: SheetImportPlan = { cells: [], rejections: [], cellErrors: [], warnings };
  dataRows.forEach(({ row, number }) => {
    const reject = (message: string) => plan.rejections.push({ row: number, message });
    const id = text(row[idCol]);
    const name = text(row[nameCol]);
    if (!id) return reject(`${name || "This row"} has no athlete id.`);
    const athlete = athletes.get(id);
    if (!athlete) {
      return reject(
        `${name || id} is not on this event (only approved, checked-in or completed athletes can have results entered).`,
      );
    }
    const sameId = rowsById.get(id)!;
    if (sameId.length > 1) {
      return reject(`${athlete.name} appears more than once (rows ${sameId.join(", ")}); none of these rows were loaded.`);
    }
    if (normalizeName(name) !== normalizeName(athlete.name)) {
      return reject(`The name "${name}" does not match the athlete id (${athlete.name}).`);
    }

    columns.forEach(({ col, metric }) => {
      const cell = row[col];
      const cellError = (raw: string, message: string) =>
        plan.cellErrors.push({ row: number, userId: id, metricCode: metric.code, raw, message });
      if (typeof cell === "object") return cellError("", cell.error);
      const raw = cellText(cell);
      if (raw === "" || raw === "-") return; // no value: never clears a saved one
      if (raw.includes(",")) return cellError(raw, "Use a dot for decimals and no thousands separators (for example 4.52).");
      const invalid = validateMeasurementValue(raw, undefined, metric.code);
      if (invalid) return cellError(raw, invalid);

      const savedValue = athlete.saved[metric.code];
      if (savedValue === undefined) {
        plan.cells.push({ userId: id, metricCode: metric.code, value: raw, kind: "imported" });
      } else {
        const kind = Number(raw) === savedValue ? "unchanged" : "conflict";
        plan.cells.push({ userId: id, metricCode: metric.code, value: raw, kind, savedValue });
      }
    });
  });
  return plan;
}

/** The grid cell fields an import reads and writes */
export interface ImportableCell {
  value: string;
  isDirty: boolean;
  originalValue?: number;
  error?: string;
  /** File value waiting for "Keep saved" / "Use file value"; the cell shows the saved value meanwhile */
  importedValue?: string;
  /** The unsaved value came from a file */
  fromImport?: boolean;
}

/** Imported values become unsaved cells; conflicts keep the saved value with the file value pending */
export function applyImportPlan<C extends ImportableCell, R extends { measurements: Record<string, C> }>(
  grid: Record<string, R>,
  plan: SheetImportPlan,
): Record<string, R> {
  const next = { ...grid };
  plan.cells.forEach(({ userId, metricCode, value, kind }) => {
    const row = next[userId];
    const cell = row?.measurements[metricCode];
    if (!cell || kind === "unchanged") return;
    const patch: Partial<ImportableCell> =
      kind === "imported" ? { value, isDirty: true, fromImport: true, error: undefined } : { importedValue: value };
    next[userId] = { ...row, measurements: { ...row.measurements, [metricCode]: { ...cell, ...patch } } };
  });
  return next;
}

export function resolveConflict<C extends ImportableCell>(cell: C, choice: "saved" | "file"): C {
  if (cell.importedValue === undefined) return cell;
  if (choice === "saved") return { ...cell, importedValue: undefined };
  return { ...cell, value: cell.importedValue, importedValue: undefined, isDirty: true, fromImport: true, error: undefined };
}

/** Undo an import on one cell: back to the saved value. Typed edits stay. */
export function discardImport<C extends ImportableCell>(cell: C): C {
  if (cell.importedValue !== undefined) return { ...cell, importedValue: undefined };
  if (cell.fromImport && cell.isDirty) {
    return { ...cell, value: cell.originalValue?.toString() || "", isDirty: false, fromImport: false, error: undefined };
  }
  return cell;
}
