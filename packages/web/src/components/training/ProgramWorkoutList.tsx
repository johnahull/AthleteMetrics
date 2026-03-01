/**
 * ProgramWorkoutList
 *
 * Ordered list of workout day cards with manual reorder (up/down buttons).
 * Note: @dnd-kit is not in the project dependencies. Reordering is done via
 * up/down arrow buttons which call the reorder API endpoint.
 */

import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown } from "lucide-react";
import { ProgramWorkoutCard, type ProgramWorkout } from "./ProgramWorkoutCard";
import type { Exercise } from "./ExerciseCard";
import type { ProgramWorkoutExercise } from "./ProgramWorkoutExerciseRow";

interface ProgramWorkoutListProps {
  workouts: ProgramWorkout[];
  availableExercises: Exercise[];
  onReorder: (orderedIds: string[]) => Promise<void>;
  onAddExercise: (workoutId: string, exerciseId: string) => Promise<void>;
  onUpdateExercise: (exerciseId: string, updates: Partial<ProgramWorkoutExercise>) => Promise<void>;
  onRemoveExercise: (programWorkoutExerciseId: string) => Promise<void>;
}

export function ProgramWorkoutList({
  workouts,
  availableExercises,
  onReorder,
  onAddExercise,
  onUpdateExercise,
  onRemoveExercise,
}: ProgramWorkoutListProps) {
  const sorted = [...workouts].sort((a, b) => a.dayNumber - b.dayNumber);

  async function moveWorkout(index: number, direction: "up" | "down") {
    const newOrder = [...sorted];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newOrder.length) return;

    // Swap
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];

    await onReorder(newOrder.map((w) => w.id));
  }

  if (sorted.length === 0) {
    return (
      <div className="text-center py-8 border-2 border-dashed rounded-lg">
        <p className="text-muted-foreground text-sm">No workout days added yet.</p>
        <p className="text-muted-foreground text-xs mt-1">Use the "Add Day" button to add your first workout day.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="program-workout-list">
      {sorted.map((workout, index) => (
        <div key={workout.id} className="flex gap-2 items-start">
          <div className="flex flex-col gap-1 pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => moveWorkout(index, "up")}
              disabled={index === 0}
              aria-label={`Move Day ${workout.dayNumber} up`}
              data-testid={`workout-move-up-${workout.id}`}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => moveWorkout(index, "down")}
              disabled={index === sorted.length - 1}
              aria-label={`Move Day ${workout.dayNumber} down`}
              data-testid={`workout-move-down-${workout.id}`}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex-1">
            <ProgramWorkoutCard
              workout={workout}
              availableExercises={availableExercises}
              onAddExercise={onAddExercise}
              onUpdateExercise={onUpdateExercise}
              onRemoveExercise={onRemoveExercise}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
