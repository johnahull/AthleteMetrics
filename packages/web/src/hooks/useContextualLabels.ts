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
}

/**
 * Fetch current organization data
 *
 * @param organizationId - The organization ID from auth context
 * @returns Organization data including orgType
 */
function useOrganization(organizationId: string | null) {
  return useQuery({
    queryKey: [`/api/organizations/${organizationId}`],
    queryFn: async () => {
      if (!organizationId) return null;

      const response = await fetch(`/api/organizations/${organizationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch organization');
      }
      return response.json() as Promise<{ id: string; orgType: OrganizationType }>;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes - org type rarely changes
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
  const { data: organization } = useOrganization(organizationContext);

  return useMemo(() => {
    const orgType = organization?.orgType ?? null;
    const allLabels = getContextualLabels(orgType);

    return {
      orgType,
      team: getGroupLabel(orgType, false),
      teams: getGroupLabel(orgType, true),
      coach: getCoachLabel(orgType, false),
      coaches: getCoachLabel(orgType, true),
      athlete: getAthleteLabel(orgType, false),
      athletes: getAthleteLabel(orgType, true),
      all: allLabels,
    };
  }, [organization?.orgType]);
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
    };
  }, [orgType]);
}
