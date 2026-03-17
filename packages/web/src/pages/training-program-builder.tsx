/**
 * Training Program Builder Page (Coach / Org Admin)
 * Route: /training/programs/:programId
 *
 * Full program editor: ProgramMetaForm + ProgramWorkoutList
 * with workout days and exercises.
 */

import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useEffect } from "react";
import { Dumbbell, ArrowLeft, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTrainingAccess } from "@/hooks/use-training-access";
import {
  useTrainingProgram,
  useUpdateProgram,
  useAddWorkoutDay,
  useReorderWorkoutDays,
  useAddExerciseToWorkout,
  useUpdateExercisePrescription,
  useRemoveExerciseFromWorkout,
} from "@/hooks/useTrainingPrograms";
import { useExercises } from "@/hooks/useExercises";
import { ProgramMetaForm, type ProgramMetaValues } from "@/components/training/ProgramMetaForm";
import { useSports } from "@/lib/sports-api";
import { ProgramWorkoutList } from "@/components/training/ProgramWorkoutList";
import type { ProgramWorkoutExercise } from "@/components/training/ProgramWorkoutExerciseRow";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

export default function TrainingProgramBuilderPage() {
  const { isEnabled, isLoading, organizationId } = useTrainingAccess();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const params = useParams<{ programId: string }>();
  const programId = params.programId;

  const [showAddDayDialog, setShowAddDayDialog] = useState(false);
  const [newDayName, setNewDayName] = useState("");
  const [showMetaForm, setShowMetaForm] = useState(false);

  useEffect(() => {
    if (!isLoading && !isEnabled) {
      navigate("/");
    }
  }, [isEnabled, isLoading, navigate]);

  const { data: program, isLoading: programLoading } = useTrainingProgram(programId ?? null);
  const { data: exercises = [] } = useExercises(organizationId);
  const { data: sports = [] } = useSports();

  const sportNameMap = new Map(sports.map((s) => [s.code, s.name]));
  // Resolve legacy free-text values to codes (e.g. "Football" → "FOOTBALL")
  const sportCodeMap = new Map(sports.map((s) => [s.name.toLowerCase(), s.code]));

  const updateProgram = useUpdateProgram(programId ?? "");
  const addWorkoutDay = useAddWorkoutDay(programId ?? "");
  const reorderWorkoutDays = useReorderWorkoutDays(programId ?? "");
  const addExerciseToWorkout = useAddExerciseToWorkout(programId ?? "");
  const updateExercisePrescription = useUpdateExercisePrescription(programId ?? "");
  const removeExerciseFromWorkout = useRemoveExerciseFromWorkout(programId ?? "");

  if (isLoading || !isEnabled) return null;

  if (programLoading) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-muted-foreground">Loading program...</p>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-destructive">Program not found.</p>
        <Link href="/training/programs">
          <Button variant="outline" className="mt-4">Back to Programs</Button>
        </Link>
      </div>
    );
  }

  async function handleUpdateMeta(values: ProgramMetaValues) {
    try {
      await updateProgram.mutateAsync(values);
      setShowMetaForm(false);
      toast({ title: "Program updated" });
    } catch {
      toast({ title: "Error", description: "Failed to update program.", variant: "destructive" });
    }
  }

  async function handleAddDay() {
    try {
      await addWorkoutDay.mutateAsync({ name: newDayName || undefined });
      setNewDayName("");
      setShowAddDayDialog(false);
      toast({ title: "Workout day added" });
    } catch {
      toast({ title: "Error", description: "Failed to add workout day.", variant: "destructive" });
    }
  }

  async function handleReorder(orderedIds: string[]) {
    try {
      await reorderWorkoutDays.mutateAsync(orderedIds);
    } catch {
      toast({ title: "Error", description: "Failed to reorder workout days.", variant: "destructive" });
    }
  }

  async function handleAddExercise(workoutId: string, exerciseId: string) {
    await addExerciseToWorkout.mutateAsync({ workoutId, exerciseId });
  }

  async function handleUpdateExercise(workoutId: string, prescriptionId: string, updates: Partial<ProgramWorkoutExercise>) {
    await updateExercisePrescription.mutateAsync({ workoutId, prescriptionId, updates });
  }

  async function handleRemoveExercise(workoutId: string, prescriptionId: string) {
    await removeExerciseFromWorkout.mutateAsync({ workoutId, prescriptionId });
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/training/programs">
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Programs
          </Button>
        </Link>
        <Dumbbell className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{program.name}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
          Experimental
        </span>
      </div>

      {/* Program meta summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
        {program.sport && <span>Sport: <strong className="text-foreground">{sportNameMap.get(program.sport) ?? program.sport}</strong></span>}
        <span>Duration: <strong className="text-foreground">{program.durationWeeks} weeks</strong></span>
        <span>{program.workouts?.length ?? 0} workout days</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowMetaForm(true)}
          data-testid="edit-program-meta-button"
        >
          <Save className="h-3.5 w-3.5 mr-1" />
          Edit Details
        </Button>
      </div>

      {program.description && (
        <p className="text-sm text-muted-foreground bg-muted/30 rounded-md p-3">
          {program.description}
        </p>
      )}

      {/* Workout days section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Workout Days</h2>
          <Button
            size="sm"
            onClick={() => setShowAddDayDialog(true)}
            data-testid="add-workout-day-button"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Day
          </Button>
        </div>

        <ProgramWorkoutList
          workouts={program.workouts ?? []}
          availableExercises={exercises}
          onReorder={handleReorder}
          onAddExercise={handleAddExercise}
          onUpdateExercise={handleUpdateExercise}
          onRemoveExercise={handleRemoveExercise}
        />
      </div>

      {/* Add day dialog */}
      <Dialog open={showAddDayDialog} onOpenChange={setShowAddDayDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Workout Day</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Day Name (optional)</label>
              <Input
                placeholder="e.g. Upper Body Strength, Speed Work"
                value={newDayName}
                onChange={(e) => setNewDayName(e.target.value)}
                className="mt-1"
                data-testid="new-day-name-input"
                onKeyDown={(e) => { if (e.key === "Enter") handleAddDay(); }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddDayDialog(false)}>Cancel</Button>
              <Button
                onClick={handleAddDay}
                disabled={addWorkoutDay.isPending}
                data-testid="add-day-submit-button"
              >
                {addWorkoutDay.isPending ? "Adding..." : "Add Day"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit meta dialog */}
      <Dialog open={showMetaForm} onOpenChange={setShowMetaForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Program Details</DialogTitle>
          </DialogHeader>
          <ProgramMetaForm
            defaultValues={{
              name: program.name,
              description: program.description ?? "",
              sport: program.sport
                ? (sportNameMap.has(program.sport) ? program.sport : sportCodeMap.get(program.sport.toLowerCase()) ?? "")
                : "",
              durationWeeks: program.durationWeeks,
            }}
            onSubmit={handleUpdateMeta}
            isSubmitting={updateProgram.isPending}
            submitLabel="Save Changes"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
