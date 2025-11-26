import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type {
  WellnessRequest,
  CreateWellnessRequest,
  RequestStatus,
} from '@shared/wellness-types';

interface UseWellnessRequestsOptions {
  organizationId: string;
  status?: RequestStatus;
}

/**
 * Fetch all wellness requests for an organization
 */
export function useWellnessRequests(options: UseWellnessRequestsOptions) {
  const { organizationId, status } = options;

  return useQuery<WellnessRequest[]>({
    queryKey: ['/api/wellness/requests', organizationId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) {
        params.set('status', status);
      }

      const response = await apiRequest(
        'GET',
        `/api/organizations/${organizationId}/wellness/requests?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch wellness requests');
      }

      return response.json();
    },
    enabled: !!organizationId,
  });
}

/**
 * Fetch single wellness request by ID
 */
export function useWellnessRequest(requestId: string, organizationId: string) {
  return useQuery<WellnessRequest>({
    queryKey: ['/api/wellness/requests', requestId],
    queryFn: async () => {
      const response = await apiRequest(
        'GET',
        `/api/organizations/${organizationId}/wellness/requests/${requestId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch wellness request');
      }

      return response.json();
    },
    enabled: !!requestId && !!organizationId,
  });
}

/**
 * Create a new wellness request
 */
export function useCreateWellnessRequest(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWellnessRequest) => {
      const response = await apiRequest(
        'POST',
        `/api/organizations/${organizationId}/wellness/requests`,
        data
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create wellness request');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate requests list
      queryClient.invalidateQueries({
        queryKey: ['/api/wellness/requests', organizationId],
      });
    },
  });
}

/**
 * Cancel an active wellness request
 */
export function useCancelWellnessRequest(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiRequest(
        'PUT',
        `/api/organizations/${organizationId}/wellness/requests/${requestId}/cancel`,
        {}
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to cancel wellness request');
      }

      return response.json();
    },
    onSuccess: (_, requestId) => {
      // Invalidate both list and single request queries
      queryClient.invalidateQueries({
        queryKey: ['/api/wellness/requests', organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/wellness/requests', requestId],
      });
    },
  });
}

/**
 * Delete a wellness request permanently
 */
export function useDeleteWellnessRequest(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiRequest(
        'DELETE',
        `/api/organizations/${organizationId}/wellness/requests/${requestId}`,
        undefined
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete wellness request');
      }

      // 204 No Content has no body
      return;
    },
    onSuccess: (_, requestId) => {
      // Invalidate both list and single request queries
      queryClient.invalidateQueries({
        queryKey: ['/api/wellness/requests', organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/wellness/requests', requestId],
      });
    },
  });
}

/**
 * Get completion rate for a wellness request
 * Returns { completed: number, total: number, rate: number }
 */
export function useRequestCompletionRate(requestId: string, organizationId: string) {
  return useQuery<{ completed: number; total: number; rate: number }>({
    queryKey: ['/api/wellness/requests/completion', requestId],
    queryFn: async () => {
      // Fetch the request to get target athletes
      const request = await apiRequest(
        'GET',
        `/api/organizations/${organizationId}/wellness/requests/${requestId}`
      ).then(res => res.json());

      // Calculate total targets
      const total = (request.targetAthleteIds?.length || 0) + (request.targetTeamIds?.length || 0);

      // Fetch responses for this request
      const responses = await apiRequest(
        'GET',
        `/api/wellness/responses?requestId=${requestId}`
      ).then(res => res.json()).catch(() => []);

      const completed = responses.length;
      const rate = total > 0 ? (completed / total) * 100 : 0;

      return { completed, total, rate };
    },
    enabled: !!requestId && !!organizationId,
  });
}
