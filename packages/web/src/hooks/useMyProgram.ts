/**
 * useMyProgram
 *
 * Athlete-facing hooks for their own active training plan.
 * Query key: ["training", "my-program"]
 * Endpoint: GET /api/training/my-program
 * Also exports useMyProgramToday for today's workout.
 */

import { useQuery } from "@tanstack/react-query";
import type { AthleteProgram } from "./useAthleteProgram";

export interface TodayWorkout {
  workoutId: string;
  dayNumber: number;
  name: string | null;
  scheduledDate: string;
  exercises: Array<{
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
  }>;
  existingLog: {
    id: string;
    status: string;
  } | null;
}

export function useMyProgram() {
  return useQuery<AthleteProgram | null>({
    queryKey: ["training", "my-program"],
    queryFn: async () => {
      const response = await fetch("/api/training/my-program", {
        credentials: "include",
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Failed to fetch my program: ${response.status}`);
      }
      return response.json();
    },
  });
}

export function useMyProgramToday() {
  return useQuery<TodayWorkout | null>({
    queryKey: ["training", "my-program", "today"],
    queryFn: async () => {
      const response = await fetch("/api/training/my-program/today", {
        credentials: "include",
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Failed to fetch today's workout: ${response.status}`);
      }
      return response.json();
    },
  });
}
