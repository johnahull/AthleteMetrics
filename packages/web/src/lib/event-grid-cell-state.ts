export type CellState = "error" | "conflict" | "imported" | "dirty" | "saved" | "empty";

/**
 * Visual state of one grid cell: error > conflict (file value differs from the saved one,
 * not chosen yet) > imported (unsaved value from a file) > dirty > saved > empty.
 */
export function getCellState(cell: {
  error?: string;
  isDirty: boolean;
  originalValue?: number;
  importedValue?: string;
  fromImport?: boolean;
}): CellState {
  if (cell.error) return "error";
  if (cell.importedValue !== undefined) return "conflict";
  if (cell.isDirty) return cell.fromImport ? "imported" : "dirty";
  if (cell.originalValue !== undefined) return "saved";
  return "empty";
}

/**
 * The cell's typed (or accepted file) value can be saved now as an extra trial: it has a saved row,
 * a changed number, and no file value waiting for a choice. A cell with no saved row is left to Save.
 */
export function canAddTrial(cell: {
  value: string;
  isDirty: boolean;
  savedCount: number;
  importedValue?: string;
}): boolean {
  return (
    cell.savedCount >= 1 &&
    cell.isDirty &&
    cell.value !== "" &&
    !isNaN(Number(cell.value)) &&
    cell.importedValue === undefined
  );
}
