/**
 * Unit Tests for useAvailableMetrics Hook
 *
 * Tests metric fetching behavior based on organization context.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAvailableMetrics } from '../use-available-metrics';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useAuth hook
const mockAuthState = {
  user: null as any,
  organizationContext: undefined as string | undefined,
  userOrganizations: undefined as any[] | undefined,
  isLoading: false,
};

vi.mock('@/lib/auth', () => ({
  useAuth: () => mockAuthState,
}));

// Mock useOrganizationMetrics
const mockOrgMetrics = {
  data: undefined as any[] | undefined,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('@/lib/metrics-api', () => ({
  useOrganizationMetrics: () => mockOrgMetrics,
}));

// Mock useCustomOrgMetrics — without this the hook would fire a real fetch
// when an org context is set, leaking unpredictable data into tests.
const mockCustomOrgMetrics = {
  data: undefined as any[] | undefined,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('@/lib/custom-metrics-api', () => ({
  useCustomOrgMetrics: () => mockCustomOrgMetrics,
}));

describe('useAvailableMetrics', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    // Reset mocks
    vi.clearAllMocks();
    mockFetch.mockReset();

    // Reset mock state
    mockAuthState.user = null;
    mockAuthState.organizationContext = undefined;
    mockAuthState.userOrganizations = undefined;
    mockAuthState.isLoading = false;

    mockOrgMetrics.data = undefined;
    mockOrgMetrics.isLoading = false;
    mockOrgMetrics.error = null;

    mockCustomOrgMetrics.data = undefined;
    mockCustomOrgMetrics.isLoading = false;
    mockCustomOrgMetrics.error = null;
  });

  afterEach(() => {
    queryClient.clear();
  });

  // Mock org metric data factory
  function createMockOrgMetric(overrides = {}) {
    return {
      metricCode: 'FLY10_TIME',
      isEnabled: true,
      customLabel: null,
      siteMetric: {
        code: 'FLY10_TIME',
        label: '10-Yard Fly',
        unit: 's',
        metricType: 'lower_is_better',
        category: 'Speed',
        description: 'Flying 10 yard sprint',
        isDerived: false,
        formula: null,
        dependentMetrics: null,
      },
      ...overrides,
    };
  }

  // Mock site metric data factory
  function createMockSiteMetric(overrides = {}) {
    return {
      code: 'FLY10_TIME',
      label: '10-Yard Fly',
      unit: 's',
      metricType: 'lower_is_better',
      category: 'Speed',
      description: 'Flying 10 yard sprint',
      isActive: true,
      isDerived: false,
      formula: null,
      dependentMetrics: null,
      ...overrides,
    };
  }

  describe('with organization context', () => {
    it('should use org metrics when user has organizationContext', async () => {
      // Setup: user is in an org
      mockAuthState.user = { id: 'user-1', isSiteAdmin: false };
      mockAuthState.organizationContext = 'org-123';
      mockOrgMetrics.data = [
        createMockOrgMetric({ metricCode: 'FLY10_TIME' }),
        createMockOrgMetric({ metricCode: 'VERTICAL_JUMP', siteMetric: { ...createMockSiteMetric().siteMetric, code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in' } }),
      ];

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have org metrics
      expect(result.current.metrics).toHaveLength(2);
      expect(result.current.metrics[0].code).toBe('FLY10_TIME');
    });

    it('should apply org custom labels over site labels', async () => {
      mockAuthState.user = { id: 'user-1', isSiteAdmin: false };
      mockAuthState.organizationContext = 'org-123';
      mockOrgMetrics.data = [
        createMockOrgMetric({
          metricCode: 'FLY10_TIME',
          customLabel: 'Custom Fly Time',
        }),
      ];

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should use custom label
      expect(result.current.metrics[0].label).toBe('Custom Fly Time');
    });

    it('should fall back to site label when no custom label', async () => {
      mockAuthState.user = { id: 'user-1', isSiteAdmin: false };
      mockAuthState.organizationContext = 'org-123';
      mockOrgMetrics.data = [
        createMockOrgMetric({
          metricCode: 'FLY10_TIME',
          customLabel: null, // No custom label
        }),
      ];

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should use site label
      expect(result.current.metrics[0].label).toBe('10-Yard Fly');
    });
  });

  describe('without organization context', () => {
    it('should fetch /api/metrics/active when user has no org context', async () => {
      // Setup: user has no org
      mockAuthState.user = { id: 'user-1', isSiteAdmin: false };
      mockAuthState.organizationContext = undefined;
      mockAuthState.userOrganizations = [];

      const mockActiveMetrics = [
        createMockSiteMetric({ code: 'FLY10_TIME' }),
        createMockSiteMetric({ code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockActiveMetrics,
      });

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have called /api/metrics/active
      expect(mockFetch).toHaveBeenCalledWith('/api/metrics/active');
    });

    it('should return all active site metrics for independent athletes', async () => {
      mockAuthState.user = { id: 'athlete-1', isSiteAdmin: false };
      mockAuthState.organizationContext = undefined;
      mockAuthState.userOrganizations = [];

      const mockActiveMetrics = [
        createMockSiteMetric({ code: 'FLY10_TIME' }),
        createMockSiteMetric({ code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in' }),
        createMockSiteMetric({ code: 'AGILITY_505', label: '5-0-5 Agility', unit: 's' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockActiveMetrics,
      });

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      await waitFor(() => {
        expect(result.current.metrics).toHaveLength(3);
      });

      // Metrics should be returned sorted alphabetically by label:
      // "10-Yard Fly" < "5-0-5 Agility" < "Vertical Jump"
      expect(result.current.metrics.map(m => m.code)).toEqual([
        'FLY10_TIME',
        'AGILITY_505',
        'VERTICAL_JUMP',
      ]);
    });
  });

  describe('alphabetical sorting', () => {
    it('should sort org metrics alphabetically by label', async () => {
      mockAuthState.user = { id: 'user-1', isSiteAdmin: false };
      mockAuthState.organizationContext = 'org-123';
      // Provide metrics in non-alphabetical insertion order
      mockOrgMetrics.data = [
        createMockOrgMetric({
          metricCode: 'VERTICAL_JUMP',
          siteMetric: createMockSiteMetric({ code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in' }),
        }),
        createMockOrgMetric({
          metricCode: 'BROAD_JUMP',
          siteMetric: createMockSiteMetric({ code: 'BROAD_JUMP', label: 'Broad Jump', unit: 'in' }),
        }),
        createMockOrgMetric({
          metricCode: 'AGILITY_505',
          siteMetric: createMockSiteMetric({ code: 'AGILITY_505', label: '5-0-5 Agility', unit: 's' }),
        }),
      ];

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics.map(m => m.label)).toEqual([
        '5-0-5 Agility',
        'Broad Jump',
        'Vertical Jump',
      ]);
    });

    it('should sort case-insensitively when applying custom labels', async () => {
      mockAuthState.user = { id: 'user-1', isSiteAdmin: false };
      mockAuthState.organizationContext = 'org-123';
      mockOrgMetrics.data = [
        createMockOrgMetric({
          metricCode: 'M1',
          customLabel: 'banana sprint',
          siteMetric: createMockSiteMetric({ code: 'M1', label: 'banana sprint' }),
        }),
        createMockOrgMetric({
          metricCode: 'M2',
          customLabel: 'Apple Toss',
          siteMetric: createMockSiteMetric({ code: 'M2', label: 'Apple Toss' }),
        }),
      ];

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // 'Apple Toss' must come before 'banana sprint' regardless of case
      expect(result.current.metrics.map(m => m.label)).toEqual([
        'Apple Toss',
        'banana sprint',
      ]);
    });

    it('should sort org metrics and custom org metrics together as one list', async () => {
      mockAuthState.user = { id: 'user-1', isSiteAdmin: false };
      mockAuthState.organizationContext = 'org-123';
      mockOrgMetrics.data = [
        createMockOrgMetric({
          metricCode: 'VERTICAL_JUMP',
          siteMetric: createMockSiteMetric({ code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in' }),
        }),
        createMockOrgMetric({
          metricCode: 'BROAD_JUMP',
          siteMetric: createMockSiteMetric({ code: 'BROAD_JUMP', label: 'Broad Jump', unit: 'in' }),
        }),
      ];
      // Custom metric whose label sorts between the two site metrics —
      // proves the merged result is sorted, not just each source independently.
      mockCustomOrgMetrics.data = [
        {
          code: 'CUSTOM_PUSHUPS',
          label: 'Custom Pushups',
          unit: 'reps',
          metricType: 'higher_is_better',
          category: null,
          description: null,
          isActive: true,
          isDerived: false,
          formula: null,
          dependentMetrics: null,
        },
      ];

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics.map(m => m.label)).toEqual([
        'Broad Jump',
        'Custom Pushups',
        'Vertical Jump',
      ]);
    });

    it('should sort site fallback metrics alphabetically by label', async () => {
      mockAuthState.user = { id: 'athlete-1', isSiteAdmin: false };
      mockAuthState.organizationContext = undefined;
      mockAuthState.userOrganizations = [];

      const mockActiveMetrics = [
        createMockSiteMetric({ code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in' }),
        createMockSiteMetric({ code: 'BROAD_JUMP', label: 'Broad Jump', unit: 'in' }),
        createMockSiteMetric({ code: 'FLY10_TIME', label: '10-Yard Fly' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockActiveMetrics,
      });

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      await waitFor(() => {
        expect(result.current.metrics).toHaveLength(3);
      });

      expect(result.current.metrics.map(m => m.label)).toEqual([
        '10-Yard Fly',
        'Broad Jump',
        'Vertical Jump',
      ]);
    });
  });

  describe('loading and error states', () => {
    it('should return empty array while loading', () => {
      mockAuthState.user = { id: 'user-1', isSiteAdmin: false };
      mockAuthState.organizationContext = 'org-123';
      mockOrgMetrics.isLoading = true;
      mockOrgMetrics.data = undefined;

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.metrics).toEqual([]);
    });

    it('should return error when fetch fails', async () => {
      mockAuthState.user = { id: 'user-1', isSiteAdmin: false };
      mockAuthState.organizationContext = undefined;
      mockAuthState.userOrganizations = [];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).not.toBeNull();
    });
  });

  describe('metric properties', () => {
    it('should correctly set lowerIsBetter from metricType', async () => {
      mockAuthState.user = { id: 'user-1', isSiteAdmin: false };
      mockAuthState.organizationContext = 'org-123';
      mockOrgMetrics.data = [
        createMockOrgMetric({
          metricCode: 'FLY10_TIME',
          siteMetric: {
            ...createMockSiteMetric(),
            metricType: 'lower_is_better',
          },
        }),
        createMockOrgMetric({
          metricCode: 'VERTICAL_JUMP',
          siteMetric: {
            ...createMockSiteMetric(),
            code: 'VERTICAL_JUMP',
            label: 'Vertical Jump',
            metricType: 'higher_is_better',
          },
        }),
      ];

      const { result } = renderHook(() => useAvailableMetrics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const flyMetric = result.current.metrics.find(m => m.code === 'FLY10_TIME');
      const jumpMetric = result.current.metrics.find(m => m.code === 'VERTICAL_JUMP');

      expect(flyMetric?.lowerIsBetter).toBe(true);
      expect(jumpMetric?.lowerIsBetter).toBe(false);
    });
  });
});
