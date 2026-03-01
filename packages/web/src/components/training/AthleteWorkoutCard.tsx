/**
 * AthleteWorkoutCard
 *
 * Card showing today's workout name, exercise count, estimated duration.
 * Has "Log Training" CTA button linking to /my-training/log/:workoutId.
 */

import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, Clock, ChevronRight } from "lucide-react";
import type { WorkoutStatus } from "./WorkoutStatusBadge";
import { WorkoutStatusBadge } from "./WorkoutStatusBadge";

interface AthleteWorkoutCardProps {
  workoutId: string;
  dayNumber: number;
  name: string | null;
  exerciseCount: number;
  estimatedMinutes?: number | null;
  existingLogId?: string | null;
  existingLogStatus?: WorkoutStatus | null;
}

export function AthleteWorkoutCard({
  workoutId,
  dayNumber,
  name,
  exerciseCount,
  estimatedMinutes,
  existingLogId,
  existingLogStatus,
}: AthleteWorkoutCardProps) {
  const workoutName = name || `Day ${dayNumber} Workout`;
  const alreadyLogged = !!existingLogId;

  return (
    <Card data-testid="athlete-workout-card" className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                Day {dayNumber}
              </Badge>
              {alreadyLogged && existingLogStatus && (
                <WorkoutStatusBadge status={existingLogStatus} />
              )}
            </div>
            <CardTitle className="text-lg">{workoutName}</CardTitle>
            <CardDescription className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1">
                <Dumbbell className="h-3.5 w-3.5" />
                {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""}
              </span>
              {estimatedMinutes != null && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  ~{estimatedMinutes} min
                </span>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {alreadyLogged ? (
          <div className="flex gap-2">
            <Link href={`/my-training/log/${existingLogId}`}>
              <Button variant="outline" size="sm" data-testid="view-log-button">
                View Training Record
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
            <Link href={`/my-training/log/${workoutId}`}>
              <Button variant="ghost" size="sm" data-testid="log-again-button">
                Update Log
              </Button>
            </Link>
          </div>
        ) : (
          <Link href={`/my-training/log/${workoutId}`}>
            <Button data-testid="log-training-button" className="w-full sm:w-auto">
              Log Training Session
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
