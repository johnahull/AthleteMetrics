/**
 * AthleteScheduleView
 *
 * Vertical list of all scheduled workout days for an assignment.
 * Each item shows: day name, scheduledDate, WorkoutStatusBadge.
 * Clicking a completed item shows log link.
 */

import { Link } from "wouter";
import { Calendar, ChevronRight } from "lucide-react";
import { WorkoutStatusBadge, type WorkoutStatus } from "./WorkoutStatusBadge";

export interface ScheduledWorkout {
  workoutId: string;
  dayNumber: number;
  name: string | null;
  scheduledDate: string;
  logStatus: WorkoutStatus;
  logId?: string | null;
}

interface AthleteScheduleViewProps {
  schedule: ScheduledWorkout[];
  assignmentId: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function AthleteScheduleView({ schedule, assignmentId }: AthleteScheduleViewProps) {
  if (schedule.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No workout days scheduled.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="athlete-schedule-view">
      {schedule.map((item) => {
        const dayLabel = item.name || `Day ${item.dayNumber}`;
        const isCompleted = item.logStatus === "completed" || item.logStatus === "partial";

        return (
          <div
            key={item.workoutId}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
            data-testid={`schedule-item-${item.workoutId}`}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-xs font-medium">
                {item.dayNumber}
              </div>
              <div>
                <p className="text-sm font-medium">{dayLabel}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(item.scheduledDate)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <WorkoutStatusBadge status={item.logStatus} />
              {isCompleted && item.logId && (
                <Link
                  href={`/my-training/log/${item.logId}`}
                  className="text-xs text-primary hover:underline flex items-center gap-0.5"
                  data-testid={`schedule-log-link-${item.workoutId}`}
                >
                  View log
                  <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
