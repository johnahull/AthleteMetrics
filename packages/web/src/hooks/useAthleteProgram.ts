/**
 * useAthleteProgram
 *
 * Fetches an assignment with computed schedule (scheduledDate, logStatus per day).
 * Query key: ["training", "assignments", assignmentId]
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ScheduledWorkout } from "@/components/training/AthleteScheduleView";
import type { TrainingProgram } from "./useTrainingPrograms";

export interface AthleteProgram {
  id: string;
  athleteId: string;
  programId: string;
  organizationId: string;
  startDate: string;
  status: "active" | "completed" | "cancelled";
  completedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  program: TrainingProgram;
  schedule: ScheduledWorkout[];
}

export function useAthleteProgram(assignmentId: string | null) {
  return useQuery<AthleteProgram>({
    queryKey: ["training", "assignments", assignmentId],
    queryFn: async () => {
      const response = await fetch(`/api/training/assignments/${assignmentId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch assignment: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!assignmentId,
  });
}

export function useTrainingAssignments(orgId: string | null) {
  return useQuery<AthleteProgram[]>({
    queryKey: ["training", "assignments", orgId],
    queryFn: async () => {
      const response = await fetch("/api/training/assignments", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch assignments: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!orgId,
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      athleteId: string;
      programId: string;
      startDate: string;
    }) => {
      const response = await apiRequest("POST", "/api/training/assignments", data);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? `Assignment failed: ${response.status}`);
      }
      return response.json() as Promise<AthleteProgram>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "assignments"] });
    },
  });
}

export function useUpdateAssignmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      assignmentId,
      status,
    }: {
      assignmentId: string;
      status: "completed" | "cancelled";
    }) => {
      const response = await apiRequest(
        "PUT",
        `/api/training/assignments/${assignmentId}/status`,
        { status }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "assignments"] });
    },
  });
}
