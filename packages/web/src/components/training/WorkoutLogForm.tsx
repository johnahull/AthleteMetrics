/**
 * WorkoutLogForm
 *
 * Main logging form for athletes to record a workout session.
 * Props: prescribed exercises from program + any existing log entries.
 * Renders per-exercise sections with SetRow components.
 *
 * Input fields vary by exerciseType:
 *   weighted/bodyweight → reps + weight per set
 *   speed/plyometric    → reps + quality rating (1-5) per set
 *   timed               → duration (seconds) per set
 *
 * Also includes overall RPE (1-10), duration (minutes), athlete notes.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SetRow } from "./SetRow";

const EXERCISE_TYPE_COLORS: Record<string, string> = {
  weighted: "bg-blue-100 text-blue-800 border-blue-200",
  bodyweight: "bg-purple-100 text-purple-800 border-purple-200",
  speed: "bg-orange-100 text-orange-800 border-orange-200",
  plyometric: "bg-red-100 text-red-800 border-red-200",
  timed: "bg-green-100 text-green-800 border-green-200",
};

export interface PrescribedExercise {
  exerciseId: string;
  exerciseName: string;
  exerciseType: string;
  prescribedSets: number | null;
  prescribedReps: number | null;
  prescribedWeightLbs: string | null;
  prescribedDurationSeconds: number | null;
  restSeconds: number | null;
  notes: string | null;
}

interface SetEntry {
  setNumber: number;
  repsCompleted: number | null;
  weightLbs: number | null;
  qualityRating: number | null;
  durationSeconds: number | null;
  notes?: string;
}

interface ExerciseLogData {
  exerciseId: string;
  exerciseNameSnapshot: string;
  exerciseType: string;
  sets: SetEntry[];
}

const workoutLogFormSchema = z.object({
  status: z.enum(["completed", "partial", "skipped"]),
  rpe: z.coerce.number().int().min(1).max(10).optional().or(z.literal("")),
  durationMinutes: z.coerce.number().int().min(1).optional().or(z.literal("")),
  notes: z.string().optional(),
});

type WorkoutLogFormValues = z.infer<typeof workoutLogFormSchema>;

interface WorkoutLogFormProps {
  exercises: PrescribedExercise[];
  athleteProgramId: string;
  programWorkoutId: string;
  onSubmit: (data: {
    athleteProgramId: string;
    programWorkoutId: string;
    status: "completed" | "partial" | "skipped";
    rpe?: number;
    durationMinutes?: number;
    notes?: string;
    entries: ExerciseLogData[];
  }) => Promise<void>;
  isSubmitting?: boolean;
}

function initializeSets(exercise: PrescribedExercise): SetEntry[] {
  const count = exercise.prescribedSets ?? 3;
  return Array.from({ length: count }, (_, i) => ({
    setNumber: i + 1,
    repsCompleted: null,
    weightLbs: exercise.prescribedWeightLbs ? parseFloat(exercise.prescribedWeightLbs) : null,
    qualityRating: null,
    durationSeconds: exercise.prescribedDurationSeconds ?? null,
    notes: undefined,
  }));
}

export function WorkoutLogForm({
  exercises,
  athleteProgramId,
  programWorkoutId,
  onSubmit,
  isSubmitting = false,
}: WorkoutLogFormProps) {
  const [exerciseLogs, setExerciseLogs] = useState<Record<string, SetEntry[]>>(() => {
    const initial: Record<string, SetEntry[]> = {};
    exercises.forEach((ex) => {
      initial[ex.exerciseId] = initializeSets(ex);
    });
    return initial;
  });

  const form = useForm<WorkoutLogFormValues>({
    resolver: zodResolver(workoutLogFormSchema),
    defaultValues: {
      status: "completed",
      rpe: "",
      durationMinutes: "",
      notes: "",
    },
  });

  function updateSet(exerciseId: string, setNumber: number, updates: Partial<SetEntry>) {
    setExerciseLogs((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((s) =>
        s.setNumber === setNumber ? { ...s, ...updates } : s
      ),
    }));
  }

  function addSet(exerciseId: string, exercise: PrescribedExercise) {
    setExerciseLogs((prev) => {
      const current = prev[exerciseId];
      const nextNumber = current.length + 1;
      return {
        ...prev,
        [exerciseId]: [
          ...current,
          {
            setNumber: nextNumber,
            repsCompleted: null,
            weightLbs: exercise.prescribedWeightLbs ? parseFloat(exercise.prescribedWeightLbs) : null,
            qualityRating: null,
            durationSeconds: exercise.prescribedDurationSeconds ?? null,
            notes: undefined,
          },
        ],
      };
    });
  }

  function removeLastSet(exerciseId: string) {
    setExerciseLogs((prev) => {
      const current = prev[exerciseId];
      if (current.length <= 1) return prev;
      return { ...prev, [exerciseId]: current.slice(0, -1) };
    });
  }

  async function handleSubmit(values: WorkoutLogFormValues) {
    const entries: ExerciseLogData[] = exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      exerciseNameSnapshot: exercise.exerciseName,
      exerciseType: exercise.exerciseType,
      sets: exerciseLogs[exercise.exerciseId] ?? [],
    }));

    await onSubmit({
      athleteProgramId,
      programWorkoutId,
      status: values.status,
      rpe: values.rpe !== "" ? Number(values.rpe) : undefined,
      durationMinutes: values.durationMinutes !== "" ? Number(values.durationMinutes) : undefined,
      notes: values.notes || undefined,
      entries,
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Session-level fields */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Session Status *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="log-status-select">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="rpe"
            render={({ field }) => (
              <FormItem>
                <FormLabel>RPE (1-10)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    placeholder="e.g. 7"
                    {...field}
                    value={field.value === "" ? "" : field.value}
                    data-testid="log-rpe-input"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="durationMinutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Duration (min)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="e.g. 45"
                    {...field}
                    value={field.value === "" ? "" : field.value}
                    data-testid="log-duration-input"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Per-exercise sections */}
        {exercises.map((exercise) => {
          const sets = exerciseLogs[exercise.exerciseId] ?? [];
          const typeColor = EXERCISE_TYPE_COLORS[exercise.exerciseType] ?? "bg-gray-100 text-gray-700 border-gray-200";

          return (
            <Card key={exercise.exerciseId} data-testid={`exercise-log-section-${exercise.exerciseId}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  {exercise.exerciseName}
                  <Badge variant="outline" className={`text-xs capitalize ${typeColor}`}>
                    {exercise.exerciseType}
                  </Badge>
                  {exercise.prescribedSets != null && exercise.prescribedReps != null && (
                    <span className="text-sm font-normal text-muted-foreground">
                      Prescribed: {exercise.prescribedSets}×{exercise.prescribedReps}
                      {exercise.prescribedWeightLbs ? ` @ ${exercise.prescribedWeightLbs}lbs` : ""}
                    </span>
                  )}
                </CardTitle>
                {exercise.notes && (
                  <p className="text-xs text-muted-foreground">{exercise.notes}</p>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y">
                  {sets.map((set) => (
                    <SetRow
                      key={set.setNumber}
                      setNumber={set.setNumber}
                      exerciseType={exercise.exerciseType}
                      value={set}
                      onChange={(updates) => updateSet(exercise.exerciseId, set.setNumber, updates)}
                    />
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addSet(exercise.exerciseId, exercise)}
                    data-testid={`add-set-${exercise.exerciseId}`}
                  >
                    + Set
                  </Button>
                  {sets.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLastSet(exercise.exerciseId)}
                      className="text-muted-foreground"
                      data-testid={`remove-set-${exercise.exerciseId}`}
                    >
                      - Set
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Session notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Session Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="How did it go? Any observations..."
                  rows={3}
                  {...field}
                  data-testid="log-notes-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full"
          data-testid="log-form-submit"
        >
          {isSubmitting ? "Saving..." : "Save Training Record"}
        </Button>
      </form>
    </Form>
  );
}
