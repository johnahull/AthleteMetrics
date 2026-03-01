/**
 * useTrainingPrograms
 *
 * TanStack Query hooks for training programs.
 * List query key: ["training", "programs", orgId]
 * Detail query key: ["training", "programs", programId, "detail"]
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ProgramWorkout } from "@/components/training/ProgramWorkoutCard";
import type { ProgramWorkoutExercise } from "@/components/training/ProgramWorkoutExerciseRow";

export interface TrainingProgram {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  sport: string | null;
  durationWeeks: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingProgramWithWorkouts extends TrainingProgram {
  workouts: ProgramWorkout[];
}

export function useTrainingPrograms(orgId: string | null) {
  return useQuery<TrainingProgram[]>({
    queryKey: ["training", "programs", orgId],
    queryFn: async () => {
      const response = await fetch("/api/training/programs", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch programs: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!orgId,
  });
}

export function useTrainingProgram(programId: string | null) {
  return useQuery<TrainingProgramWithWorkouts>({
    queryKey: ["training", "programs", programId, "detail"],
    queryFn: async () => {
      const response = await fetch(`/api/training/programs/${programId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch program: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!programId,
  });
}

export function useCreateProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; description?: string; sport?: string; durationWeeks: number }) => {
      const response = await apiRequest("POST", "/api/training/programs", data);
      return response.json() as Promise<TrainingProgram>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "programs"] });
    },
  });
}

export function useUpdateProgram(programId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<TrainingProgram>) => {
      const response = await apiRequest("PUT", `/api/training/programs/${programId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "programs", programId] });
      queryClient.invalidateQueries({ queryKey: ["training", "programs"] });
    },
  });
}

export function useArchiveProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (programId: string) => {
      const response = await apiRequest("DELETE", `/api/training/programs/${programId}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? `Archive failed: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "programs"] });
    },
  });
}

// -- Workout day mutations --

export function useAddWorkoutDay(programId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name?: string; notes?: string }) => {
      const response = await apiRequest("POST", `/api/training/programs/${programId}/workouts`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "programs", programId, "detail"] });
    },
  });
}

export function useReorderWorkoutDays(programId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const response = await apiRequest(
        "PUT",
        `/api/training/programs/${programId}/workouts/reorder`,
        { order: orderedIds }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "programs", programId, "detail"] });
    },
  });
}

// -- Exercise prescription mutations --

export function useAddExerciseToWorkout(programId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workoutId, exerciseId }: { workoutId: string; exerciseId: string }) => {
      const response = await apiRequest(
        "POST",
        `/api/training/workouts/${workoutId}/exercises`,
        { exerciseId }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "programs", programId, "detail"] });
    },
  });
}

export function useUpdateExercisePrescription(programId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      prescriptionId,
      updates,
    }: {
      prescriptionId: string;
      updates: Partial<ProgramWorkoutExercise>;
    }) => {
      const response = await apiRequest(
        "PUT",
        `/api/training/workout-exercises/${prescriptionId}`,
        updates
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "programs", programId, "detail"] });
    },
  });
}

export function useRemoveExerciseFromWorkout(programId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prescriptionId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/training/workout-exercises/${prescriptionId}`
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? `Remove failed: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "programs", programId, "detail"] });
    },
  });
}
