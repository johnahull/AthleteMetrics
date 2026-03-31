/**
 * useWorkoutLog
 *
 * Hooks for fetching and mutating workout logs.
 * Query key: ["training", "logs", logId]
 * Includes create, update, and upsert-entries mutations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { WorkoutSet } from "@shared/schema/validation";

export interface WorkoutLogEntry {
  id: string;
  workoutLogId: string;
  exerciseId: string;
  exerciseNameSnapshot: string;
  exerciseType: string;
  sets: WorkoutSet[];
  qualityRating: number | null;
  durationSeconds: number | null;
  notes: string | null;
  createdAt: string;
}

export interface WorkoutLog {
  id: string;
  athleteProgramId: string;
  programWorkoutId: string;
  loggedBy: string | null;
  status: "completed" | "partial" | "skipped";
  loggedAt: string;
  notes: string | null;
  rpe: number | null;
  durationMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  entries: WorkoutLogEntry[];
}

export interface CreateWorkoutLogPayload {
  athleteProgramId: string;
  programWorkoutId: string;
  status: "completed" | "partial" | "skipped";
  notes?: string;
  rpe?: number;
  durationMinutes?: number;
  entries: Array<{
    exerciseId: string;
    exerciseNameSnapshot: string;
    exerciseType: string;
    sets: WorkoutSet[];
    qualityRating?: number | null;
    durationSeconds?: number | null;
    notes?: string;
  }>;
}

export function useWorkoutLog(logId: string | null) {
  return useQuery<WorkoutLog>({
    queryKey: ["training", "logs", logId],
    queryFn: async () => {
      const response = await fetch(`/api/training/logs/${logId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch workout log: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!logId,
  });
}

export function useCreateWorkoutLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWorkoutLogPayload) => {
      const response = await apiRequest("POST", "/api/training/logs", data);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? `Log failed: ${response.status}`);
      }
      return response.json() as Promise<WorkoutLog>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "logs"] });
      queryClient.invalidateQueries({ queryKey: ["training", "my-program"] });
      queryClient.invalidateQueries({ queryKey: ["training", "assignments"] });
    },
  });
}

export function useUpdateWorkoutLog(logId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<CreateWorkoutLogPayload>) => {
      const response = await apiRequest("PUT", `/api/training/logs/${logId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "logs", logId] });
      queryClient.invalidateQueries({ queryKey: ["training", "my-program"] });
    },
  });
}

export function useUpsertWorkoutLogEntries(logId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entries: WorkoutLogEntry[]) => {
      const response = await apiRequest("PUT", `/api/training/logs/${logId}/entries`, { entries });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "logs", logId] });
    },
  });
}
