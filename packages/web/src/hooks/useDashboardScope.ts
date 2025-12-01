import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import type { TimeframePreset } from '@shared/dashboard-timeframe';

export type DashboardView = 'organization' | 'team' | 'athlete';

export interface DashboardScope {
  view: DashboardView;
  organizationId: string | null;
  teamId: string | null;
  athleteId: string | null;
  timeframe: TimeframePreset | 'custom';
  startDate: string | null; // ISO format: YYYY-MM-DD
  endDate: string | null;   // ISO format: YYYY-MM-DD
}

export interface DashboardQueryParams {
  teamId?: string;
  athleteId?: string;
  timeframe?: TimeframePreset | 'custom';
  dateFrom?: string;
  dateTo?: string;
}

export interface DashboardScopeActions {
  scope: DashboardScope;
  setTeamScope: (teamId: string) => void;
  setAthleteScope: (teamId: string, athleteId: string) => void;
  setTimeframe: (
    timeframe: TimeframePreset | 'custom',
    startDate?: string,
    endDate?: string
  ) => void;
  resetScope: () => void;
  getQueryParams: () => DashboardQueryParams;
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

    // Parse timeframe parameters
    const timeframe = (params.get('timeframe') as TimeframePreset | 'custom') || '30d';
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');

    // Validate custom timeframe has dates
    const validTimeframe = timeframe === 'custom' && (!startDate || !endDate) ? '30d' : timeframe;
    const validStartDate = validTimeframe === 'custom' ? startDate : null;
    const validEndDate = validTimeframe === 'custom' ? endDate : null;

    // Validate scope combinations
    if (view === 'team' && teamId) {
      return {
        view: 'team',
        organizationId,
        teamId,
        athleteId: null,
        timeframe: validTimeframe,
        startDate: validStartDate,
        endDate: validEndDate,
      };
    }

    if (view === 'athlete' && teamId && athleteId) {
      return {
        view: 'athlete',
        organizationId,
        teamId,
        athleteId,
        timeframe: validTimeframe,
        startDate: validStartDate,
        endDate: validEndDate,
      };
    }

    // Default to organization view
    return {
      view: 'organization',
      organizationId,
      teamId: null,
      athleteId: null,
      timeframe: validTimeframe,
      startDate: validStartDate,
      endDate: validEndDate,
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
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });
      setLocation('/dashboard', { replace: true });
    }
  }, [organizationId, scope.organizationId, setLocation]);

  // Update URL when scope changes
  const updateUrl = useCallback(
    (newScope: DashboardScope) => {
      const params = new URLSearchParams();

      // Add scope params
      if (newScope.view === 'team' && newScope.teamId) {
        params.set('view', 'team');
        params.set('teamId', newScope.teamId);
      } else if (newScope.view === 'athlete' && newScope.teamId && newScope.athleteId) {
        params.set('view', 'athlete');
        params.set('teamId', newScope.teamId);
        params.set('athleteId', newScope.athleteId);
      }

      // Add timeframe params (only if not default)
      if (newScope.timeframe && newScope.timeframe !== '30d') {
        params.set('timeframe', newScope.timeframe);
      }

      if (newScope.timeframe === 'custom' && newScope.startDate && newScope.endDate) {
        params.set('startDate', newScope.startDate);
        params.set('endDate', newScope.endDate);
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
        timeframe: scope.timeframe,
        startDate: scope.startDate,
        endDate: scope.endDate,
      };
      setScope(newScope);
      updateUrl(newScope);
    },
    [organizationId, scope.timeframe, scope.startDate, scope.endDate, updateUrl]
  );

  // Set athlete scope
  const setAthleteScope = useCallback(
    (teamId: string, athleteId: string) => {
      const newScope: DashboardScope = {
        view: 'athlete',
        organizationId,
        teamId,
        athleteId,
        timeframe: scope.timeframe,
        startDate: scope.startDate,
        endDate: scope.endDate,
      };
      setScope(newScope);
      updateUrl(newScope);
    },
    [organizationId, scope.timeframe, scope.startDate, scope.endDate, updateUrl]
  );

  // Set timeframe
  const setTimeframe = useCallback(
    (
      timeframe: TimeframePreset | 'custom',
      startDate?: string,
      endDate?: string
    ) => {
      const newScope: DashboardScope = {
        ...scope,
        timeframe,
        startDate: timeframe === 'custom' ? (startDate || null) : null,
        endDate: timeframe === 'custom' ? (endDate || null) : null,
      };
      setScope(newScope);
      updateUrl(newScope);
    },
    [scope, updateUrl]
  );

  // Reset to organization scope
  const resetScope = useCallback(() => {
    const newScope: DashboardScope = {
      view: 'organization',
      organizationId,
      teamId: null,
      athleteId: null,
      timeframe: '30d',
      startDate: null,
      endDate: null,
    };
    setScope(newScope);
    updateUrl(newScope);
  }, [organizationId, updateUrl]);

  // Get query params for API requests
  const getQueryParams = useCallback((): DashboardQueryParams => {
    const params: DashboardQueryParams = {};

    if (scope.teamId) {
      params.teamId = scope.teamId;
    }

    if (scope.athleteId) {
      params.athleteId = scope.athleteId;
    }

    // Add timeframe params
    if (scope.timeframe) {
      params.timeframe = scope.timeframe;
    }

    if (scope.timeframe === 'custom' && scope.startDate && scope.endDate) {
      params.dateFrom = scope.startDate;
      params.dateTo = scope.endDate;
    }

    return params;
  }, [scope]);

  return {
    scope,
    setTeamScope,
    setAthleteScope,
    setTimeframe,
    resetScope,
    getQueryParams,
  };
}
