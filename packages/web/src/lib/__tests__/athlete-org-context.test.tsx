/**
 * Unit tests for AthleteOrgContext and localStorage helpers
 * Tests organization filtering state management with localStorage persistence
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import {
  getAthleteOrgFilter,
  setAthleteOrgFilter,
  clearAthleteOrgFilter,
} from '../athlete-org-storage';
import {
  AthleteOrgProvider,
  useAthleteOrg,
  type FilterMode,
} from '../athlete-org-context';
import type { UserOrganization } from '../types/user';

// Mock useAuth hook
const mockUseAuth = vi.fn();
vi.mock('../auth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('Athlete Org Storage Helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('getAthleteOrgFilter', () => {
    it('should return "all" when no stored value exists', () => {
      const result = getAthleteOrgFilter('user-123');
      expect(result).toBe('all');
    });

    it('should return stored filter mode "all"', () => {
      localStorage.setItem('athlete-org-filter-user-123', JSON.stringify('all'));
      const result = getAthleteOrgFilter('user-123');
      expect(result).toBe('all');
    });

    it('should return stored filter mode "personal"', () => {
      localStorage.setItem('athlete-org-filter-user-123', JSON.stringify('personal'));
      const result = getAthleteOrgFilter('user-123');
      expect(result).toBe('personal');
    });

    it('should return stored organization ID', () => {
      localStorage.setItem('athlete-org-filter-user-123', JSON.stringify('org-456'));
      const result = getAthleteOrgFilter('user-123');
      expect(result).toBe('org-456');
    });

    it('should return "all" on JSON parse error (corrupted data)', () => {
      localStorage.setItem('athlete-org-filter-user-123', 'invalid-json{');
      const result = getAthleteOrgFilter('user-123');
      expect(result).toBe('all');
    });

    it('should handle localStorage disabled (private browsing)', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      getItemSpy.mockImplementation(() => {
        throw new Error('localStorage is disabled');
      });

      const result = getAthleteOrgFilter('user-123');
      expect(result).toBe('all');

      getItemSpy.mockRestore();
    });

    it('should return "all" when userId is undefined', () => {
      const result = getAthleteOrgFilter(undefined);
      expect(result).toBe('all');
    });
  });

  describe('setAthleteOrgFilter', () => {
    it('should store "all" mode', () => {
      setAthleteOrgFilter('user-123', 'all');
      const stored = localStorage.getItem('athlete-org-filter-user-123');
      expect(stored).toBe(JSON.stringify('all'));
    });

    it('should store "personal" mode', () => {
      setAthleteOrgFilter('user-123', 'personal');
      const stored = localStorage.getItem('athlete-org-filter-user-123');
      expect(stored).toBe(JSON.stringify('personal'));
    });

    it('should store organization ID', () => {
      setAthleteOrgFilter('user-123', 'org-789');
      const stored = localStorage.getItem('athlete-org-filter-user-123');
      expect(stored).toBe(JSON.stringify('org-789'));
    });

    it('should handle localStorage quota exceeded error', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
      setItemSpy.mockImplementation(() => {
        throw quotaError;
      });

      // Should not throw
      expect(() => setAthleteOrgFilter('user-123', 'all')).not.toThrow();

      setItemSpy.mockRestore();
    });

    it('should handle localStorage disabled (private browsing)', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        throw new Error('localStorage is disabled');
      });

      // Should not throw
      expect(() => setAthleteOrgFilter('user-123', 'all')).not.toThrow();

      setItemSpy.mockRestore();
    });

    it('should use user-scoped key', () => {
      setAthleteOrgFilter('user-999', 'personal');
      const stored = localStorage.getItem('athlete-org-filter-user-999');
      expect(stored).toBe(JSON.stringify('personal'));
    });
  });

  describe('clearAthleteOrgFilter', () => {
    it('should remove stored filter for user', () => {
      localStorage.setItem('athlete-org-filter-user-123', JSON.stringify('org-456'));
      clearAthleteOrgFilter('user-123');
      const stored = localStorage.getItem('athlete-org-filter-user-123');
      expect(stored).toBeNull();
    });

    it('should handle localStorage disabled gracefully', () => {
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
      removeItemSpy.mockImplementation(() => {
        throw new Error('localStorage is disabled');
      });

      // Should not throw
      expect(() => clearAthleteOrgFilter('user-123')).not.toThrow();

      removeItemSpy.mockRestore();
    });

    it('should handle clearing when no value exists', () => {
      // Should not throw
      expect(() => clearAthleteOrgFilter('user-123')).not.toThrow();
    });
  });
});

describe('AthleteOrgContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  const mockOrganizations: UserOrganization[] = [
    { organizationId: 'org-1', organizationName: 'Org One', role: 'athlete', createdAt: '2024-01-01' },
    { organizationId: 'org-2', organizationName: 'Org Two', role: 'athlete', createdAt: '2024-01-02' },
  ];

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => (
      <AthleteOrgProvider>{children}</AthleteOrgProvider>
    );
  };

  describe('Provider Initialization', () => {
    it('should initialize with "all" when no localStorage value', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.filterMode).toBe('all');
    });

    it('should initialize from localStorage if valid', () => {
      localStorage.setItem('athlete-org-filter-user-123', JSON.stringify('personal'));
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.filterMode).toBe('personal');
    });

    it('should default to "all" if stored org ID no longer exists', () => {
      localStorage.setItem('athlete-org-filter-user-123', JSON.stringify('org-999'));
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.filterMode).toBe('all');
    });

    it('should populate organizations from user context', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.organizations).toEqual([
        { id: 'org-1', name: 'Org One' },
        { id: 'org-2', name: 'Org Two' },
      ]);
    });

    it('should handle null user gracefully', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        userOrganizations: null,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.filterMode).toBe('all');
      expect(result.current.organizations).toEqual([]);
    });

    it('should initialize stored org ID if it exists in user orgs', () => {
      localStorage.setItem('athlete-org-filter-user-123', JSON.stringify('org-2'));
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.filterMode).toBe('org-2');
    });
  });

  describe('setFilterMode', () => {
    it('should update filterMode to "all"', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setFilterMode('all');
      });

      expect(result.current.filterMode).toBe('all');
    });

    it('should update filterMode to "personal"', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setFilterMode('personal');
      });

      expect(result.current.filterMode).toBe('personal');
    });

    it('should update filterMode to specific org ID', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setFilterMode('org-1');
      });

      expect(result.current.filterMode).toBe('org-1');
    });

    it('should persist to localStorage on change', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setFilterMode('personal');
      });

      const stored = localStorage.getItem('athlete-org-filter-user-123');
      expect(stored).toBe(JSON.stringify('personal'));
    });

    it('should validate org ID exists in user\'s orgs', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setFilterMode('org-999');
      });

      // Should fallback to 'all' for invalid org ID
      expect(result.current.filterMode).toBe('all');
    });

    it('should allow "all" and "personal" without validation', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setFilterMode('all');
      });
      expect(result.current.filterMode).toBe('all');

      act(() => {
        result.current.setFilterMode('personal');
      });
      expect(result.current.filterMode).toBe('personal');
    });
  });

  describe('Context Values', () => {
    it('should provide filterMode value', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current).toHaveProperty('filterMode');
      expect(typeof result.current.filterMode).toBe('string');
    });

    it('should provide organizations array', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current).toHaveProperty('organizations');
      expect(Array.isArray(result.current.organizations)).toBe(true);
    });

    it('should provide setFilterMode function', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current).toHaveProperty('setFilterMode');
      expect(typeof result.current.setFilterMode).toBe('function');
    });
  });

  describe('useAthleteOrg Hook', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAthleteOrg());
      }).toThrow('useAthleteOrg must be used within an AthleteOrgProvider');

      consoleErrorSpy.mockRestore();
    });

    it('should return context when used inside provider', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current).toBeDefined();
      expect(result.current.filterMode).toBeDefined();
      expect(result.current.organizations).toBeDefined();
      expect(result.current.setFilterMode).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle user with no organizations', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: [],
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.organizations).toEqual([]);
      // With no organizations, 'personal' is the only meaningful view
      expect(result.current.filterMode).toBe('personal');
    });

    it('should handle user with single organization', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: [mockOrganizations[0]],
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.organizations).toEqual([
        { id: 'org-1', name: 'Org One' },
      ]);
    });

    it('should handle user with multiple organizations', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.organizations).toHaveLength(2);
    });

    it('should sync when userOrganizations changes', async () => {
      const { rerender } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
        initialProps: {
          user: { id: 'user-123' },
          userOrganizations: [mockOrganizations[0]],
        },
      });

      // Update the mock to return different organizations
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      rerender();

      await waitFor(() => {
        const { result } = renderHook(() => useAthleteOrg(), {
          wrapper: createWrapper(),
        });
        expect(result.current.organizations).toHaveLength(2);
      });
    });

    it('should clear filter when user changes (logout scenario)', () => {
      localStorage.setItem('athlete-org-filter-user-123', JSON.stringify('personal'));

      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result, rerender } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.filterMode).toBe('personal');

      // User logs out
      mockUseAuth.mockReturnValue({
        user: null,
        userOrganizations: null,
      });

      rerender();

      expect(result.current.filterMode).toBe('all');
    });

    it('should re-validate filter when organizations change', async () => {
      localStorage.setItem('athlete-org-filter-user-123', JSON.stringify('org-2'));

      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: mockOrganizations,
      });

      const { result, rerender } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.filterMode).toBe('org-2');

      // Organizations change (org-2 removed)
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: [mockOrganizations[0]], // Only org-1 now
      });

      rerender();

      await waitFor(() => {
        const { result } = renderHook(() => useAthleteOrg(), {
          wrapper: createWrapper(),
        });
        // Should reset to 'all' since org-2 no longer exists
        expect(result.current.filterMode).toBe('all');
      });
    });

    it('should handle null userOrganizations gracefully', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123' },
        userOrganizations: null,
      });

      const { result } = renderHook(() => useAthleteOrg(), {
        wrapper: createWrapper(),
      });

      expect(result.current.organizations).toEqual([]);
      // With null/no organizations, 'personal' is the only meaningful view
      expect(result.current.filterMode).toBe('personal');
    });
  });
});
