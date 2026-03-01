/**
 * ProgramWorkoutExerciseRow
 *
 * A single row within an expanded workout day card.
 * Shows: exercise name, prescribed sets/reps/weight/rest, coach notes.
 * Inline edit and remove actions.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Edit, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface ProgramWorkoutExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  exerciseType: string;
  isArchived?: boolean;
  displayOrder: number;
  prescribedSets: number | null;
  prescribedReps: number | null;
  prescribedWeightLbs: string | null;
  prescribedDurationSeconds: number | null;
  restSeconds: number | null;
  notes: string | null;
}

interface ProgramWorkoutExerciseRowProps {
  exercise: ProgramWorkoutExercise;
  onUpdate: (id: string, updates: Partial<ProgramWorkoutExercise>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

const EXERCISE_TYPE_COLORS: Record<string, string> = {
  weighted: "bg-blue-100 text-blue-800 border-blue-200",
  bodyweight: "bg-purple-100 text-purple-800 border-purple-200",
  speed: "bg-orange-100 text-orange-800 border-orange-200",
  plyometric: "bg-red-100 text-red-800 border-red-200",
  timed: "bg-green-100 text-green-800 border-green-200",
};

export function ProgramWorkoutExerciseRow({
  exercise,
  onUpdate,
  onRemove,
}: ProgramWorkoutExerciseRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    prescribedSets: exercise.prescribedSets?.toString() ?? "",
    prescribedReps: exercise.prescribedReps?.toString() ?? "",
    prescribedWeightLbs: exercise.prescribedWeightLbs ?? "",
    prescribedDurationSeconds: exercise.prescribedDurationSeconds?.toString() ?? "",
    restSeconds: exercise.restSeconds?.toString() ?? "",
    notes: exercise.notes ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const typeColor = EXERCISE_TYPE_COLORS[exercise.exerciseType] ?? "bg-gray-100 text-gray-700 border-gray-200";

  async function handleSave() {
    setIsSaving(true);
    try {
      await onUpdate(exercise.id, {
        prescribedSets: editValues.prescribedSets ? parseInt(editValues.prescribedSets) : null,
        prescribedReps: editValues.prescribedReps ? parseInt(editValues.prescribedReps) : null,
        prescribedWeightLbs: editValues.prescribedWeightLbs || null,
        prescribedDurationSeconds: editValues.prescribedDurationSeconds
          ? parseInt(editValues.prescribedDurationSeconds)
          : null,
        restSeconds: editValues.restSeconds ? parseInt(editValues.restSeconds) : null,
        notes: editValues.notes || null,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setEditValues({
      prescribedSets: exercise.prescribedSets?.toString() ?? "",
      prescribedReps: exercise.prescribedReps?.toString() ?? "",
      prescribedWeightLbs: exercise.prescribedWeightLbs ?? "",
      prescribedDurationSeconds: exercise.prescribedDurationSeconds?.toString() ?? "",
      restSeconds: exercise.restSeconds?.toString() ?? "",
      notes: exercise.notes ?? "",
    });
    setIsEditing(false);
  }

  async function handleRemove() {
    if (window.confirm(`Remove ${exercise.exerciseName} from this workout?`)) {
      await onRemove(exercise.id);
    }
  }

  const showWeightField = exercise.exerciseType === "weighted";
  const showDurationField = exercise.exerciseType === "timed";

  if (isEditing) {
    return (
      <div
        className="border rounded-md p-3 space-y-2 bg-muted/30"
        data-testid={`exercise-row-editing-${exercise.id}`}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{exercise.exerciseName}</span>
          {exercise.isArchived && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Archived
            </Badge>
          )}
          <Badge variant="outline" className={`text-xs capitalize ${typeColor}`}>
            {exercise.exerciseType}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Sets</label>
            <Input
              type="number"
              min={1}
              value={editValues.prescribedSets}
              onChange={(e) => setEditValues((v) => ({ ...v, prescribedSets: e.target.value }))}
              placeholder="Sets"
              className="h-8 text-sm"
              data-testid={`exercise-row-sets-${exercise.id}`}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Reps</label>
            <Input
              type="number"
              min={1}
              value={editValues.prescribedReps}
              onChange={(e) => setEditValues((v) => ({ ...v, prescribedReps: e.target.value }))}
              placeholder="Reps"
              className="h-8 text-sm"
              data-testid={`exercise-row-reps-${exercise.id}`}
            />
          </div>
          {showWeightField && (
            <div>
              <label className="text-xs text-muted-foreground">Weight (lbs)</label>
              <Input
                type="number"
                min={0}
                step={2.5}
                value={editValues.prescribedWeightLbs}
                onChange={(e) => setEditValues((v) => ({ ...v, prescribedWeightLbs: e.target.value }))}
                placeholder="lbs"
                className="h-8 text-sm"
                data-testid={`exercise-row-weight-${exercise.id}`}
              />
            </div>
          )}
          {showDurationField && (
            <div>
              <label className="text-xs text-muted-foreground">Duration (sec)</label>
              <Input
                type="number"
                min={1}
                value={editValues.prescribedDurationSeconds}
                onChange={(e) => setEditValues((v) => ({ ...v, prescribedDurationSeconds: e.target.value }))}
                placeholder="sec"
                className="h-8 text-sm"
                data-testid={`exercise-row-duration-${exercise.id}`}
              />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Rest (sec)</label>
            <Input
              type="number"
              min={0}
              value={editValues.restSeconds}
              onChange={(e) => setEditValues((v) => ({ ...v, restSeconds: e.target.value }))}
              placeholder="sec"
              className="h-8 text-sm"
              data-testid={`exercise-row-rest-${exercise.id}`}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Coaching Notes</label>
          <Input
            value={editValues.notes}
            onChange={(e) => setEditValues((v) => ({ ...v, notes: e.target.value }))}
            placeholder="Optional coaching cues..."
            className="h-8 text-sm"
            data-testid={`exercise-row-notes-${exercise.id}`}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            data-testid={`exercise-row-save-${exercise.id}`}
          >
            <Check className="h-3 w-3 mr-1" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
            data-testid={`exercise-row-cancel-${exercise.id}`}
          >
            <X className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between py-2 px-3 rounded hover:bg-muted/30 group"
      data-testid={`exercise-row-${exercise.id}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-medium truncate">
          {exercise.exerciseName}
          {exercise.isArchived && (
            <span className="text-muted-foreground font-normal"> (Archived)</span>
          )}
        </span>
        <Badge variant="outline" className={`text-xs capitalize shrink-0 ${typeColor}`}>
          {exercise.exerciseType}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground shrink-0">
        {exercise.prescribedSets != null && exercise.prescribedReps != null && (
          <span className="hidden sm:inline">{exercise.prescribedSets}×{exercise.prescribedReps}</span>
        )}
        {exercise.prescribedWeightLbs && (
          <span className="hidden sm:inline">{exercise.prescribedWeightLbs}lbs</span>
        )}
        {exercise.restSeconds != null && (
          <span className="hidden md:inline">{exercise.restSeconds}s rest</span>
        )}

        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            data-testid={`exercise-row-edit-${exercise.id}`}
            aria-label="Edit prescription"
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-muted-foreground hover:text-destructive"
            data-testid={`exercise-row-remove-${exercise.id}`}
            aria-label="Remove exercise"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
