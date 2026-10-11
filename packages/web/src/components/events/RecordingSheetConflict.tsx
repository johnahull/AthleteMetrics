/**
 * Per-cell choice between a saved value and a different value from an uploaded sheet.
 */
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface RecordingSheetConflictProps {
  metricLabel: string;
  athleteName: string;
  savedValue: string;
  fileValue: string;
  /** The cell's input, focused after a choice (the trigger goes away with the conflict) */
  inputId: string;
  onResolve: (choice: "saved" | "file") => void;
}

export function RecordingSheetConflict({ metricLabel, athleteName, savedValue, fileValue, inputId, onResolve }: RecordingSheetConflictProps) {
  const choose = (choice: "saved" | "file") => {
    onResolve(choice);
    requestAnimationFrame(() => document.getElementById(inputId)?.focus());
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-1 w-full rounded text-[11px] leading-tight text-orange-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-orange-500"
          aria-label={`Conflict for ${metricLabel} for ${athleteName}: saved ${savedValue}, file ${fileValue}`}
        >
          File: {fileValue}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3" align="center">
        <p className="text-sm">
          {metricLabel} for {athleteName}: saved <strong>{savedValue}</strong>, file <strong>{fileValue}</strong>.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => choose("saved")}>
            Keep saved
          </Button>
          <Button size="sm" onClick={() => choose("file")}>
            Use file value
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
