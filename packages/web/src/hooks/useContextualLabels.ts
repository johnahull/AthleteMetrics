/**
 * React Hook for Contextual Labels
 *
 * Provides organization-type-specific terminology throughout the application.
 * Automatically detects the current organization context and returns appropriate labels.
 *
 * @fileoverview Custom React hook that:
 * - Fetches current organization's type from context
 * - Returns memoized contextual labels (Team/Group/Squad, etc.)
 * - Falls back gracefully when organization context is unavailable
 * - Optimized with React Query caching
 *
 * @author AthleteMetrics System
 * @version 1.0.0
 * @since 2025-11-15
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import {
  getGroupLabel,
  getCoachLabel,
  getAthleteLabel,
  getContextualLabels,
  type ContextualTerminology,
} from '@shared/contextual-labels';
import type { OrganizationType } from '@shared/organization-type-utils';

/**
 * Contextual labels with convenient accessor properties
 */
export interface ContextualLabels {
  /** Organization type (e.g., 'private_facility', 'high_school') */
  readonly orgType: OrganizationType | null;

  /** Singular form: "Team", "Group", or "Squad" */
  readonly team: string;

  /** Plural form: "Teams", "Groups", or "Squads" */
  readonly teams: string;

  /** Singular form: "Coach" or "Trainer" */
  readonly coach: string;

  /** Plural form: "Coaches" or "Trainers" */
  readonly coaches: string;

  /** Singular form: "Athlete", "Player", or "Client" */
  readonly athlete: string;

  /** Plural form: "Athletes", "Players", or "Clients" */
  readonly athletes: string;

  /** Complete terminology set for advanced usage */
  readonly all: ContextualTerminology;

  /** Whether the organization data is currently loading */
  readonly isLoading: boolean;

  /** Error object if organization fetch failed */
  readonly error: Error | null;
}

/**
 * Fetch current organization data
 *
 * @param organizationId - The organization ID from auth context
 * @returns Organization data including orgType
 */
/**
 * Cache duration for organization data (5 minutes)
 * Organization type rarely changes, so we use a longer cache duration.
 * This matches the CACHE_DURATION_MS in organization-type-service.ts for consistency.
 */
const ORGANIZATION_CACHE_DURATION_MS = 5 * 60 * 1000;

function useOrganization(organizationId: string | null) {
  return useQuery({
    queryKey: ['organizations', organizationId, 'details'],
    queryFn: async () => {
      if (!organizationId) return null;

      const response = await fetch(`/api/organizations/${organizationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch organization');
      }
      return response.json() as Promise<{ id: string; orgType: OrganizationType }>;
    },
    enabled: !!organizationId,
    staleTime: ORGANIZATION_CACHE_DURATION_MS,
    // Limit retries to prevent infinite retry loops on persistent errors
    // After 2 retries (3 total attempts), fall back to default labels
    retry: 2,
    // Exponential backoff: 1s, 2s for the 2 retries
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to get contextual labels based on current organization type
 *
 * @returns Contextual labels object with all terminology variants
 *
 * @example
 * ```typescript
 * function TeamsPage() {
 *   const labels = useContextualLabels();
 *
 *   return (
 *     <div>
 *       <h1>{labels.teams} Management</h1>
 *       <Button>Add {labels.team}</Button>
 *       <p>Managed by {labels.coaches}</p>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Private Facility (orgType: 'private_facility')
 * labels.team     // "Group"
 * labels.teams    // "Groups"
 * labels.coach    // "Trainer"
 * labels.athlete  // "Client"
 *
 * // High School (orgType: 'high_school')
 * labels.team     // "Team"
 * labels.teams    // "Teams"
 * labels.coach    // "Coach"
 * labels.athlete  // "Athlete"
 * ```
 */
export function useContextualLabels(): ContextualLabels {
  const { organizationContext } = useAuth();
  const { data: organization, isLoading, error } = useOrganization(organizationContext);

  return useMemo(() => {
    const orgType = organization?.orgType ?? null;
    const allLabels = getContextualLabels(orgType);

    // Log errors for debugging in development (non-blocking)
    if (error && import.meta.env.DEV) {
      console.error('Failed to fetch organization for contextual labels:', error);
    }

    return {
      orgType,
      team: getGroupLabel(orgType, false),
      teams: getGroupLabel(orgType, true),
      coach: getCoachLabel(orgType, false),
      coaches: getCoachLabel(orgType, true),
      athlete: getAthleteLabel(orgType, false),
      athletes: getAthleteLabel(orgType, true),
      all: allLabels,
      isLoading,
      error: error as Error | null,
    };
  }, [organization?.orgType, isLoading, error]);
}

/**
 * Hook variant that accepts an explicit organization type
 * Useful for components that display labels for a specific org type
 *
 * @param orgType - Explicit organization type (optional)
 * @returns Contextual labels for the specified organization type
 *
 * @example
 * ```typescript
 * function OrgTypePreview({ orgType }: { orgType: OrganizationType }) {
 *   const labels = useContextualLabelsFor(orgType);
 *
 *   return (
 *     <div>
 *       <p>This organization uses: {labels.teams}</p>
 *       <p>Managed by: {labels.coaches}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useContextualLabelsFor(orgType: OrganizationType | null | undefined): ContextualLabels {
  return useMemo(() => {
    const normalizedOrgType = orgType ?? null;
    const allLabels = getContextualLabels(normalizedOrgType);

    return {
      orgType: normalizedOrgType,
      team: getGroupLabel(normalizedOrgType, false),
      teams: getGroupLabel(normalizedOrgType, true),
      coach: getCoachLabel(normalizedOrgType, false),
      coaches: getCoachLabel(normalizedOrgType, true),
      athlete: getAthleteLabel(normalizedOrgType, false),
      athletes: getAthleteLabel(normalizedOrgType, true),
      all: allLabels,
      isLoading: false, // Static labels, no loading state
      error: null, // Static labels, no error state
    };
  }, [orgType]);
}
