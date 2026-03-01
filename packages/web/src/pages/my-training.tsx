/**
 * My Training Page (Athlete)
 * Route: /my-training
 *
 * Shows: AssessmentContextCard, PhaseProgressIndicator, AthleteWorkoutCard for today,
 * full schedule list with WorkoutStatusBadge per day.
 * Uses athlete-facing language: "Your training plan", "Training record".
 */

import { useLocation } from "wouter";
import { useEffect } from "react";
import { Dumbbell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTrainingAccess } from "@/hooks/use-training-access";
import { useMyProgram, useMyProgramToday } from "@/hooks/useMyProgram";
import { AssessmentContextCard } from "@/components/training/AssessmentContextCard";
import { PhaseProgressIndicator } from "@/components/training/PhaseProgressIndicator";
import { AthleteWorkoutCard } from "@/components/training/AthleteWorkoutCard";
import { AthleteScheduleView } from "@/components/training/AthleteScheduleView";

export default function MyTrainingPage() {
  const { isEnabled, isLoading } = useTrainingAccess();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !isEnabled) {
      navigate("/my-dashboard");
    }
  }, [isEnabled, isLoading, navigate]);

  const { data: myProgram, isLoading: programLoading } = useMyProgram();
  const { data: todayWorkout, isLoading: todayLoading } = useMyProgramToday();

  if (isLoading || !isEnabled) return null;

  const loading = programLoading || todayLoading;

  // Count completed workouts from schedule
  const completedCount = myProgram?.schedule?.filter(
    (s) => s.logStatus === "completed" || s.logStatus === "partial"
  ).length ?? 0;
  const totalCount = myProgram?.schedule?.length ?? 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Dumbbell className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-bold">My Training</h1>
      </div>

      {/* Assessment context — only for athletes with measurement history */}
      <AssessmentContextCard />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading your training plan...</p>
      ) : !myProgram ? (
        <Card>
          <CardHeader>
            <CardTitle>No Active Training Plan</CardTitle>
            <CardDescription>
              Your coach hasn't assigned a training program yet. Check back soon!
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {/* Program overview + phase progress */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{myProgram.program?.name}</CardTitle>
              <CardDescription>
                Your active training plan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PhaseProgressIndicator
                startDate={myProgram.startDate}
                durationWeeks={myProgram.program?.durationWeeks ?? 1}
                completedWorkouts={completedCount}
                totalWorkouts={totalCount}
              />
            </CardContent>
          </Card>

          {/* Today's workout */}
          {todayWorkout ? (
            <div>
              <h2 className="text-lg font-semibold mb-3">Today's Workout</h2>
              <AthleteWorkoutCard
                workoutId={todayWorkout.workoutId}
                dayNumber={todayWorkout.dayNumber}
                name={todayWorkout.name}
                exerciseCount={todayWorkout.exercises.length}
                existingLogId={todayWorkout.existingLog?.id ?? null}
                existingLogStatus={todayWorkout.existingLog?.status as "completed" | "partial" | "skipped" | null ?? null}
              />
            </div>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground text-center py-2">
                  No workout scheduled for today. Rest up!
                </p>
              </CardContent>
            </Card>
          )}

          {/* Full schedule */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Training Schedule</h2>
            <AthleteScheduleView
              schedule={myProgram.schedule ?? []}
              assignmentId={myProgram.id}
            />
          </div>
        </>
      )}
    </div>
  );
}
