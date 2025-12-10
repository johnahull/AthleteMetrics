/**
 * Unit Tests for useAthleteContext Hook
 *
 * Tests athlete context resolution based on route params and auth state.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAthleteContext, useAthletePaths } from '../useAthleteContext';

// Mock wouter
vi.mock('wouter', () => ({
  useParams: vi.fn(),
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

import { useParams } from 'wouter';
import { useAuth } from '@/lib/auth';

const mockUseParams = vi.mocked(useParams);
const mockUseAuth = vi.mocked(useAuth);

describe('useAthleteContext Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('athleteId resolution', () => {
    it('should use route param id when present', () => {
      mockUseParams.mockReturnValue({ id: 'athlete-from-route' });
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', athleteId: 'athlete-from-session' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.athleteId).toBe('athlete-from-route');
    });

    it('should use user athleteId when no route param', () => {
      mockUseParams.mockReturnValue({});
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', athleteId: 'athlete-from-session' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.athleteId).toBe('athlete-from-session');
    });

    it('should return undefined when no route param and no athleteId', () => {
      mockUseParams.mockReturnValue({});
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.athleteId).toBeUndefined();
    });
  });

  describe('isOwnProfile detection', () => {
    it('should be true when no route param (viewing own profile)', () => {
      mockUseParams.mockReturnValue({});
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', athleteId: 'athlete-123' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.isOwnProfile).toBe(true);
    });

    it('should be true when route param matches user athleteId', () => {
      mockUseParams.mockReturnValue({ id: 'athlete-123' });
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', athleteId: 'athlete-123' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.isOwnProfile).toBe(true);
    });

    it('should be false when route param differs from user athleteId (coach view)', () => {
      mockUseParams.mockReturnValue({ id: 'different-athlete' });
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', athleteId: 'athlete-123' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.isOwnProfile).toBe(false);
    });
  });

  describe('canView permissions', () => {
    it('should allow athletes to view their own profile', () => {
      mockUseParams.mockReturnValue({});
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', athleteId: 'athlete-123', role: 'athlete' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.canView).toBe(true);
    });

    it('should allow coaches to view any athlete', () => {
      mockUseParams.mockReturnValue({ id: 'other-athlete' });
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', athleteId: 'athlete-123', role: 'coach' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.canView).toBe(true);
    });

    it('should allow org_admins to view any athlete', () => {
      mockUseParams.mockReturnValue({ id: 'other-athlete' });
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', role: 'org_admin' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.canView).toBe(true);
    });

    it('should allow site admins to view any athlete', () => {
      mockUseParams.mockReturnValue({ id: 'other-athlete' });
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', isSiteAdmin: true },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.canView).toBe(true);
    });

    it('should deny view access when no user', () => {
      mockUseParams.mockReturnValue({ id: 'some-athlete' });
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.canView).toBe(false);
    });
  });

  describe('canEdit permissions', () => {
    it('should deny edit access to regular athletes', () => {
      mockUseParams.mockReturnValue({});
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', athleteId: 'athlete-123', role: 'athlete' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.canEdit).toBe(false);
    });

    it('should allow coaches to edit', () => {
      mockUseParams.mockReturnValue({ id: 'athlete-123' });
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', role: 'coach' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.canEdit).toBe(true);
    });

    it('should allow org_admins to edit', () => {
      mockUseParams.mockReturnValue({ id: 'athlete-123' });
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', role: 'org_admin' },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.canEdit).toBe(true);
    });

    it('should allow site admins to edit', () => {
      mockUseParams.mockReturnValue({ id: 'athlete-123' });
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', isSiteAdmin: true },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.canEdit).toBe(true);
    });
  });

  describe('loading state', () => {
    it('should reflect auth loading state', () => {
      mockUseParams.mockReturnValue({});
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: true,
      } as any);

      const { result } = renderHook(() => useAthleteContext());

      expect(result.current.isLoading).toBe(true);
    });
  });
});

describe('useAthletePaths Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return /my-profile and /my-dashboard for own profile', () => {
    mockUseParams.mockReturnValue({});
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', athleteId: 'athlete-123' },
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useAthletePaths());

    expect(result.current.profilePath).toBe('/my-profile');
    expect(result.current.dashboardPath).toBe('/my-dashboard');
  });

  it('should return /athletes/:id paths for coach view', () => {
    mockUseParams.mockReturnValue({ id: 'other-athlete' });
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', athleteId: 'athlete-123', role: 'coach' },
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useAthletePaths());

    expect(result.current.profilePath).toBe('/athletes/other-athlete/profile');
    expect(result.current.dashboardPath).toBe('/athletes/other-athlete/dashboard');
  });
});
