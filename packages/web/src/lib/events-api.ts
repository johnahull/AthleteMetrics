/**
 * Events API client and React Query hooks
 * Provides type-safe API calls and data fetching hooks for event management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Event,
  InsertEvent,
  EventRegistration,
  EventInvitation,
  EventMetric,
  UpdateEvent,
  Measurement,
} from "@shared/schema";
import { STALE_TIME } from "@/lib/queryClient";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract error message from API response, with fallback
 */
async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const error = await response.json();
    return error.message || fallback;
  } catch {
    // Response might not be JSON (e.g., network errors, CORS errors)
    return fallback;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface EventWithCounts extends Event {
  registrationCount?: number;
  checkedInCount?: number;
  waitlistCount?: number;
}

export interface EventRegistrationWithUser extends EventRegistration {
  userFullName?: string;
  userEmail?: string;
}

export interface EventInvitationWithEvent extends EventInvitation {
  event: Event;
}

export interface RegisterForEventParams {
  eventId: string;
  athleteNotes?: string;
}

// ============================================================================
// API Client Functions - Events
// ============================================================================

/**
 * Fetch events for an organization
 */
export async function fetchEvents(organizationId: string): Promise<EventWithCounts[]> {
  const response = await fetch(`/api/events?organizationId=${encodeURIComponent(organizationId)}`);
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch events');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch athlete's own events (registrations)
 */
export async function fetchMyEvents(): Promise<EventRegistration[]> {
  const response = await fetch('/api/events/my-registrations');
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch my events');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch athlete's pending event invitations
 */
export async function fetchMyPendingInvitations(): Promise<EventInvitationWithEvent[]> {
  const response = await fetch('/api/my/event-invitations');
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch pending invitations');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch public events
 */
export async function fetchPublicEvents(): Promise<EventWithCounts[]> {
  const response = await fetch('/api/events/public');
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch public events');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch single event by ID
 */
export async function fetchEvent(eventId: string): Promise<EventWithCounts> {
  const response = await fetch(`/api/events/${eventId}`);
  if (!response.ok) {
    const defaultMsg = response.status === 404 ? `Event not found` : 'Failed to fetch event';
    const message = await getErrorMessage(response, defaultMsg);
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch event by code (for joining)
 */
export async function fetchEventByCode(eventCode: string): Promise<EventWithCounts> {
  const response = await fetch(`/api/events/join/${eventCode}`);
  if (!response.ok) {
    const defaultMsg = response.status === 404 ? `Invalid event code` : 'Failed to fetch event';
    const message = await getErrorMessage(response, defaultMsg);
    throw new Error(message);
  }
  return response.json();
}

/**
 * Create a new event
 */
export async function createEvent(data: InsertEvent): Promise<Event> {
  const response = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to create event');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Update an event
 */
export async function updateEvent(eventId: string, data: Partial<UpdateEvent>): Promise<Event> {
  const response = await fetch(`/api/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to update event');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Delete an event
 */
export async function deleteEvent(eventId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/events/${eventId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to delete event');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Publish an event (change status from draft to published)
 */
export async function publishEvent(eventId: string): Promise<Event> {
  const response = await fetch(`/api/events/${eventId}/publish`, {
    method: 'POST',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to publish event');
    throw new Error(message);
  }

  return response.json();
}

// ============================================================================
// API Client Functions - Registration
// ============================================================================

/**
 * Register for an event
 */
export async function registerForEvent(params: RegisterForEventParams): Promise<EventRegistration> {
  const response = await fetch(`/api/events/${params.eventId}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ athleteNotes: params.athleteNotes }),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to register for event');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Cancel own registration
 */
export async function cancelRegistration(eventId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/events/${eventId}/my-registration`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to cancel registration');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Fetch registrations for an event (admin)
 */
export async function fetchEventRegistrations(eventId: string): Promise<EventRegistrationWithUser[]> {
  const response = await fetch(`/api/events/${eventId}/registrations`);
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch registrations');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Approve a registration
 */
export async function approveRegistration(eventId: string, registrationId: string): Promise<EventRegistration> {
  const response = await fetch(`/api/events/${eventId}/registrations/${registrationId}/approve`, {
    method: 'POST',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to approve registration');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Decline a registration
 */
export async function declineRegistration(
  eventId: string,
  registrationId: string,
  reason?: string
): Promise<EventRegistration> {
  const response = await fetch(`/api/events/${eventId}/registrations/${registrationId}/decline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to decline registration');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Check in a registration by user ID
 */
export async function checkInRegistration(eventId: string, userId: string): Promise<EventRegistration> {
  const response = await fetch(`/api/events/${eventId}/registrations/${userId}/check-in`, {
    method: 'POST',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to check in');
    throw new Error(message);
  }

  return response.json();
}

// ============================================================================
// API Client Functions - Invitations
// ============================================================================

/**
 * Fetch invitations for an event
 */
export async function fetchEventInvitations(eventId: string): Promise<EventInvitation[]> {
  const response = await fetch(`/api/events/${eventId}/invitations`);
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch invitations');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch invitation by token (public)
 */
export async function fetchInvitationByToken(token: string): Promise<EventInvitation & { event: Event }> {
  const response = await fetch(`/api/event-invitations/${token}`);
  if (!response.ok) {
    const defaultMsg = response.status === 404 ? 'Invalid or expired invitation' : 'Failed to fetch invitation';
    const message = await getErrorMessage(response, defaultMsg);
    throw new Error(message);
  }
  return response.json();
}

/**
 * Accept invitation
 */
export async function acceptInvitation(token: string): Promise<EventRegistration> {
  const response = await fetch(`/api/event-invitations/${token}/accept`, {
    method: 'POST',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to accept invitation');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Decline invitation
 */
export async function declineInvitation(token: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/event-invitations/${token}/decline`, {
    method: 'POST',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to decline invitation');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Create an invitation for an event
 */
export async function createEventInvitation(
  eventId: string,
  data: { userId?: string; email?: string; expiresAt?: string }
): Promise<EventInvitation> {
  const response = await fetch(`/api/events/${eventId}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to create invitation');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Cancel an invitation
 */
export async function cancelInvitation(eventId: string, invitationId: string): Promise<EventInvitation> {
  const response = await fetch(`/api/events/${eventId}/invitations/${invitationId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to cancel invitation');
    throw new Error(message);
  }

  return response.json();
}

// ============================================================================
// API Client Functions - Event Metrics
// ============================================================================

/**
 * Fetch metrics for an event
 */
export async function fetchEventMetrics(eventId: string, includeDetails = true): Promise<EventMetric[]> {
  const url = includeDetails
    ? `/api/events/${eventId}/metrics?includeDetails=true`
    : `/api/events/${eventId}/metrics`;
  const response = await fetch(url);
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch event metrics');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Add a metric to an event
 */
export async function addEventMetric(
  eventId: string,
  data: { metricCode: string; displayOrder?: number; isRequired?: boolean; customLabel?: string }
): Promise<EventMetric> {
  const response = await fetch(`/api/events/${eventId}/metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to add metric');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Remove a metric from an event
 */
export async function removeEventMetric(eventId: string, metricCode: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/events/${eventId}/metrics/${metricCode}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to remove metric');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Update a metric configuration for an event
 */
export async function updateEventMetric(
  eventId: string,
  metricCode: string,
  data: { displayOrder?: number; isRequired?: boolean; customLabel?: string }
): Promise<EventMetric> {
  const response = await fetch(`/api/events/${eventId}/metrics/${metricCode}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to update metric');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Reorder metrics for an event
 */
export async function reorderEventMetrics(
  eventId: string,
  orderedMetricCodes: string[]
): Promise<EventMetric[]> {
  const response = await fetch(`/api/events/${eventId}/metrics/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedMetricCodes }),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to reorder metrics');
    throw new Error(message);
  }

  return response.json();
}

// ============================================================================
// API Client Functions - Freeze
// ============================================================================

/**
 * Freeze an event
 */
export async function freezeEvent(eventId: string, reason?: string): Promise<Event> {
  const response = await fetch(`/api/events/${eventId}/freeze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to freeze event');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Unfreeze an event
 */
export async function unfreezeEvent(eventId: string): Promise<Event> {
  const response = await fetch(`/api/events/${eventId}/unfreeze`, {
    method: 'POST',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to unfreeze event');
    throw new Error(message);
  }

  return response.json();
}

// ============================================================================
// API Client Functions - Results
// ============================================================================

/**
 * Fetch results visibility status for an event
 */
export interface ResultsVisibilityStatus {
  visibility: 'immediate' | 'after_event' | 'manual';
  isPublished: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  eventStatus: string;
}

export async function fetchResultsVisibilityStatus(eventId: string): Promise<ResultsVisibilityStatus> {
  const response = await fetch(`/api/events/${eventId}/results/status`);
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch results status');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Check if results are visible to current user
 */
export interface ResultsVisibilityCheck {
  visible: boolean;
  canViewOwnResults: boolean;
}

export async function checkResultsVisible(eventId: string): Promise<ResultsVisibilityCheck> {
  const response = await fetch(`/api/events/${eventId}/results/visible`);
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to check results visibility');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Publish event results
 */
export async function publishResults(eventId: string): Promise<Event> {
  const response = await fetch(`/api/events/${eventId}/results/publish`, {
    method: 'POST',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to publish results');
    throw new Error(message);
  }

  const data = await response.json();
  return data.event;
}

/**
 * Unpublish event results
 */
export async function unpublishResults(eventId: string): Promise<Event> {
  const response = await fetch(`/api/events/${eventId}/results/unpublish`, {
    method: 'POST',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to unpublish results');
    throw new Error(message);
  }

  const data = await response.json();
  return data.event;
}

/**
 * Update results visibility mode for an event
 */
export async function updateResultsVisibility(
  eventId: string,
  visibility: 'immediate' | 'after_event' | 'manual'
): Promise<Event> {
  const response = await fetch(`/api/events/${eventId}/results/visibility`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility }),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to update results visibility');
    throw new Error(message);
  }

  const data = await response.json();
  return data.event;
}

// ============================================================================
// React Query Hooks - Events
// ============================================================================

/**
 * Hook to fetch events for an organization
 */
export function useEvents(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['events', organizationId],
    queryFn: () => fetchEvents(organizationId!),
    enabled: !!organizationId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch athlete's own events
 */
export function useMyEvents() {
  return useQuery({
    queryKey: ['events', 'my-registrations'],
    queryFn: fetchMyEvents,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch athlete's pending event invitations
 */
export function useMyPendingInvitations() {
  return useQuery({
    queryKey: ['event-invitations', 'my-pending'],
    queryFn: fetchMyPendingInvitations,
    staleTime: STALE_TIME.REALTIME, // 1 minute - invitations need to be fresh
  });
}

/**
 * Hook to fetch public events
 */
export function usePublicEvents() {
  return useQuery({
    queryKey: ['events', 'public'],
    queryFn: fetchPublicEvents,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch single event
 */
export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', eventId],
    queryFn: () => fetchEvent(eventId!),
    enabled: !!eventId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch event by code
 */
export function useEventByCode(eventCode: string | undefined) {
  return useQuery({
    queryKey: ['events', 'code', eventCode],
    queryFn: () => fetchEventByCode(eventCode!),
    enabled: !!eventCode,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to create event
 */
export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createEvent,
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      if (event.organizationId) {
        queryClient.invalidateQueries({ queryKey: ['events', event.organizationId] });
      }
    },
  });
}

/**
 * Hook to update event
 */
export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Partial<UpdateEvent> }) =>
      updateEvent(eventId, data),
    onSuccess: (event, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
  });
}

/**
 * Hook to delete event
 */
export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

/**
 * Hook to publish event
 */
export function usePublishEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: publishEvent,
    onSuccess: (event, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
  });
}

// ============================================================================
// React Query Hooks - Registration
// ============================================================================

/**
 * Hook to register for event
 */
export function useRegisterForEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: registerForEvent,
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events', 'my-registrations'] });
    },
  });
}

/**
 * Hook to cancel registration
 */
export function useCancelRegistration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelRegistration,
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events', 'my-registrations'] });
    },
  });
}

/**
 * Hook to fetch event registrations
 */
export function useEventRegistrations(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', eventId, 'registrations'],
    queryFn: () => fetchEventRegistrations(eventId!),
    enabled: !!eventId,
    staleTime: STALE_TIME.REALTIME,
  });
}

/**
 * Hook to approve registration
 */
export function useApproveRegistration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, registrationId }: { eventId: string; registrationId: string }) =>
      approveRegistration(eventId, registrationId),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'registrations'] });
    },
  });
}

/**
 * Hook to decline registration
 */
export function useDeclineRegistration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, registrationId, reason }: { eventId: string; registrationId: string; reason?: string }) =>
      declineRegistration(eventId, registrationId, reason),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'registrations'] });
    },
  });
}

/**
 * Hook to check in registration
 */
export function useCheckInRegistration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, userId }: { eventId: string; userId: string }) =>
      checkInRegistration(eventId, userId),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'registrations'] });
    },
  });
}

// ============================================================================
// React Query Hooks - Invitations
// ============================================================================

/**
 * Hook to fetch event invitations
 */
export function useEventInvitations(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', eventId, 'invitations'],
    queryFn: () => fetchEventInvitations(eventId!),
    enabled: !!eventId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch invitation by token
 */
export function useInvitationByToken(token: string | undefined) {
  return useQuery({
    queryKey: ['event-invitations', token],
    queryFn: () => fetchInvitationByToken(token!),
    enabled: !!token,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to accept invitation
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: acceptInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event-invitations'] });
    },
  });
}

/**
 * Hook to decline invitation
 */
export function useDeclineInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: declineInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-invitations'] });
    },
  });
}

/**
 * Hook to create event invitation
 */
export function useCreateEventInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: { userId?: string; email?: string; expiresAt?: string } }) =>
      createEventInvitation(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'invitations'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
  });
}

/**
 * Hook to cancel event invitation
 */
export function useCancelInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, invitationId }: { eventId: string; invitationId: string }) =>
      cancelInvitation(eventId, invitationId),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'invitations'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
  });
}

// ============================================================================
// React Query Hooks - Event Metrics
// ============================================================================

/**
 * Hook to fetch event metrics
 */
export function useEventMetrics(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', eventId, 'metrics'],
    queryFn: () => fetchEventMetrics(eventId!),
    enabled: !!eventId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to add metric to event
 */
export function useAddEventMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      data,
    }: {
      eventId: string;
      data: { metricCode: string; displayOrder?: number; isRequired?: boolean; customLabel?: string };
    }) => addEventMetric(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'metrics'] });
    },
  });
}

/**
 * Hook to remove metric from event
 */
export function useRemoveEventMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, metricCode }: { eventId: string; metricCode: string }) =>
      removeEventMetric(eventId, metricCode),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'metrics'] });
    },
  });
}

/**
 * Hook to update event metric configuration
 */
export function useUpdateEventMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      metricCode,
      data,
    }: {
      eventId: string;
      metricCode: string;
      data: { displayOrder?: number; isRequired?: boolean; customLabel?: string };
    }) => updateEventMetric(eventId, metricCode, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'metrics'] });
    },
  });
}

/**
 * Hook to reorder event metrics
 */
export function useReorderEventMetrics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, orderedMetricCodes }: { eventId: string; orderedMetricCodes: string[] }) =>
      reorderEventMetrics(eventId, orderedMetricCodes),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'metrics'] });
    },
  });
}

// ============================================================================
// React Query Hooks - Freeze
// ============================================================================

/**
 * Hook to freeze event
 */
export function useFreezeEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, reason }: { eventId: string; reason?: string }) =>
      freezeEvent(eventId, reason),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
  });
}

/**
 * Hook to unfreeze event
 */
export function useUnfreezeEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unfreezeEvent,
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
  });
}

// ============================================================================
// React Query Hooks - Results
// ============================================================================

/**
 * Hook to fetch results visibility status
 */
export function useResultsVisibilityStatus(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', eventId, 'results', 'status'],
    queryFn: () => fetchResultsVisibilityStatus(eventId!),
    enabled: !!eventId,
    staleTime: STALE_TIME.REALTIME,
  });
}

/**
 * Hook to check results visibility for current user
 */
export function useResultsVisible(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', eventId, 'results', 'visible'],
    queryFn: () => checkResultsVisible(eventId!),
    enabled: !!eventId,
    staleTime: STALE_TIME.REALTIME,
  });
}

/**
 * Hook to publish results
 */
export function usePublishResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: publishResults,
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'results'] });
    },
  });
}

/**
 * Hook to unpublish results
 */
export function useUnpublishResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unpublishResults,
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'results'] });
    },
  });
}

/**
 * Hook to update results visibility mode
 */
export function useUpdateResultsVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      visibility,
    }: {
      eventId: string;
      visibility: 'immediate' | 'after_event' | 'manual';
    }) => updateResultsVisibility(eventId, visibility),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'results'] });
    },
  });
}

// ============================================================================
// API Client Functions - Event Measurements
// ============================================================================

/**
 * Event measurement with user details for display
 */
export interface EventMeasurementWithDetails extends Measurement {
  userFullName?: string;
  userEmail?: string;
  metricLabel?: string;
  metricUnits?: string;
}

/**
 * Event measurement statistics
 */
export interface EventMeasurementStats {
  totalMeasurements: number;
  athleteCount: number;
  metricsRecorded: string[];
  metricsComplete: number;
  metricsTotal: number;
  completionPercentage: number;
}

/**
 * Input for creating an event measurement
 */
export interface CreateEventMeasurementInput {
  userId: string;
  metric: string;
  value: number;
  date: string;
  notes?: string;
}

/**
 * Result from bulk measurement creation
 */
export interface BulkMeasurementResult {
  success: boolean;
  created: Measurement[];
  errors: Array<{
    index: number;
    message: string;
  }>;
}

/**
 * Fetch all measurements for an event
 */
export async function fetchEventMeasurements(
  eventId: string,
  filters?: { userId?: string; metricCode?: string }
): Promise<EventMeasurementWithDetails[]> {
  const params = new URLSearchParams();
  if (filters?.userId) params.append('userId', filters.userId);
  if (filters?.metricCode) params.append('metricCode', filters.metricCode);

  const url = params.toString()
    ? `/api/events/${eventId}/measurements?${params}`
    : `/api/events/${eventId}/measurements`;

  const response = await fetch(url);
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch event measurements');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch measurement statistics for an event
 */
export async function fetchEventMeasurementStats(eventId: string): Promise<EventMeasurementStats> {
  const response = await fetch(`/api/events/${eventId}/measurements/stats`);
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch measurement stats');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Create a measurement for an event
 */
export async function createEventMeasurement(
  eventId: string,
  data: CreateEventMeasurementInput
): Promise<Measurement> {
  const response = await fetch(`/api/events/${eventId}/measurements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to create measurement');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Create multiple measurements for an event (bulk entry)
 */
export async function createEventMeasurementsBulk(
  eventId: string,
  measurements: CreateEventMeasurementInput[]
): Promise<BulkMeasurementResult> {
  const response = await fetch(`/api/events/${eventId}/measurements/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ measurements }),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to create measurements');
    throw new Error(message);
  }

  return response.json();
}

// ============================================================================
// React Query Hooks - Event Measurements
// ============================================================================

/**
 * Hook to fetch event measurements
 */
export function useEventMeasurements(
  eventId: string | undefined,
  filters?: { userId?: string; metricCode?: string }
) {
  return useQuery({
    queryKey: ['events', eventId, 'measurements', filters],
    queryFn: () => fetchEventMeasurements(eventId!, filters),
    enabled: !!eventId,
    staleTime: STALE_TIME.REALTIME,
  });
}

/**
 * Hook to fetch event measurement statistics
 */
export function useEventMeasurementStats(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', eventId, 'measurements', 'stats'],
    queryFn: () => fetchEventMeasurementStats(eventId!),
    enabled: !!eventId,
    staleTime: STALE_TIME.REALTIME,
  });
}

/**
 * Hook to create event measurement
 */
export function useCreateEventMeasurement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      data,
    }: {
      eventId: string;
      data: CreateEventMeasurementInput;
    }) => createEventMeasurement(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'measurements'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'results'] });
    },
  });
}

/**
 * Hook to create multiple event measurements (bulk)
 */
export function useCreateEventMeasurementsBulk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      measurements,
    }: {
      eventId: string;
      measurements: CreateEventMeasurementInput[];
    }) => createEventMeasurementsBulk(eventId, measurements),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'measurements'] });
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'results'] });
    },
  });
}

// ============================================================================
// API Client Functions - Event Reports
// ============================================================================

/**
 * Event report interface with event context
 */
export interface EventReport {
  id: string;
  name: string;
  reportType: 'team' | 'individual';
  organizationId: string;
  config: {
    eventId?: string;
    includeEventPercentiles?: boolean;
    metrics?: string[];
    athleteId?: string;
    athleteIds?: string[];
    timeframe?: {
      type: 'preset' | 'custom';
      preset?: string;
      customStart?: string;
      customEnd?: string;
    };
  };
  createdAt: string;
  createdBy: string;
  coachingInsights?: string;
  coachingInsightsGeneratedAt?: string;
}

/**
 * Input for creating an event report
 */
export interface CreateEventReportInput {
  name: string;
  reportType: 'team' | 'individual';
  athleteIds?: string[];
  includeEventPercentiles?: boolean;
  generateAiInsights?: boolean;
  metrics?: string[];
}

/**
 * Event context returned with reports
 */
export interface EventReportContext {
  eventId: string;
  eventName: string;
  eventDate: string;
  participantCount: number;
}

/**
 * Generated report data
 */
export interface GeneratedEventReportData {
  report: EventReport;
  generatedAt: string;
  eventContext?: EventReportContext;
  teamStatistics?: Array<{
    metric: string;
    average: number | null;
    median: number | null;
    min: number | null;
    max: number | null;
  }>;
  athleteRankings?: Array<{
    userId: string;
    userName: string;
    measurements: Record<string, number>;
    percentiles?: Record<string, number>;
    eventPercentiles?: Record<string, number>;
  }>;
  athlete?: {
    userId: string;
    userName: string;
    measurements: Record<string, number>;
    percentiles?: Record<string, number>;
    eventPercentiles?: Record<string, number>;
  };
}

/**
 * Fetch reports associated with an event
 */
export async function fetchEventReports(eventId: string): Promise<EventReport[]> {
  const response = await fetch(`/api/events/${eventId}/reports`);
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch event reports');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Create a report for an event
 */
export async function createEventReport(
  eventId: string,
  data: CreateEventReportInput
): Promise<EventReport> {
  const response = await fetch(`/api/events/${eventId}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to create event report');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Generate a quick one-click report for an event
 * Creates and immediately generates report data
 */
export async function generateQuickEventReport(
  eventId: string,
  reportType: 'team' | 'individual'
): Promise<GeneratedEventReportData> {
  const response = await fetch(`/api/events/${eventId}/quick-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportType }),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to generate quick report');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Generate AI coaching insights for an event report
 */
export async function generateEventReportInsights(
  reportId: string
): Promise<{ insights: string; generatedAt: string; model: string }> {
  const response = await fetch(`/api/reports/${reportId}/generate-insights`, {
    method: 'POST',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to generate AI insights');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Export event report as PDF
 */
export async function exportEventReportPDF(
  reportId: string,
  athleteId?: string
): Promise<Blob> {
  const params = new URLSearchParams();
  if (athleteId) params.append('athleteId', athleteId);

  const url = params.toString()
    ? `/api/reports/${reportId}/pdf?${params}`
    : `/api/reports/${reportId}/pdf`;

  const response = await fetch(url);

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to export PDF');
    throw new Error(message);
  }

  return response.blob();
}

// ============================================================================
// React Query Hooks - Event Reports
// ============================================================================

/**
 * Hook to fetch event reports
 */
export function useEventReports(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', eventId, 'reports'],
    queryFn: () => fetchEventReports(eventId!),
    enabled: !!eventId,
    // Use REALTIME to ensure reports list is always fresh after generation
    staleTime: STALE_TIME.REALTIME,
  });
}

/**
 * Hook to create an event report
 */
export function useCreateEventReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      data,
    }: {
      eventId: string;
      data: CreateEventReportInput;
    }) => createEventReport(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

/**
 * Hook to generate a quick event report
 */
export function useGenerateQuickEventReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      reportType,
    }: {
      eventId: string;
      reportType: 'team' | 'individual';
    }) => generateQuickEventReport(eventId, reportType),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events', eventId, 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

/**
 * Hook to generate AI insights for an event report
 */
export function useGenerateEventReportInsights() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: generateEventReportInsights,
    onSuccess: (_, reportId) => {
      queryClient.invalidateQueries({ queryKey: ['reports', reportId] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

/**
 * Hook to export event report as PDF
 */
export function useExportEventReportPDF() {
  return useMutation({
    mutationFn: ({
      reportId,
      athleteId,
    }: {
      reportId: string;
      athleteId?: string;
    }) => exportEventReportPDF(reportId, athleteId),
  });
}
