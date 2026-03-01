/**
 * ProgramWorkoutCard
 *
 * Expandable card for a single workout day within a program.
 * Shows: day name, exercises list, inline "Add Exercise" button.
 * Collapsed by default.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Plus, GripVertical } from "lucide-react";
import { ProgramWorkoutExerciseRow, type ProgramWorkoutExercise } from "./ProgramWorkoutExerciseRow";
import { ExercisePicker } from "./ExercisePicker";
import type { Exercise } from "./ExerciseCard";

export interface ProgramWorkout {
  id: string;
  programId: string;
  dayNumber: number;
  name: string | null;
  notes: string | null;
  exercises: ProgramWorkoutExercise[];
}

interface ProgramWorkoutCardProps {
  workout: ProgramWorkout;
  availableExercises: Exercise[];
  onAddExercise: (workoutId: string, exerciseId: string) => Promise<void>;
  onUpdateExercise: (exerciseId: string, updates: Partial<ProgramWorkoutExercise>) => Promise<void>;
  onRemoveExercise: (programWorkoutExerciseId: string) => Promise<void>;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function ProgramWorkoutCard({
  workout,
  availableExercises,
  onAddExercise,
  onUpdateExercise,
  onRemoveExercise,
  dragHandleProps,
}: ProgramWorkoutCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [isAddingExercise, setIsAddingExercise] = useState(false);

  const existingExerciseIds = workout.exercises.map((e) => e.exerciseId);
  const workoutName = workout.name || `Day ${workout.dayNumber}`;

  async function handleSelectExercise(exercise: Exercise) {
    setIsAddingExercise(true);
    try {
      await onAddExercise(workout.id, exercise.id);
      setShowExercisePicker(false);
    } finally {
      setIsAddingExercise(false);
    }
  }

  return (
    <>
      <Card data-testid={`workout-card-${workout.id}`}>
        <CardHeader className="flex-row items-center justify-between space-y-0 py-3 px-4">
          <div className="flex items-center gap-2">
            <div
              {...dragHandleProps}
              className="cursor-grab text-muted-foreground hover:text-foreground"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </div>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 text-left hover:text-primary transition-colors"
              data-testid={`workout-card-toggle-${workout.id}`}
              aria-expanded={isExpanded}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="font-medium">{workoutName}</span>
            </button>

            <Badge variant="secondary" className="text-xs">
              {workout.exercises.length} exercise{workout.exercises.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsExpanded(true);
              setShowExercisePicker(true);
            }}
            data-testid={`workout-card-add-exercise-${workout.id}`}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Exercise
          </Button>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0 pb-3 px-4">
            {workout.exercises.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No exercises yet.{" "}
                <button
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => setShowExercisePicker(true)}
                >
                  Add one
                </button>
              </p>
            ) : (
              <div className="divide-y">
                {workout.exercises
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((exercise) => (
                    <ProgramWorkoutExerciseRow
                      key={exercise.id}
                      exercise={exercise}
                      onUpdate={onUpdateExercise}
                      onRemove={onRemoveExercise}
                    />
                  ))}
              </div>
            )}

            {workout.notes && (
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">{workout.notes}</p>
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={showExercisePicker} onOpenChange={setShowExercisePicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Exercise to {workoutName}</DialogTitle>
          </DialogHeader>
          <ExercisePicker
            exercises={availableExercises}
            onSelect={handleSelectExercise}
            excludeIds={existingExerciseIds}
          />
          {isAddingExercise && (
            <p className="text-sm text-muted-foreground text-center">Adding exercise...</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
