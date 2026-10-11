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
