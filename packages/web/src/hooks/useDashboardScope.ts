import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';

export type DashboardView = 'organization' | 'team' | 'athlete';

export interface DashboardScope {
  view: DashboardView;
  organizationId: string | null;
  teamId: string | null;
  athleteId: string | null;
}

export interface DashboardScopeActions {
  scope: DashboardScope;
  setTeamScope: (teamId: string) => void;
  setAthleteScope: (teamId: string, athleteId: string) => void;
  resetScope: () => void;
  getQueryParams: () => Record<string, string>;
}

/**
 * Hook for managing dashboard scope (organization / team / athlete view)
 * Synchronizes scope state with URL query parameters for bookmarkability
 *
 * @param organizationId - The current organization ID
 * @returns Scope state and actions to update scope
 */
export function useDashboardScope(
  organizationId: string | null
): DashboardScopeActions {
  const [, setLocation] = useLocation();

  // Parse initial scope from URL query params
  const parseUrlScope = useCallback((): DashboardScope => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') as DashboardView | null;
    const teamId = params.get('teamId');
    const athleteId = params.get('athleteId');

    // Validate scope combinations
    if (view === 'team' && teamId) {
      return {
        view: 'team',
        organizationId,
        teamId,
        athleteId: null,
      };
    }

    if (view === 'athlete' && teamId && athleteId) {
      return {
        view: 'athlete',
        organizationId,
        teamId,
        athleteId,
      };
    }

    // Default to organization view
    return {
      view: 'organization',
      organizationId,
      teamId: null,
      athleteId: null,
    };
  }, [organizationId]);

  const [scope, setScope] = useState<DashboardScope>(parseUrlScope);

  // Update scope when URL changes (browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      setScope(parseUrlScope());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [parseUrlScope]);

  // Reset scope when organization changes
  useEffect(() => {
    if (scope.organizationId !== organizationId) {
      setScope({
        view: 'organization',
        organizationId,
        teamId: null,
        athleteId: null,
      });
      setLocation('/dashboard', { replace: true });
    }
  }, [organizationId, scope.organizationId, setLocation]);

  // Update URL when scope changes
  const updateUrl = useCallback(
    (newScope: DashboardScope) => {
      const params = new URLSearchParams();

      if (newScope.view === 'team' && newScope.teamId) {
        params.set('view', 'team');
        params.set('teamId', newScope.teamId);
      } else if (newScope.view === 'athlete' && newScope.teamId && newScope.athleteId) {
        params.set('view', 'athlete');
        params.set('teamId', newScope.teamId);
        params.set('athleteId', newScope.athleteId);
      }

      const queryString = params.toString();
      const newPath = queryString ? `/dashboard?${queryString}` : '/dashboard';

      setLocation(newPath, { replace: true });
    },
    [setLocation]
  );

  // Set team scope
  const setTeamScope = useCallback(
    (teamId: string) => {
      const newScope: DashboardScope = {
        view: 'team',
        organizationId,
        teamId,
        athleteId: null,
      };
      setScope(newScope);
      updateUrl(newScope);
    },
    [organizationId, updateUrl]
  );

  // Set athlete scope
  const setAthleteScope = useCallback(
    (teamId: string, athleteId: string) => {
      const newScope: DashboardScope = {
        view: 'athlete',
        organizationId,
        teamId,
        athleteId,
      };
      setScope(newScope);
      updateUrl(newScope);
    },
    [organizationId, updateUrl]
  );

  // Reset to organization scope
  const resetScope = useCallback(() => {
    const newScope: DashboardScope = {
      view: 'organization',
      organizationId,
      teamId: null,
      athleteId: null,
    };
    setScope(newScope);
    updateUrl(newScope);
  }, [organizationId, updateUrl]);

  // Get query params for API requests
  const getQueryParams = useCallback((): Record<string, string> => {
    const params: Record<string, string> = {};

    if (scope.teamId) {
      params.teamId = scope.teamId;
    }

    if (scope.athleteId) {
      params.athleteId = scope.athleteId;
    }

    return params;
  }, [scope]);

  return {
    scope,
    setTeamScope,
    setAthleteScope,
    resetScope,
    getQueryParams,
  };
}
