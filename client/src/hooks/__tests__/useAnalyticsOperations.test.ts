import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAnalyticsPermissions } from '../useAnalyticsOperations';

// Mock the useAuth hook
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn()
}));

import { useAuth } from '@/lib/auth';

describe('useAnalyticsPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('organizationContext handling', () => {
    it('should return organizationContext when available', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        organizationContext: 'org-123',
        userOrganizations: [{ organizationId: 'org-456' }]
      });

      const { result } = renderHook(() => useAnalyticsPermissions());

      expect(result.current.effectiveOrganizationId).toBe('org-123');
      expect(result.current.organizationContext).toBe('org-123');
    });

    it('should fallback to userOrganizations[0] when organizationContext is null', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        organizationContext: null,
        userOrganizations: [{ organizationId: 'org-456' }]
      });

      const { result } = renderHook(() => useAnalyticsPermissions());

      expect(result.current.effectiveOrganizationId).toBe('org-456');
    });

    it('should return null when no organization is available', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        organizationContext: null,
        userOrganizations: []
      });

      const { result } = renderHook(() => useAnalyticsPermissions());

      expect(result.current.effectiveOrganizationId).toBeNull();
    });

    it('should return null for site admin with no organizationContext', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'site_admin', isSiteAdmin: true },
        organizationContext: null,
        userOrganizations: [{ organizationId: 'org-456' }]
      });

      const { result } = renderHook(() => useAnalyticsPermissions());

      // Site admins should not auto-select organization
      expect(result.current.effectiveOrganizationId).toBeNull();
    });
  });

  describe('permission flags', () => {
    it('should correctly identify site admin', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'site_admin', isSiteAdmin: true },
        organizationContext: null,
        userOrganizations: []
      });

      const { result } = renderHook(() => useAnalyticsPermissions());

      expect(result.current.isSiteAdmin).toBe(true);
      expect(result.current.hasCoachAccess).toBe(true);
      expect(result.current.hasAthleteAccess).toBe(true);
    });

    it('should correctly identify coach access', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        organizationContext: 'org-123',
        userOrganizations: [{ organizationId: 'org-123' }]
      });

      const { result } = renderHook(() => useAnalyticsPermissions());

      expect(result.current.hasCoachAccess).toBe(true);
      expect(result.current.hasAthleteAccess).toBe(false);
    });

    it('should correctly identify org_admin access', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'org_admin', isSiteAdmin: false },
        organizationContext: 'org-123',
        userOrganizations: [{ organizationId: 'org-123' }]
      });

      const { result } = renderHook(() => useAnalyticsPermissions());

      expect(result.current.hasCoachAccess).toBe(true);
      expect(result.current.hasAthleteAccess).toBe(false);
    });

    it('should correctly identify athlete access', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'athlete', isSiteAdmin: false },
        organizationContext: 'org-123',
        userOrganizations: [{ organizationId: 'org-123' }]
      });

      const { result } = renderHook(() => useAnalyticsPermissions());

      expect(result.current.hasCoachAccess).toBe(false);
      expect(result.current.hasAthleteAccess).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle null userOrganizations', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        organizationContext: null,
        userOrganizations: null
      });

      const { result } = renderHook(() => useAnalyticsPermissions());

      expect(result.current.effectiveOrganizationId).toBeNull();
    });

    it('should handle undefined user', () => {
      (useAuth as any).mockReturnValue({
        user: null,
        organizationContext: null,
        userOrganizations: null
      });

      const { result } = renderHook(() => useAnalyticsPermissions());

      expect(result.current.user).toBeNull();
      expect(result.current.isSiteAdmin).toBe(false);
      expect(result.current.hasCoachAccess).toBe(false);
      expect(result.current.hasAthleteAccess).toBe(false);
    });

    it('should handle empty userOrganizations array', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        organizationContext: null,
        userOrganizations: []
      });

      const { result } = renderHook(() => useAnalyticsPermissions());

      expect(result.current.effectiveOrganizationId).toBeNull();
    });
  });
});
