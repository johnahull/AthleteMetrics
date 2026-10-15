/**
 * One metric cell of the event data-entry grid: the value input, the add-trial button, the conflict
 * choice for a value from an uploaded sheet, the cell's server error and its saved-trial count.
 */
import type { InputHTMLAttributes } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordingSheetConflict } from "@/components/events/RecordingSheetConflict";
import { canAddTrial, getCellState, type CellState } from "@/lib/event-grid-cell-state";

export interface EventGridCellValue {
  value: string;
  originalValue?: number;
  savedCount: number;
  isDirty: boolean;
  error?: string;
  importedValue?: string;
  fromImport?: boolean;
}

const CELL_STATE_CLASSES: Record<CellState, string> = {
  error: "border-red-500 focus:ring-red-500",
  conflict: "border-2 border-orange-500 bg-orange-50",
  imported: "border-sky-500 bg-sky-50",
  dirty: "border-yellow-500 bg-yellow-50",
  saved: "bg-green-50",
  empty: "",
};

interface EventGridCellProps {
  cell: EventGridCellValue;
  /** `${userId}-${metricCode}`, for element ids */
  cellKey: string;
  metricLabel: string;
  athleteName: string;
  isRequired: boolean;
  /** A frozen event: nothing can be typed or saved */
  disabled: boolean;
  onChange: (value: string) => void;
  onResolve: (choice: "saved" | "file") => void;
  /** Save the value as a new trial now; left out for columns that get no add-trial button */
  onAddTrial?: () => void;
  /** Another save or a sheet read is running */
  addTrialDisabled?: boolean;
  /** Extra attributes for the input (keyboard navigation) */
  inputProps?: InputHTMLAttributes<HTMLInputElement> & Record<`data-${string}`, string | number>;
}

export function EventGridCell({
  cell,
  cellKey,
  metricLabel,
  athleteName,
  isRequired,
  disabled,
  onChange,
  onResolve,
  onAddTrial,
  addTrialDisabled,
  inputProps,
}: EventGridCellProps) {
  const errorId = `cell-error-${cellKey}`;
  const trialsId = `cell-trials-${cellKey}`;
  const inputId = `cell-input-${cellKey}`;
  const hasTrials = cell.savedCount > 1;
  const describedBy = [cell.error && errorId, hasTrials && trialsId].filter(Boolean).join(" ");
  const state = getCellState(cell);
  const showAddTrial = !!onAddTrial && !disabled;
  const addTrialVisible = showAddTrial && canAddTrial(cell);

  const input = (
    <Input
      {...inputProps}
      id={inputId}
      data-state={state}
      type="text"
      inputMode="decimal"
      value={cell.value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={`${metricLabel} for ${athleteName}`}
      aria-required={isRequired || undefined}
      aria-invalid={cell.error ? true : undefined}
      aria-describedby={describedBy || undefined}
      className={`h-9 px-1 text-center ${showAddTrial ? "min-w-0 flex-1" : ""} ${CELL_STATE_CLASSES[state]}`}
      placeholder="-"
    />
  );

  return (
    <>
      {showAddTrial ? (
        <div className="flex items-center gap-0.5">
          {input}
          {/* Space is kept while hidden so nothing shifts while typing; visibility:hidden also takes it out of the tab order */}
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-7 shrink-0 p-0"
            style={addTrialVisible ? undefined : { visibility: "hidden" }}
            disabled={addTrialDisabled}
            onClick={onAddTrial}
            aria-label={`Save ${cell.value} as a new ${metricLabel} trial for ${athleteName}`}
            title="Save as a new trial"
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      ) : (
        input
      )}
      {cell.importedValue !== undefined && (
        <RecordingSheetConflict
          metricLabel={metricLabel}
          athleteName={athleteName}
          savedValue={cell.value}
          fileValue={cell.importedValue}
          inputId={inputId}
          onResolve={onResolve}
        />
      )}
      {cell.error && (
        <div id={errorId} className="text-[11px] leading-tight text-red-500 text-center mt-1">
          {cell.error}
        </div>
      )}
      {hasTrials && (
        <div
          id={trialsId}
          title="Shows the newest trial. A new value is saved as another trial."
          className="text-[11px] leading-tight text-muted-foreground text-center mt-1"
        >
          {cell.savedCount} saved trials
        </div>
      )}
    </>
  );
}
