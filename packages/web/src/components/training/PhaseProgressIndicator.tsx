/**
 * PhaseProgressIndicator
 *
 * Shows "Week X of Y" text + shadcn Progress bar.
 * Props: startDate, durationWeeks, completedWorkouts, totalWorkouts.
 * Week number = Math.ceil((daysSinceStart + 1) / 7)
 */

import { Progress } from "@/components/ui/progress";
import { Calendar } from "lucide-react";

interface PhaseProgressIndicatorProps {
  startDate: string;
  durationWeeks: number;
  completedWorkouts: number;
  totalWorkouts: number;
}

function computeCurrentWeek(startDate: string, durationWeeks: number): { week: number; daysSince: number } {
  const start = new Date(startDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysSince = Math.max(0, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const week = Math.min(Math.ceil((daysSince + 1) / 7), durationWeeks);

  return { week, daysSince };
}

export function PhaseProgressIndicator({
  startDate,
  durationWeeks,
  completedWorkouts,
  totalWorkouts,
}: PhaseProgressIndicatorProps) {
  const { week } = computeCurrentWeek(startDate, durationWeeks);
  const workoutProgress = totalWorkouts > 0 ? (completedWorkouts / totalWorkouts) * 100 : 0;

  return (
    <div className="space-y-2" data-testid="phase-progress-indicator">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Calendar className="h-4 w-4 text-primary" />
          Week {week} of {durationWeeks}
        </span>
        <span className="text-muted-foreground">
          {completedWorkouts}/{totalWorkouts} sessions
        </span>
      </div>
      <Progress
        value={workoutProgress}
        className="h-2"
        aria-label={`${Math.round(workoutProgress)}% of workouts completed`}
        data-testid="phase-progress-bar"
      />
      <p className="text-xs text-muted-foreground">
        {Math.round(workoutProgress)}% complete
      </p>
    </div>
  );
}
