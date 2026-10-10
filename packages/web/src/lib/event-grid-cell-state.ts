export type CellState = "error" | "dirty" | "saved" | "empty";

/** Visual state of one grid cell: an error wins over unsaved, unsaved over saved. */
export function getCellState(cell: { error?: string; isDirty: boolean; originalValue?: number }): CellState {
  if (cell.error) return "error";
  if (cell.isDirty) return "dirty";
  if (cell.originalValue !== undefined) return "saved";
  return "empty";
}
