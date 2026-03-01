/**
 * SetRow
 *
 * A single set row in WorkoutLogForm.
 * Renders appropriate inputs based on exerciseType:
 *   weighted / bodyweight → reps + weight
 *   speed / plyometric    → reps + quality rating (1-5)
 *   timed                 → duration (seconds)
 */

import { Input } from "@/components/ui/input";
import type { WorkoutSet } from "@shared/schema/validation";

type SetRowValue = Partial<WorkoutSet> & { qualityRating?: number | null; durationSeconds?: number | null };

interface SetRowProps {
  setNumber: number;
  exerciseType: string;
  value: SetRowValue;
  onChange: (updates: SetRowValue) => void;
}

export function SetRow({ setNumber, exerciseType, value, onChange }: SetRowProps) {
  const isWeightBased = exerciseType === "weighted" || exerciseType === "bodyweight";
  const isQualityBased = exerciseType === "speed" || exerciseType === "plyometric";
  const isTimed = exerciseType === "timed";

  return (
    <div
      className="flex items-center gap-3 py-2"
      data-testid={`set-row-${setNumber}`}
    >
      <div className="w-8 text-sm font-medium text-muted-foreground text-center">
        {setNumber}
      </div>

      {(isWeightBased || isQualityBased) && (
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-1">Reps</label>
          <Input
            type="number"
            min={0}
            placeholder="0"
            value={value.repsCompleted ?? ""}
            onChange={(e) =>
              onChange({ ...value, repsCompleted: e.target.value ? parseInt(e.target.value) : null })
            }
            className="h-8 text-sm"
            data-testid={`set-row-reps-${setNumber}`}
          />
        </div>
      )}

      {isWeightBased && (
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-1">
            Weight (lbs)
          </label>
          <Input
            type="number"
            min={0}
            step={2.5}
            placeholder="0"
            value={value.weightLbs ?? ""}
            onChange={(e) =>
              onChange({ ...value, weightLbs: e.target.value ? parseFloat(e.target.value) : null })
            }
            className="h-8 text-sm"
            data-testid={`set-row-weight-${setNumber}`}
          />
        </div>
      )}

      {isQualityBased && (
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-1">Quality (1-5)</label>
          <Input
            type="number"
            min={1}
            max={5}
            placeholder="3"
            value={value.qualityRating ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                qualityRating: e.target.value ? parseInt(e.target.value) : null,
              })
            }
            className="h-8 text-sm"
            data-testid={`set-row-quality-${setNumber}`}
          />
        </div>
      )}

      {isTimed && (
        <div className="flex-1">
          <label className="text-xs text-muted-foreground block mb-1">Duration (sec)</label>
          <Input
            type="number"
            min={0}
            placeholder="0"
            value={value.durationSeconds ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                durationSeconds: e.target.value ? parseInt(e.target.value) : null,
              })
            }
            className="h-8 text-sm"
            data-testid={`set-row-duration-${setNumber}`}
          />
        </div>
      )}

      <div className="flex-1">
        <label className="text-xs text-muted-foreground block mb-1">Notes</label>
        <Input
          type="text"
          placeholder="Optional"
          value={value.notes ?? ""}
          onChange={(e) => onChange({ ...value, notes: e.target.value || undefined })}
          className="h-8 text-sm"
          data-testid={`set-row-notes-${setNumber}`}
        />
      </div>
    </div>
  );
}
