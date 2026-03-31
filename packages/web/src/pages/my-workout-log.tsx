/**
 * My Workout Log Page (Athlete)
 * Route: /my-training/log/:workoutId
 *
 * Loads today's workout prescription, renders WorkoutLogForm.
 * On submit: POST /api/training/logs.
 * Shows MilestoneAlert on completion if applicable.
 * Uses athlete-facing language: "Training record", "Log your session".
 */

import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useEffect } from "react";
import { Dumbbell, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTrainingAccess } from "@/hooks/use-training-access";
import { useMyProgram } from "@/hooks/useMyProgram";
import { useCreateWorkoutLog } from "@/hooks/useWorkoutLog";
import { WorkoutLogForm } from "@/components/training/WorkoutLogForm";
import { MilestoneAlert } from "@/components/training/MilestoneAlert";
import { useToast } from "@/hooks/use-toast";
import type { WorkoutStatus } from "@/components/training/WorkoutStatusBadge";

export default function MyWorkoutLogPage() {
  const { isEnabled, isLoading } = useTrainingAccess();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const params = useParams<{ workoutId: string }>();
  const workoutId = params.workoutId;

  const [milestoneType, setMilestoneType] = useState<"streak" | "phase_complete" | null>(null);
  const [showMilestone, setShowMilestone] = useState(false);

  useEffect(() => {
    if (!isLoading && !isEnabled) {
      navigate("/my-dashboard");
    }
  }, [isEnabled, isLoading, navigate]);

  const { data: myProgram, isLoading: programLoading } = useMyProgram();
  const createLog = useCreateWorkoutLog();

  if (isLoading || !isEnabled) return null;

  // Find the specific workout from the schedule
  const workout = myProgram?.schedule?.find((s) => s.workoutId === workoutId);
  const programDetails = myProgram?.program;

  if (programLoading) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-sm text-muted-foreground">Loading workout...</p>
      </div>
    );
  }

  if (!myProgram || !workout) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Link href="/my-training">
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            My Training
          </Button>
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">Workout not found or you don't have an active training plan.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get exercises for this workout from today's workout data
  // We need to fetch exercises; reuse useMyProgramToday but filter by workoutId
  // For now, the page relies on any prescriptions associated with workoutId
  // The actual exercise data comes from the API via the schedule enrichment
  const todayWorkoutExercises = (workout as unknown as { exercises?: Array<{
    id: string;
    exerciseId: string;
    exerciseName: string;
    exerciseType: string;
    prescribedSets: number | null;
    prescribedReps: number | null;
    prescribedWeightLbs: string | null;
    prescribedDurationSeconds: number | null;
    restSeconds: number | null;
    notes: string | null;
  }> }).exercises ?? [];

  async function handleSubmit(data: Parameters<typeof createLog.mutateAsync>[0]) {
    try {
      const log = await createLog.mutateAsync(data);

      // Check for milestone conditions based on schedule
      const completedLogs = myProgram?.schedule?.filter(
        (s) => s.logStatus === "completed"
      ) ?? [];

      // Streak check: 5+ consecutive completed sessions
      if (completedLogs.length >= 5) {
        // Check if the last 5 were consecutive (by dayNumber order)
        const sortedCompleted = [...completedLogs].sort((a, b) => {
          // Sort by scheduledDate
          return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
        });

        if (sortedCompleted.length >= 5) {
          const lastFive = sortedCompleted.slice(-5);
          // Newly completed count; show streak if all 5 most recent are completed
          setMilestoneType("streak");
          setShowMilestone(true);
        }
      }

      // Phase complete check
      const totalWorkouts = myProgram?.schedule?.length ?? 0;
      const newCompletedCount = completedLogs.length + 1;
      if (newCompletedCount >= totalWorkouts && totalWorkouts > 0) {
        setMilestoneType("phase_complete");
        setShowMilestone(true);
      }

      toast({ title: "Training recorded!", description: "Your session has been saved." });

      if (data.status === "completed") {
        // Navigate back after a short delay to allow milestone to show
        setTimeout(() => {
          navigate("/my-training");
        }, 2000);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save training record.";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  }

  const workoutName = workout.name ?? `Day ${workout.dayNumber} Workout`;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/my-training">
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            My Training
          </Button>
        </Link>
        <Dumbbell className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Log Your Session</h1>
      </div>

      {/* Milestone alert */}
      {milestoneType && (
        <MilestoneAlert
          show={showMilestone}
          type={milestoneType}
          onDismiss={() => setShowMilestone(false)}
        />
      )}

      {/* Workout header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {workoutName}
          </CardTitle>
          <CardDescription>
            {programDetails?.name} · Day {workout.dayNumber}
            {" "}· {new Date(workout.scheduledDate + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
            })}
          </CardDescription>
        </CardHeader>
      </Card>

      {todayWorkoutExercises.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              No exercises prescribed for this workout day. Contact your coach.
            </p>
          </CardContent>
        </Card>
      ) : (
        <WorkoutLogForm
          exercises={todayWorkoutExercises}
          athleteProgramId={myProgram.id}
          programWorkoutId={workoutId}
          onSubmit={handleSubmit}
          isSubmitting={createLog.isPending}
        />
      )}
    </div>
  );
}
