/**
 * ExerciseCard
 *
 * Compact card displaying an exercise from the library.
 * Shows: name, category, exerciseType badge, default sets/reps.
 * Edit and archive actions for coach.
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, Archive } from "lucide-react";

export interface Exercise {
  id: string;
  name: string;
  category: string | null;
  exerciseType: string;
  defaultSets: number | null;
  defaultReps: string | null;
  defaultWeightLbs: string | null;
  defaultDurationSeconds: number | null;
  videoUrl: string | null;
  notes: string | null;
  isActive: boolean;
  organizationId: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExerciseCardProps {
  exercise: Exercise;
  onEdit: (exercise: Exercise) => void;
  onArchive: (exercise: Exercise) => void;
}

const EXERCISE_TYPE_COLORS: Record<string, string> = {
  weighted: "bg-blue-100 text-blue-800 border-blue-200",
  bodyweight: "bg-purple-100 text-purple-800 border-purple-200",
  speed: "bg-orange-100 text-orange-800 border-orange-200",
  plyometric: "bg-red-100 text-red-800 border-red-200",
  timed: "bg-green-100 text-green-800 border-green-200",
};

export function ExerciseCard({ exercise, onEdit, onArchive }: ExerciseCardProps) {
  const typeColor = EXERCISE_TYPE_COLORS[exercise.exerciseType] ?? "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <Card data-testid={`exercise-card-${exercise.id}`} className="h-full">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <h3 className="font-semibold text-base leading-tight truncate">{exercise.name}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={`text-xs capitalize ${typeColor}`}
              data-testid={`exercise-type-badge-${exercise.id}`}
            >
              {exercise.exerciseType}
            </Badge>
            {exercise.category && (
              <span className="text-xs text-muted-foreground capitalize">{exercise.category}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 ml-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(exercise)}
            data-testid={`button-edit-exercise-${exercise.id}`}
            aria-label={`Edit ${exercise.name}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onArchive(exercise)}
            data-testid={`button-archive-exercise-${exercise.id}`}
            aria-label={`Archive ${exercise.name}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex gap-4 text-sm text-muted-foreground">
          {exercise.defaultSets != null && (
            <span>Sets: <span className="font-medium text-foreground">{exercise.defaultSets}</span></span>
          )}
          {exercise.defaultReps != null && (
            <span>Reps: <span className="font-medium text-foreground">{exercise.defaultReps}</span></span>
          )}
          {exercise.exerciseType === "timed" && exercise.defaultDurationSeconds != null && (
            <span>Duration: <span className="font-medium text-foreground">{exercise.defaultDurationSeconds}s</span></span>
          )}
          {exercise.exerciseType === "weighted" && exercise.defaultWeightLbs != null && (
            <span>Weight: <span className="font-medium text-foreground">{exercise.defaultWeightLbs} lbs</span></span>
          )}
        </div>
        {exercise.notes && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{exercise.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}
