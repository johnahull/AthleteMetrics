/**
 * useAthleteContext Hook
 *
 * Determines which athlete to display based on route context:
 * - If URL has :id param (e.g., /athletes/123/dashboard): use that ID (coach view)
 * - If no :id param (e.g., /my-profile, /my-dashboard): use logged-in user's athleteId (self-view)
 *
 * This enables code reuse between athlete self-view and coach view components.
 */

import { useParams } from 'wouter';
import { useAuth } from '@/lib/auth';

export interface AthleteContextResult {
  /** The athlete ID to display - from route params or session */
  athleteId: string | undefined;
  /** True if viewing own profile/dashboard */
  isOwnProfile: boolean;
  /** True if user has permission to view this athlete */
  canView: boolean;
  /** True if user has permission to edit this athlete's data */
  canEdit: boolean;
  /** Loading state while auth is being resolved */
  isLoading: boolean;
}

export function useAthleteContext(): AthleteContextResult {
  const params = useParams<{ id?: string }>();
  const { user, isLoading } = useAuth();

  // Extract athlete ID from route params if present
  const routeAthleteId = params.id;

  // Determine the effective athlete ID
  // Priority: route param > user's athleteId
  const athleteId = routeAthleteId || user?.athleteId;

  // Check if viewing own profile
  const isOwnProfile = !routeAthleteId || routeAthleteId === user?.athleteId;

  // Determine view permissions
  // Athletes can view their own data
  // Coaches and org_admins can view athletes in their org
  // Site admins can view any athlete
  //
  // SECURITY NOTE: These are CLIENT-SIDE permission hints for UI rendering only.
  // The backend API MUST enforce organization-level access control.
  // A coach/org_admin should only access athletes within their organization,
  // but this hook cannot verify org membership - it only checks the role.
  // Backend routes (e.g., GET /api/athletes/:id) must validate that the
  // requesting user's organizationId matches the athlete's organizationId.
  const canView = (() => {
    if (!user || !athleteId) return false;
    if (isOwnProfile) return true;
    if (user.isSiteAdmin) return true;
    if (user.role === 'coach' || user.role === 'org_admin') return true;
    return false;
  })();

  // Determine edit permissions
  // Only coaches, org_admins, and site admins can edit measurements
  //
  // SECURITY NOTE: Same as canView - backend API must validate org membership.
  const canEdit = (() => {
    if (!user || !athleteId) return false;
    if (user.isSiteAdmin) return true;
    if (user.role === 'coach' || user.role === 'org_admin') return true;
    return false;
  })();

  return {
    athleteId,
    isOwnProfile,
    canView,
    canEdit,
    isLoading,
  };
}

/**
 * Helper hook for getting athlete paths based on context
 */
export function useAthletePaths() {
  const { athleteId, isOwnProfile } = useAthleteContext();

  const getProfilePath = () => {
    return isOwnProfile ? '/my-profile' : `/athletes/${athleteId}/profile`;
  };

  const getDashboardPath = () => {
    return isOwnProfile ? '/my-dashboard' : `/athletes/${athleteId}/dashboard`;
  };

  return {
    profilePath: getProfilePath(),
    dashboardPath: getDashboardPath(),
    getProfilePath,
    getDashboardPath,
  };
}
