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
      });
    });

    it('should return null scope when organizationId is not provided', () => {
      const { result } = renderHook(() => useDashboardScope(null));

      expect(result.current.scope).toEqual({
        view: 'organization',
        organizationId: null,
        teamId: null,
        athleteId: null,
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
      });
    });

    it('should return empty object for organization scope', () => {
      const { result } = renderHook(() => useDashboardScope('org-123'));

      expect(result.current.getQueryParams()).toEqual({});
    });
  });
});
