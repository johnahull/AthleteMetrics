import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardScope } from '../useDashboardScope';

// Mock wouter
const mockLocation = '/dashboard';
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => [mockLocation, mockSetLocation],
  useSearch: () => {
    const params = new URLSearchParams(window.location.search);
    return params.toString();
  },
}));

describe('useDashboardScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset URL
    window.history.replaceState({}, '', '/dashboard');
  });

  describe('Default State', () => {
    it('should initialize with organization scope when no URL params', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      expect(result.current.scope).toEqual({
        view: 'organization',
        organizationId: 'org-123',
        teamId: null,
        athleteId: null,
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });
    });

    it('should return null scope when organizationId is not provided', () => {
      const { result } = renderHook(() => useDashboardScope(null));

      expect(result.current.scope).toEqual({
        view: 'organization',
        organizationId: null,
        teamId: null,
        athleteId: null,
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });
    });
  });

  describe('URL Parsing on Mount', () => {
    it('should parse team scope from URL query params', () => {
      window.history.replaceState({}, '', '/dashboard?view=team&teamId=team-456');

      const { result } = renderHook(() => useDashboardScope('org-123'));

      expect(result.current.scope).toEqual({
        view: 'team',
        organizationId: 'org-123',
        teamId: 'team-456',
        athleteId: null,
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });
    });

    it('should parse athlete scope from URL query params', () => {
      window.history.replaceState(
        {},
        '',
        '/dashboard?view=athlete&teamId=team-456&athleteId=athlete-789'
      );

      const { result } = renderHook(() => useDashboardScope('org-123'));

      expect(result.current.scope).toEqual({
        view: 'athlete',
        organizationId: 'org-123',
        teamId: 'team-456',
        athleteId: 'athlete-789',
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });
    });

    it('should fallback to organization view if URL params are invalid', () => {
      window.history.replaceState({}, '', '/dashboard?view=invalid');

      const { result } = renderHook(() => useDashboardScope('org-123'));

      expect(result.current.scope).toEqual({
        view: 'organization',
        organizationId: 'org-123',
        teamId: null,
        athleteId: null,
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });
    });

    it('should fallback to organization view if teamId is missing for team view', () => {
      window.history.replaceState({}, '', '/dashboard?view=team');

      const { result } = renderHook(() => useDashboardScope('org-123'));

      expect(result.current.scope).toEqual({
        view: 'organization',
        organizationId: 'org-123',
        teamId: null,
        athleteId: null,
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });
    });

    it('should fallback to organization view if athleteId is missing for athlete view', () => {
      window.history.replaceState({}, '', '/dashboard?view=athlete&teamId=team-456');

      const { result } = renderHook(() => useDashboardScope('org-123'));

      expect(result.current.scope).toEqual({
        view: 'organization',
        organizationId: 'org-123',
        teamId: null,
        athleteId: null,
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });
    });
  });

  describe('Scope Updates', () => {
    it('should update to team scope and update URL', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.setTeamScope('team-456');
      });

      expect(result.current.scope).toEqual({
        view: 'team',
        organizationId: 'org-123',
        teamId: 'team-456',
        athleteId: null,
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });

      // Check URL was updated
      expect(mockSetLocation).toHaveBeenCalledWith(
        '/dashboard?view=team&teamId=team-456',
        { replace: true }
      );
    });

    it('should update to athlete scope and update URL', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.setAthleteScope('team-456', 'athlete-789');
      });

      expect(result.current.scope).toEqual({
        view: 'athlete',
        organizationId: 'org-123',
        teamId: 'team-456',
        athleteId: 'athlete-789',
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });

      // Check URL was updated
      expect(mockSetLocation).toHaveBeenCalledWith(
        '/dashboard?view=athlete&teamId=team-456&athleteId=athlete-789',
        { replace: true }
      );
    });

    it('should reset to organization scope and update URL', () => {
      // Start with team scope
      window.history.replaceState({}, '', '/dashboard?view=team&teamId=team-456');
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.resetScope();
      });

      expect(result.current.scope).toEqual({
        view: 'organization',
        organizationId: 'org-123',
        teamId: null,
        athleteId: null,
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });

      // Check URL was updated
      expect(mockSetLocation).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  describe('Organization ID Changes', () => {
    it('should reset scope when organizationId changes', () => {
      window.history.replaceState({}, '', '/dashboard?view=team&teamId=team-456');
      const { result, rerender } = renderHook(
        ({ orgId }) => useDashboardScope(orgId),
        { initialProps: { orgId: 'org-123' } }
      );

      // Change organization
      rerender({ orgId: 'org-456' });

      expect(result.current.scope).toEqual({
        view: 'organization',
        organizationId: 'org-456',
        teamId: null,
        athleteId: null,
        timeframe: '30d',
        startDate: null,
        endDate: null,
      });
    });
  });

  describe('Query String Helpers', () => {
    it('should generate correct query string for team scope', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.setTeamScope('team-456');
      });

      expect(result.current.getQueryParams()).toEqual({
        teamId: 'team-456',
        timeframe: '30d',
      });
    });

    it('should generate correct query string for athlete scope', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.setAthleteScope('team-456', 'athlete-789');
      });

      expect(result.current.getQueryParams()).toEqual({
        teamId: 'team-456',
        athleteId: 'athlete-789',
        timeframe: '30d',
      });
    });

    it('should return timeframe for organization scope', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      expect(result.current.getQueryParams()).toEqual({
        timeframe: '30d',
      });
    });
  });

  describe('Timeframe Filtering', () => {
    it('should initialize with default timeframe (30d)', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      expect(result.current.scope.timeframe).toBe('30d');
      expect(result.current.scope.startDate).toBeNull();
      expect(result.current.scope.endDate).toBeNull();
    });

    it('should parse timeframe from URL query params', () => {
      window.history.replaceState({}, '', '/dashboard?timeframe=7d');

      const { result } = renderHook(() => useDashboardScope('org-123'));

      expect(result.current.scope.timeframe).toBe('7d');
    });

    it('should parse custom date range from URL query params', () => {
      window.history.replaceState(
        {},
        '',
        '/dashboard?timeframe=custom&startDate=2024-01-15&endDate=2024-02-15'
      );

      const { result } = renderHook(() => useDashboardScope('org-123'));

      expect(result.current.scope.timeframe).toBe('custom');
      expect(result.current.scope.startDate).toBe('2024-01-15');
      expect(result.current.scope.endDate).toBe('2024-02-15');
    });

    it('should fallback to 30d if custom is selected without dates', () => {
      window.history.replaceState({}, '', '/dashboard?timeframe=custom');

      const { result } = renderHook(() => useDashboardScope('org-123'));

      // Custom without dates should fallback to 30d
      expect(result.current.scope.timeframe).toBe('30d');
      expect(result.current.scope.startDate).toBeNull();
      expect(result.current.scope.endDate).toBeNull();
    });

    it('should update timeframe and update URL', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.setTimeframe('7d');
      });

      expect(result.current.scope.timeframe).toBe('7d');
      expect(mockSetLocation).toHaveBeenCalledWith('/dashboard?timeframe=7d', {
        replace: true,
      });
    });

    it('should update to custom timeframe with dates and update URL', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.setTimeframe('custom', '2024-01-15', '2024-02-15');
      });

      expect(result.current.scope.timeframe).toBe('custom');
      expect(result.current.scope.startDate).toBe('2024-01-15');
      expect(result.current.scope.endDate).toBe('2024-02-15');
      expect(mockSetLocation).toHaveBeenCalledWith(
        '/dashboard?timeframe=custom&startDate=2024-01-15&endDate=2024-02-15',
        { replace: true }
      );
    });

    it('should include timeframe in getQueryParams', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.setTimeframe('7d');
      });

      expect(result.current.getQueryParams()).toEqual({
        timeframe: '7d',
      });
    });

    it('should include custom date range in getQueryParams', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.setTimeframe('custom', '2024-01-15', '2024-02-15');
      });

      expect(result.current.getQueryParams()).toEqual({
        timeframe: 'custom',
        dateFrom: '2024-01-15',
        dateTo: '2024-02-15',
      });
    });

    it('should preserve scope when changing timeframe', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.setTeamScope('team-456');
      });

      act(() => {
        result.current.setTimeframe('7d');
      });

      expect(result.current.scope).toEqual({
        view: 'team',
        organizationId: 'org-123',
        teamId: 'team-456',
        athleteId: null,
        timeframe: '7d',
        startDate: null,
        endDate: null,
      });

      expect(mockSetLocation).toHaveBeenLastCalledWith(
        '/dashboard?view=team&teamId=team-456&timeframe=7d',
        { replace: true }
      );
    });

    it('should preserve timeframe when changing scope', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.setTimeframe('7d');
      });

      act(() => {
        result.current.setTeamScope('team-456');
      });

      expect(result.current.scope).toEqual({
        view: 'team',
        organizationId: 'org-123',
        teamId: 'team-456',
        athleteId: null,
        timeframe: '7d',
        startDate: null,
        endDate: null,
      });

      expect(mockSetLocation).toHaveBeenLastCalledWith(
        '/dashboard?view=team&teamId=team-456&timeframe=7d',
        { replace: true }
      );
    });

    it('should reset timeframe to default when resetting scope', () => {
      window.history.replaceState({}, '', '/dashboard?view=team&teamId=team-456&timeframe=7d');
      const { result } = renderHook(() => useDashboardScope('org-123'));

      act(() => {
        result.current.resetScope();
      });

      expect(result.current.scope.timeframe).toBe('30d');
      expect(mockSetLocation).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });
});
