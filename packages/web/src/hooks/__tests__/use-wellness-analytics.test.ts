/**
 * Unit Tests for useWellnessAnalytics Hook
 *
 * Tests the React Query hook for fetching wellness analytics data.
 * This hook manages 4 dependent queries: responses, trends, requests, and templates.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useWellnessAnalytics } from '../use-wellness-analytics';
import type { WellnessResponse, WellnessTemplate, WellnessRequest } from '@shared/wellness-types';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useWellnessAnalytics Hook', () => {
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

    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  // Mock data factories
  function createMockResponse(overrides: Partial<WellnessResponse> = {}): WellnessResponse {
    return {
      id: overrides.id || 'response-1',
      requestId: 'request-1',
      organizationId: 'org-1',
      templateId: overrides.templateId || 'template-1',
      userId: overrides.userId || 'user-1',
      userFullName: 'Test User',
      teamId: 'team-1',
      teamNameSnapshot: 'Test Team',
      submittedAt: new Date('2025-01-15T10:00:00Z'),
      date: overrides.date || '2025-01-15',
      responses: overrides.responses || {
        'q1': { value: 5, label: 'Question 1' },
        'q2': { value: 7, label: 'Question 2' },
      },
      accessMethod: 'web',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      createdAt: new Date('2025-01-15T10:00:00Z'),
      ...overrides,
    } as WellnessResponse;
  }

  function createMockTemplate(overrides: Partial<WellnessTemplate> = {}): WellnessTemplate {
    return {
      id: overrides.id || 'template-1',
      name: 'Test Template',
      organizationId: 'org-1',
      createdBy: 'user-1',
      config: {
        questions: [
          {
            id: 'q1',
            type: 'scale',
            label: 'Question 1',
            required: true,
            scaleMin: 1,
            scaleMax: 10,
          },
          {
            id: 'q2',
            type: 'scale',
            label: 'Question 2',
            required: true,
            scaleMin: 1,
            scaleMax: 10,
          },
        ],
        statusConfig: {
          scaleOrientation: 'higher_is_better',
          calculationMethod: 'average',
          redThreshold: 3,
          yellowThreshold: 7,
          injuryQuestionIds: [],
          injuryOverride: true,
        },
      },
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
      isActive: true,
      isGlobal: false,
      ...overrides,
    } as WellnessTemplate;
  }

  function createMockRequest(overrides: Partial<WellnessRequest> = {}): WellnessRequest {
    return {
      id: overrides.id || 'request-1',
      organizationId: 'org-1',
      templateId: 'template-1',
      requestedBy: 'user-1',
      distributionMethod: 'athlete_account',
      targetAthleteIds: overrides.targetAthleteIds || ['athlete-1', 'athlete-2'],
      targetTeamIds: null,
      publicToken: null,
      requiresAuth: true,
      scheduledFor: null,
      expiresAt: null,
      status: 'active',
      createdAt: new Date('2025-01-15T08:00:00Z'),
      ...overrides,
    } as WellnessRequest;
  }

  function createMockTrend() {
    return {
      date: '2025-01-15',
      questionId: 'q1',
      averageScore: 7.5,
      responseCount: 10,
      stdDev: 1.2,
    };
  }

  // Helper to setup standard mocks for all queries
  function setupStandardMocks(options: {
    responses?: WellnessResponse[];
    trends?: any[];
    requests?: WellnessRequest[];
    templates?: WellnessTemplate[];
  } = {}) {
    const {
      responses = [createMockResponse()],
      trends = [createMockTrend()],
      requests = [createMockRequest()],
      templates = [createMockTemplate()],
    } = options;

    // Responses query
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/wellness/responses')) {
        return Promise.resolve({
          ok: true,
          json: async () => responses,
        });
      }
      if (url.includes('/wellness/analytics/trends')) {
        return Promise.resolve({
          ok: true,
          json: async () => trends,
        });
      }
      if (url.includes('/wellness/requests')) {
        return Promise.resolve({
          ok: true,
          json: async () => requests,
        });
      }
      if (url.includes('/wellness/templates/')) {
        const templateId = url.split('/wellness/templates/')[1];
        const template = templates.find(t => t.id === templateId);
        if (template) {
          return Promise.resolve({
            ok: true,
            json: async () => template,
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
  }

  const defaultFilters = {
    dateFrom: '2025-01-01',
    dateTo: '2025-01-31',
  };

  describe('query initialization', () => {
    it('should enable queries when organizationId is provided and enabled is true', async () => {
      setupStandardMocks();

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
          enabled: true,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result.current.responses).toBeDefined();
    });

    it('should disable queries when organizationId is empty', async () => {
      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: '',
          filters: defaultFilters,
          enabled: true,
        }),
        { wrapper }
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.responses).toBeUndefined();
    });

    it('should disable queries when enabled is false', async () => {
      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
          enabled: false,
        }),
        { wrapper }
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.responses).toBeUndefined();
    });

    it('should default enabled to true when not specified', async () => {
      setupStandardMocks();

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('responses query', () => {
    it('should fetch responses with date params', async () => {
      setupStandardMocks();

      renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: { dateFrom: '2025-01-01', dateTo: '2025-01-31' },
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const responsesCall = mockFetch.mock.calls.find((call: any) =>
        call[0].includes('/wellness/responses')
      );
      expect(responsesCall).toBeDefined();
      expect(responsesCall![0]).toContain('startDate=2025-01-01');
      expect(responsesCall![0]).toContain('endDate=2025-01-31');
    });

    it('should include teamIds filter when provided', async () => {
      setupStandardMocks();

      renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: {
            ...defaultFilters,
            teamIds: ['team-1', 'team-2'],
          },
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const responsesCall = mockFetch.mock.calls.find((call: any) =>
        call[0].includes('/wellness/responses')
      );
      expect(responsesCall![0]).toContain('teamIds=team-1%2Cteam-2');
    });

    it('should include athleteIds filter when provided', async () => {
      setupStandardMocks();

      renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: {
            ...defaultFilters,
            athleteIds: ['athlete-1', 'athlete-2'],
          },
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const responsesCall = mockFetch.mock.calls.find((call: any) =>
        call[0].includes('/wellness/responses')
      );
      expect(responsesCall![0]).toContain('athleteIds=athlete-1%2Cathlete-2');
    });
  });

  describe('trends query', () => {
    it('should fetch trends with date params', async () => {
      setupStandardMocks();

      renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const trendsCall = mockFetch.mock.calls.find((call: any) =>
        call[0].includes('/wellness/analytics/trends')
      );
      expect(trendsCall).toBeDefined();
      expect(trendsCall![0]).toContain('startDate=2025-01-01');
      expect(trendsCall![0]).toContain('endDate=2025-01-31');
    });

    it('should include questionIds filter when provided', async () => {
      setupStandardMocks();

      renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: {
            ...defaultFilters,
            questionIds: ['q1', 'q2'],
          },
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const trendsCall = mockFetch.mock.calls.find((call: any) =>
        call[0].includes('/wellness/analytics/trends')
      );
      expect(trendsCall![0]).toContain('questionIds=q1%2Cq2');
    });
  });

  describe('templates query', () => {
    it('should extract unique templateIds from responses', async () => {
      const responses = [
        createMockResponse({ templateId: 'template-1' }),
        createMockResponse({ templateId: 'template-2' }),
        createMockResponse({ templateId: 'template-1' }), // Duplicate
      ];
      const templates = [
        createMockTemplate({ id: 'template-1' }),
        createMockTemplate({ id: 'template-2' }),
      ];

      setupStandardMocks({ responses, templates });

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.templates).toBeDefined();
      });

      // Should fetch both unique templates
      const templateCalls = mockFetch.mock.calls.filter((call: any) =>
        call[0].includes('/wellness/templates/')
      );
      expect(templateCalls.length).toBe(2);
    });

    it('should not fetch templates when no responses exist', async () => {
      setupStandardMocks({ responses: [] });

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const templateCalls = mockFetch.mock.calls.filter((call: any) =>
        call[0].includes('/wellness/templates/')
      );
      expect(templateCalls.length).toBe(0);
    });
  });

  describe('computed values', () => {
    it('should calculate summary.totalResponses correctly', async () => {
      const responses = [
        createMockResponse({ id: 'r1' }),
        createMockResponse({ id: 'r2' }),
        createMockResponse({ id: 'r3' }),
      ];

      setupStandardMocks({ responses });

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.summary).not.toBeNull();
      });

      expect(result.current.summary!.totalResponses).toBe(3);
    });

    it('should calculate summary.uniqueAthletes from unique userIds', async () => {
      const responses = [
        createMockResponse({ id: 'r1', userId: 'user-1' }),
        createMockResponse({ id: 'r2', userId: 'user-2' }),
        createMockResponse({ id: 'r3', userId: 'user-1' }), // Duplicate user
      ];

      setupStandardMocks({ responses });

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.summary).not.toBeNull();
      });

      expect(result.current.summary!.uniqueAthletes).toBe(2);
    });

    it('should group responses by template in responsesByTemplate', async () => {
      const responses = [
        createMockResponse({ id: 'r1', templateId: 'template-1' }),
        createMockResponse({ id: 'r2', templateId: 'template-1' }),
        createMockResponse({ id: 'r3', templateId: 'template-2' }),
      ];
      const templates = [
        createMockTemplate({ id: 'template-1' }),
        createMockTemplate({ id: 'template-2' }),
      ];

      setupStandardMocks({ responses, templates });

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(Object.keys(result.current.responsesByTemplate).length).toBeGreaterThan(0);
      });

      expect(result.current.responsesByTemplate['template-1']).toBeDefined();
      expect(result.current.responsesByTemplate['template-1'].responses).toHaveLength(2);
      expect(result.current.responsesByTemplate['template-2'].responses).toHaveLength(1);
    });

    it('should extract scaleOrientation from first template config', async () => {
      const templates = [
        createMockTemplate({
          id: 'template-1',
          config: {
            questions: [],
            statusConfig: {
              scaleOrientation: 'lower_is_better',
              calculationMethod: 'average',
              redThreshold: 7,
              yellowThreshold: 4,
              injuryQuestionIds: [],
              injuryOverride: true,
            },
          },
        }),
      ];

      setupStandardMocks({ templates });

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.templates).toBeDefined();
      });

      expect(result.current.scaleOrientation).toBe('lower_is_better');
    });

    it('should default to higher_is_better when no templates', async () => {
      setupStandardMocks({ responses: [], templates: [] });

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.scaleOrientation).toBe('higher_is_better');
    });
  });

  describe('completionRate calculation', () => {
    it('should return 0 when no requests exist', async () => {
      setupStandardMocks({ requests: [] });

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.completionRate.percentage).toBe(0);
      expect(result.current.completionRate.completed).toBe(0);
      expect(result.current.completionRate.total).toBe(0);
    });

    it('should calculate completion from targeted athletes', async () => {
      const requests = [
        createMockRequest({
          targetAthleteIds: ['athlete-1', 'athlete-2', 'athlete-3'],
          createdAt: new Date('2025-01-15T08:00:00Z'),
        }),
      ];
      const responses = [
        createMockResponse({ userId: 'athlete-1' }),
        createMockResponse({ userId: 'athlete-2' }),
        // athlete-3 did not respond
      ];

      setupStandardMocks({ requests, responses });

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.requests).toBeDefined();
      });

      // 2 out of 3 targeted athletes responded
      expect(result.current.completionRate.total).toBe(3);
      expect(result.current.completionRate.completed).toBe(2);
      expect(result.current.completionRate.percentage).toBeCloseTo(66.67, 1);
    });
  });

  describe('combined state', () => {
    it('should expose isLoading when any query is loading', async () => {
      setupStandardMocks();

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should expose error from responses query', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/wellness/responses')) {
          return Promise.resolve({
            ok: false,
            json: async () => ({ message: 'Responses fetch failed' }),
          });
        }
        if (url.includes('/wellness/analytics/trends')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (url.includes('/wellness/requests')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      });

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 5000 });

      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  describe('refetch function', () => {
    it('should refetch responses and trends', async () => {
      setupStandardMocks();

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCallCount = mockFetch.mock.calls.length;

      // Call refetch
      result.current.refetch();

      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });
  });

  describe('return values', () => {
    it('should return all expected properties', async () => {
      setupStandardMocks();

      const { result } = renderHook(
        () => useWellnessAnalytics({
          organizationId: 'org-123',
          filters: defaultFilters,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Check all expected return values exist
      expect(result.current).toHaveProperty('responses');
      expect(result.current).toHaveProperty('trends');
      expect(result.current).toHaveProperty('summary');
      expect(result.current).toHaveProperty('templates');
      expect(result.current).toHaveProperty('responsesByTemplate');
      expect(result.current).toHaveProperty('requests');
      expect(result.current).toHaveProperty('completionRate');
      expect(result.current).toHaveProperty('scaleOrientation');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('refetch');
    });
  });
});
