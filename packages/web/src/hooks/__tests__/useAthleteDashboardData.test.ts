/**
 * Unit Tests for useAthleteDashboardData Hook
 *
 * Tests the aggregated dashboard data hook that combines
 * athlete profile, measurements, and computed analytics.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAthleteDashboardData } from '../useAthleteDashboardData';
import { AthleteOrgProvider } from '@/lib/athlete-org-context';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock the utility functions
vi.mock('@/utils/athlete-dashboard-utils', () => ({
  calculateMonthlyMeasurementCount: vi.fn(() => 5),
  getLastMeasurementDate: vi.fn(() => new Date('2024-01-15')),
  calculatePersonalRecords: vi.fn(() => [
    {
      metric: 'FLY10_TIME',
      displayName: '10-Yard Fly Time',
      value: 1.22,
      units: 's',
      date: '2024-01-15',
      isRecent: true,
      improvement: 0.03,
      improvementText: '0.03s improvement',
    },
  ]),
  generateActivityTimeline: vi.fn(() => [
    {
      id: 'm1',
      date: '2024-01-15',
      metric: 'FLY10_TIME',
      displayName: '10-Yard Fly Time',
      value: 1.22,
      units: 's',
      insight: 'New personal record!',
      insightType: 'pr',
    },
  ]),
}));

describe('useAthleteDashboardData Hook', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Setup default auth mock
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123', isSiteAdmin: false },
      userOrganizations: [
        { organizationId: 'org-1', organizationName: 'Organization 1' },
        { organizationId: 'org-2', organizationName: 'Organization 2' },
      ],
    });

    wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(AthleteOrgProvider, null, children)
      );

    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  // Mock athlete data factory
  function createMockAthlete(overrides = {}) {
    return {
      id: 'athlete-123',
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      birthYear: 2005,
      ...overrides,
    };
  }

  // Mock measurement data factory
  function createMockMeasurement(overrides = {}) {
    return {
      id: 'measurement-1',
      userId: 'athlete-123',
      metric: 'FLY10_TIME',
      value: 1.25,
      date: '2024-01-15',
      notes: null,
      ...overrides,
    };
  }

  // Setup standard fetch mocks for successful scenario
  function setupSuccessfulFetches(athlete: any, measurements: any[]) {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/athletes/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(athlete),
        });
      }
      if (url.includes('/api/measurements')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(measurements),
        });
      }
      return Promise.resolve({ ok: false });
    });
  }

  describe('data aggregation', () => {
    it('should combine athlete and measurement data', async () => {
      const mockAthlete = createMockAthlete();
      const mockMeasurements = [
        createMockMeasurement({ id: 'm1', metric: 'FLY10_TIME', value: 1.25 }),
        createMockMeasurement({ id: 'm2', metric: 'VERTICAL_JUMP', value: 28 }),
      ];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).not.toBeNull();
      expect(result.current.data?.athleteName).toBe('John');
      expect(result.current.data?.measurements).toHaveLength(2);
    });

    it('should include personal records from utility function', async () => {
      const mockAthlete = createMockAthlete();
      const mockMeasurements = [createMockMeasurement()];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.personalRecords).toHaveLength(1);
      expect(result.current.data?.personalRecords[0].metric).toBe('FLY10_TIME');
    });

    it('should include activity timeline from utility function', async () => {
      const mockAthlete = createMockAthlete();
      const mockMeasurements = [createMockMeasurement()];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.activityTimeline).toHaveLength(1);
      expect(result.current.data?.activityTimeline[0].insightType).toBe('pr');
    });

    it('should include monthly measurement count', async () => {
      const mockAthlete = createMockAthlete();
      const mockMeasurements = [createMockMeasurement()];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Mocked to return 5
      expect(result.current.data?.measurementsThisMonth).toBe(5);
    });

    it('should include last measurement date', async () => {
      const mockAthlete = createMockAthlete();
      const mockMeasurements = [createMockMeasurement()];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.lastMeasurementDate).toEqual(new Date('2024-01-15'));
    });
  });

  describe('AthleteOrgContext integration', () => {
    it('should pass filterMode context to useAthleteMeasurements hook', async () => {
      const mockAthlete = createMockAthlete();
      const mockMeasurements = [createMockMeasurement()];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify measurements endpoint was called with filterMode params
      const measurementsCall = mockFetch.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('/api/measurements')
      );
      expect(measurementsCall).toBeDefined();
      const url = measurementsCall?.[0] as string;
      expect(url).toContain('athleteId=athlete-123');
      expect(url).toContain('filterMode=all');
    });

    it('should work without AthleteOrgContext provider', async () => {
      const mockAthlete = createMockAthlete();
      const mockMeasurements = [createMockMeasurement()];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      // Create wrapper WITHOUT AthleteOrgProvider
      const wrapperWithoutContext = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper: wrapperWithoutContext }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).not.toBeNull();
      expect(result.current.data?.athleteName).toBe('John');
    });
  });

  describe('loading and error states', () => {
    it('should be loading when fetching data', () => {
      // Don't resolve fetch - leave pending
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeNull();
    });

    it('should not fetch when disabled', async () => {
      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123', { enabled: false }),
        { wrapper }
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it('should not fetch when athleteId is undefined', async () => {
      const { result } = renderHook(
        () => useAthleteDashboardData(undefined),
        { wrapper }
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return empty arrays when no measurements', async () => {
      const mockAthlete = createMockAthlete();

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/athletes/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockAthlete),
          });
        }
        if (url.includes('/api/measurements')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // With no measurements, data still returns but with empty arrays/metrics
      expect(result.current.data).not.toBeNull();
      expect(result.current.data?.measurements).toEqual([]);
      expect(result.current.data?.availableMetrics).toEqual([]);
      expect(result.current.data?.metricProgress).toEqual([]);
    });
  });

  describe('athlete name extraction', () => {
    it('should use firstName for athleteName', async () => {
      const mockAthlete = createMockAthlete({ firstName: 'Jane', fullName: 'Jane Smith' });
      const mockMeasurements = [createMockMeasurement()];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.athleteName).toBe('Jane');
    });

    it('should fall back to fullName when firstName is empty', async () => {
      const mockAthlete = createMockAthlete({ firstName: '', fullName: 'Unknown Athlete' });
      const mockMeasurements = [createMockMeasurement()];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // When firstName is empty, falls back to first part of fullName
      expect(result.current.data?.athleteName).toBe('Unknown');
    });
  });

  describe('available metrics', () => {
    it('should list unique metrics from measurements', async () => {
      const mockAthlete = createMockAthlete();
      const mockMeasurements = [
        createMockMeasurement({ metric: 'FLY10_TIME' }),
        createMockMeasurement({ metric: 'VERTICAL_JUMP' }),
        createMockMeasurement({ metric: 'FLY10_TIME' }), // Duplicate metric
      ];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.availableMetrics).toContain('FLY10_TIME');
      expect(result.current.data?.availableMetrics).toContain('VERTICAL_JUMP');
    });
  });

  describe('metric progress', () => {
    it('should calculate progress for each metric', async () => {
      const mockAthlete = createMockAthlete();
      const mockMeasurements = [
        createMockMeasurement({ id: 'm1', metric: 'FLY10_TIME', value: 1.30, date: '2024-01-01' }),
        createMockMeasurement({ id: 'm2', metric: 'FLY10_TIME', value: 1.25, date: '2024-01-15' }),
      ];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const flyProgress = result.current.data?.metricProgress.find(p => p.metric === 'FLY10_TIME');
      expect(flyProgress).toBeDefined();
      expect(flyProgress?.currentValue).toBe(1.25);
      expect(flyProgress?.measurements).toHaveLength(2);
    });
  });

  describe('query exposure', () => {
    it('should expose individual queries for granular loading states', async () => {
      const mockAthlete = createMockAthlete();
      const mockMeasurements = [createMockMeasurement()];

      setupSuccessfulFetches(mockAthlete, mockMeasurements);

      const { result } = renderHook(
        () => useAthleteDashboardData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.athleteQuery).toBeDefined();
      expect(result.current.measurementsQuery).toBeDefined();
    });
  });
});
