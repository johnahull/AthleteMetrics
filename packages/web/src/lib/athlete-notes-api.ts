/**
 * Athlete coaching notes (AM-FEAT-025): API client and React Query hooks.
 * The server decides who may see notes: a 404 on the list means "not a coach or admin of any of this athlete's organizations".
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AthleteNoteCategory } from "@shared/athlete-notes";

export interface AthleteNoteRow {
  id: string;
  athleteId: string;
  organizationId: string;
  organizationName: string;
  authorId: string | null;
  authorName: string | null;
  eventId: string | null;
  eventName: string | null;
  category: AthleteNoteCategory | null;
  flagged: boolean;
  /** Calendar date, YYYY-MM-DD */
  observedOn: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** The list the server returns: the notes the viewer may see, and where a note can be added for this athlete */
export interface AthleteNotesResponse {
  notes: AthleteNoteRow[];
  writableOrganizations: Array<{ id: string; name: string }>;
}

export interface AthleteNoteFields {
  body: string;
  observedOn: string;
  category?: AthleteNoteCategory | null;
  flagged?: boolean;
  eventId?: string | null;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Request failed");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const athleteNotesKey = (athleteId: string) => ["/api/athletes", athleteId, "notes"] as const;

/** Notes about one athlete. An error (404) means the viewer may not see notes for this athlete. */
export function useAthleteNotes(athleteId: string | undefined) {
  return useQuery({
    queryKey: athleteNotesKey(athleteId ?? ""),
    queryFn: () => request<AthleteNotesResponse>(`/api/athletes/${athleteId}/notes`),
    enabled: !!athleteId,
    retry: false,
  });
}

export function useCreateAthleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ athleteId, organizationId, ...fields }: AthleteNoteFields & { athleteId: string; organizationId: string }) =>
      request<{ note: AthleteNoteRow }>(`/api/athletes/${athleteId}/notes`, {
        method: "POST",
        body: JSON.stringify({ ...fields, organizationId }),
      }),
    onSuccess: (_data, vars) => queryClient.invalidateQueries({ queryKey: athleteNotesKey(vars.athleteId) }),
  });
}

export function useUpdateAthleteNote(athleteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: Partial<AthleteNoteFields> & { id: string }) =>
      request<{ note: AthleteNoteRow }>(`/api/athlete-notes/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: athleteNotesKey(athleteId) }),
  });
}

export function useDeleteAthleteNote(athleteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/api/athlete-notes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: athleteNotesKey(athleteId) }),
  });
}
