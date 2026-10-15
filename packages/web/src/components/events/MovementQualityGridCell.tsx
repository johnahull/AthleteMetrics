/**
 * Movement Quality column of the event data-entry grid for one athlete: the button with the saved scores
 * (opens the panel) and, under it, the scores loaded from a recording sheet that are not saved yet:
 * new scores, conflicts with saved scores (choice per pattern or for all of this athlete) and server errors.
 */
import type { ButtonHTMLAttributes } from "react";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getCellState } from "@/lib/event-grid-cell-state";
import type { MqCell } from "@/lib/mq-sheet-cells";

interface MovementQualityGridCellProps {
  userId: string;
  athleteName: string;
  /** Saved scores only: "16 / 24", "3 of 8 scored" or "Not scored" */
  summary: string;
  /** This athlete's sheet cells, one per Movement Quality code */
  cells: MqCell[];
  /** Metric code -> pattern label */
  labels: Map<string, string>;
  disabled?: boolean;
  onOpen: () => void;
  onResolve: (metricCode: string, choice: "saved" | "file") => void;
  onResolveAll: (choice: "saved" | "file") => void;
  /** Drop this athlete's scores from the sheet (also ones the server refused), back to the saved scores */
  onDiscard: () => void;
  /** Extra attributes for the button (keyboard navigation) */
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string | number>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function MovementQualityGridCell({
  userId,
  athleteName,
  summary,
  cells,
  labels,
  disabled,
  onOpen,
  onResolve,
  onResolveAll,
  onDiscard,
  buttonProps,
}: MovementQualityGridCellProps) {
  const buttonId = `mq-button-${userId}`;
  const pendingId = `mq-pending-${userId}`;
  const errorsId = `mq-errors-${userId}`;
  const label = (code: string) => labels.get(code) ?? code;
  const byState = (state: string) => cells.filter((c) => getCellState(c) === state);
  const errors = byState("error");
  const conflicts = byState("conflict");
  const imported = byState("imported");
  const importedText = imported.length > 0 ? `${plural(imported.length, "score", "scores")} from sheet (unsaved)` : "";
  const conflictText = plural(conflicts.length, "conflict", "conflicts");
  const describedBy = [imported.length > 0 && pendingId, errors.length > 0 && errorsId].filter(Boolean).join(" ");

  // The trigger goes away with the last conflict: focus the athlete's button instead
  const resolved = (fn: () => void, last = true) => {
    fn();
    if (last) requestAnimationFrame(() => document.getElementById(buttonId)?.focus());
  };

  return (
    <>
      <Button
        {...buttonProps}
        id={buttonId}
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpen}
        disabled={disabled}
        aria-label={`Movement Quality for ${athleteName}`}
        aria-describedby={describedBy || undefined}
      >
        <Activity className="h-4 w-4 mr-2" />
        {summary}
      </Button>
      {imported.length > 0 && (
        <div id={pendingId} data-state="imported" className="mt-1 text-[11px] leading-tight text-sky-700">
          {importedText}
        </div>
      )}
      {conflicts.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="mt-1 min-h-6 w-full rounded text-[11px] leading-tight text-orange-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-orange-500"
              aria-label={`Movement Quality conflicts for ${athleteName}: ${[conflictText, importedText].filter(Boolean).join(", ")}`}
            >
              {conflictText}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3" align="center">
            <p className="text-sm font-medium">Movement Quality for {athleteName}</p>
            <ul className="space-y-2">
              {conflicts.map((c) => (
                <li key={c.metricCode} className="space-y-1">
                  <p className="text-sm">
                    {label(c.metricCode)}: saved <strong>{c.value}</strong>, file <strong>{c.importedValue}</strong>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Keep saved ${label(c.metricCode)}`}
                      onClick={() => resolved(() => onResolve(c.metricCode, "saved"), conflicts.length === 1)}
                    >
                      Keep saved
                    </Button>
                    <Button
                      size="sm"
                      aria-label={`Use file value for ${label(c.metricCode)}`}
                      onClick={() => resolved(() => onResolve(c.metricCode, "file"), conflicts.length === 1)}
                    >
                      Use file value
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 border-t pt-2">
              <Button
                size="sm"
                variant="outline"
                aria-label={`Keep all saved for ${athleteName}`}
                onClick={() => resolved(() => onResolveAll("saved"))}
              >
                Keep all
              </Button>
              <Button
                size="sm"
                aria-label={`Use all file values for ${athleteName}`}
                onClick={() => resolved(() => onResolveAll("file"))}
              >
                Use all
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
      {errors.length > 0 && (
        <div id={errorsId} data-state="error" className="mt-1 space-y-0.5 text-[11px] leading-tight text-red-600">
          {errors.map((c) => (
            <div key={c.metricCode}>
              {label(c.metricCode)}: {c.error}
            </div>
          ))}
        </div>
      )}
      {errors.length + conflicts.length + imported.length > 0 && (
        <button
          type="button"
          className="mt-1 min-h-6 w-full rounded text-[11px] leading-tight text-muted-foreground underline underline-offset-2"
          aria-label={`Discard sheet scores for ${athleteName}`}
          onClick={() => {
            onDiscard();
            requestAnimationFrame(() => document.getElementById(buttonId)?.focus());
          }}
        >
          Discard sheet scores
        </button>
      )}
    </>
  );
}
