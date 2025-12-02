/**
 * useGlobalAthlete Hook
 *
 * Provides access to cross-organization athlete identity data:
 * - Global athlete profile
 * - Linked accounts across organizations
 * - Unified measurements
 * - Privacy settings management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export interface LinkedAccount {
  userId: string;
  linkStatus: 'pending' | 'confirmed' | 'rejected' | 'revoked';
  linkType: 'auto_email' | 'athlete_claimed' | 'org_proposed' | 'admin_forced';
  shareMeasurements: boolean;
  confirmedAt: string | null;
  organizations: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

export interface GlobalAthleteProfile {
  hasGlobalAthlete: boolean;
  globalAthlete?: {
    id: string;
    primaryEmail: string;
    verifiedEmails: string[];
    canonicalFirstName: string;
    canonicalLastName: string;
    canonicalFullName: string;
    birthDate: string | null;
    allowCrossOrgLinking: boolean;
    createdAt: string;
  };
  currentLink?: {
    linkStatus: string;
    linkType: string;
    shareMeasurements: boolean;
    confirmedAt: string | null;
  };
  linkedAccounts: LinkedAccount[];
  linkedAccountCount: number;
}

export interface UnifiedMeasurement {
  id: string;
  userId: string;
  date: string;
  metric: string;
  value: string;
  units: string;
  organizationId: string | null;
  organizationName: string | null;
  notes: string | null;
  createdAt: string;
}

export interface UnifiedMeasurementsResponse {
  measurements: UnifiedMeasurement[];
  totalCount: number;
  organizationsRepresented: number;
}

export interface UnifiedDashboardData {
  hasGlobalAthlete: boolean;
  globalAthlete?: {
    id: string;
    canonicalFullName: string;
    allowCrossOrgLinking: boolean;
  };
  linkedAccountCount: number;
  organizations: Array<{ id: string; name: string }>;
  measurementCount: number;
  metricStats: Record<string, {
    count: number;
    latest: any;
    best: any;
  }>;
  recentMeasurements: UnifiedMeasurement[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorType: string;
  details: Record<string, any>;
  createdAt: string;
}

export interface AuditLogResponse {
  auditLog: AuditLogEntry[];
  totalCount: number;
}

/**
 * Hook to fetch the current user's global athlete profile
 */
export function useGlobalAthleteProfile() {
  return useQuery<GlobalAthleteProfile>({
    queryKey: ['/api/my/global-athlete'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry on 404 (no global athlete)
  });
}

/**
 * Hook to fetch unified measurements across all linked accounts
 */
export function useUnifiedMeasurements() {
  return useQuery<UnifiedMeasurementsResponse>({
    queryKey: ['/api/my/unified-measurements'],
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });
}

/**
 * Hook to fetch unified dashboard data
 */
export function useUnifiedDashboard() {
  return useQuery<UnifiedDashboardData>({
    queryKey: ['/api/my/unified-dashboard'],
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });
}

/**
 * Hook to fetch global athlete audit log
 */
export function useGlobalAthleteAuditLog() {
  return useQuery<AuditLogResponse>({
    queryKey: ['/api/my/global-athlete/audit-log'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Hook to update privacy settings (allowCrossOrgLinking)
 */
export function useUpdatePrivacySettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (allowCrossOrgLinking: boolean) => {
      const response = await fetch('/api/my/global-athlete/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ allowCrossOrgLinking }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update privacy settings');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/my/global-athlete'] });
      queryClient.invalidateQueries({ queryKey: ['/api/my/global-athlete/audit-log'] });
      toast({
        title: 'Privacy settings updated',
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update privacy settings',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to update sharing settings (shareMeasurements)
 */
export function useUpdateSharingSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (shareMeasurements: boolean) => {
      const response = await fetch('/api/my/global-athlete/sharing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shareMeasurements }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update sharing settings');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/my/global-athlete'] });
      queryClient.invalidateQueries({ queryKey: ['/api/my/unified-measurements'] });
      toast({
        title: 'Sharing settings updated',
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update sharing settings',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
