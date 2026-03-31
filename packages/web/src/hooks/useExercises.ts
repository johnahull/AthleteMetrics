/**
 * useExercises
 *
 * TanStack Query hook for the exercise library.
 * Query key: ["training", "exercises", orgId]
 * Endpoint: GET /api/training/exercises
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Exercise } from "@/components/training/ExerciseCard";

export function useExercises(orgId: string | null) {
  return useQuery<Exercise[]>({
    queryKey: ["training", "exercises", orgId],
    queryFn: async () => {
      const response = await fetch("/api/training/exercises", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch exercises: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!orgId,
  });
}

export function useCreateExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Exercise>) => {
      const response = await apiRequest("POST", "/api/training/exercises", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "exercises"] });
    },
  });
}

export function useUpdateExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Exercise> & { id: string }) => {
      const response = await apiRequest("PUT", `/api/training/exercises/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "exercises"] });
    },
  });
}

export function useArchiveExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/training/exercises/${id}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? `Archive failed: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "exercises"] });
    },
  });
}
