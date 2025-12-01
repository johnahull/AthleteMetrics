import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface GlobalAthlete {
  id: string;
  verifiedEmails: string[];
  primaryEmail: string;
  canonicalFirstName: string;
  canonicalLastName: string;
  canonicalFullName: string;
  birthDate: string | null;
  allowCrossOrgLinking: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  linkedUserCount: number;
}

export interface GlobalAthleteStats {
  totalGlobalAthletes: number;
  totalLinkedUsers: number;
  athletesWithMultipleLinks: number;
  recentLinkCount: number;
}

export interface LinkedUser {
  userId: string;
  linkStatus: string;
  linkType: string;
  shareMeasurements: boolean;
  confirmedAt: Date | null;
  organizations: {
    id: string;
    name: string;
    role: string;
  }[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorType: string;
  actorId: string | null;
  details: any;
  createdAt: Date;
}

export interface GlobalAthleteDetails {
  globalAthlete: Omit<GlobalAthlete, 'linkedUserCount'>;
  linkedUsers: LinkedUser[];
  auditLog: AuditLogEntry[];
}

/**
 * Fetch all global athletes with pagination and search
 */
export function useGlobalAthletes(params?: {
  limit?: number;
  offset?: number;
  search?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());
  if (params?.search) queryParams.append('search', params.search);

  const queryString = queryParams.toString();
  const url = `/api/admin/global-athletes${queryString ? `?${queryString}` : ''}`;

  return useQuery<{ athletes: GlobalAthlete[]; count: number }>({
    queryKey: ['/api/admin/global-athletes', params],
    queryFn: async () => {
      const res = await apiRequest('GET', url);
      if (!res.ok) {
        throw new Error('Failed to fetch global athletes');
      }
      return res.json();
    },
  });
}

/**
 * Fetch global athlete statistics
 */
export function useGlobalAthleteStats() {
  return useQuery<GlobalAthleteStats>({
    queryKey: ['/api/admin/global-athletes/stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/global-athletes/stats');
      if (!res.ok) {
        throw new Error('Failed to fetch stats');
      }
      return res.json();
    },
  });
}

/**
 * Fetch global athlete details by ID
 */
export function useGlobalAthleteDetails(id: string) {
  return useQuery<GlobalAthleteDetails>({
    queryKey: ['/api/admin/global-athletes', id],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/admin/global-athletes/${id}`);
      if (!res.ok) {
        throw new Error('Failed to fetch global athlete details');
      }
      return res.json();
    },
    enabled: !!id,
  });
}

/**
 * Force unlink a user from a global athlete
 */
export function useForceUnlink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      globalAthleteId,
      userId,
    }: {
      globalAthleteId: string;
      userId: string;
    }) => {
      const res = await apiRequest(
        'POST',
        `/api/admin/global-athletes/${globalAthleteId}/unlink/${userId}`,
        {}
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to unlink user');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate the detail query to refetch updated data
      queryClient.invalidateQueries({
        queryKey: ['/api/admin/global-athletes', variables.globalAthleteId],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/admin/global-athletes'],
      });
    },
  });
}

/**
 * Update global athlete privacy settings (admin)
 */
export function useAdminUpdatePrivacy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      globalAthleteId,
      allowCrossOrgLinking,
    }: {
      globalAthleteId: string;
      allowCrossOrgLinking: boolean;
    }) => {
      const res = await apiRequest(
        'PATCH',
        `/api/admin/global-athletes/${globalAthleteId}/privacy`,
        { allowCrossOrgLinking }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update privacy settings');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate queries to refetch updated data
      queryClient.invalidateQueries({
        queryKey: ['/api/admin/global-athletes', variables.globalAthleteId],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/admin/global-athletes'],
      });
    },
  });
}
