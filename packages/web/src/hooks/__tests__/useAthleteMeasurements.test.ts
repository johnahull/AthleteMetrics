/**
 * Unit Tests for useAthleteMeasurements Hook
 *
 * Tests measurement data fetching and grouping functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useAthleteMeasurements,
  useMeasurementsByMetric,
  useRecentMeasurements,
} from '../useAthleteMeasurements';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useAthleteMeasurements Hooks', () => {
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

  describe('useAthleteMeasurements', () => {
    it('should fetch measurements when athleteId is provided', async () => {
      const mockMeasurements = [
        createMockMeasurement({ id: 'm1' }),
        createMockMeasurement({ id: 'm2', metric: 'VERTICAL_JUMP', value: 28 }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMeasurements,
      });

      const { result } = renderHook(
        () => useAthleteMeasurements('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/measurements?athleteId=athlete-123',
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result.current.data).toEqual(mockMeasurements);
    });

    it('should not fetch when athleteId is undefined', async () => {
      const { result } = renderHook(
        () => useAthleteMeasurements(undefined),
        { wrapper }
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.isFetching).toBe(false);
    });

    it('should not fetch when enabled is false', async () => {
      const { result } = renderHook(
        () => useAthleteMeasurements('athlete-123', { enabled: false }),
        { wrapper }
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle fetch error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(
        () => useAthleteMeasurements('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Failed to fetch measurements');
    });

    it('should use custom staleTime when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(
        () => useAthleteMeasurements('athlete-123', { staleTime: 30000 }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe('useMeasurementsByMetric', () => {
    it('should group measurements by metric type', async () => {
      const mockMeasurements = [
        createMockMeasurement({ id: 'm1', metric: 'FLY10_TIME', value: 1.25 }),
        createMockMeasurement({ id: 'm2', metric: 'FLY10_TIME', value: 1.22 }),
        createMockMeasurement({ id: 'm3', metric: 'VERTICAL_JUMP', value: 28 }),
        createMockMeasurement({ id: 'm4', metric: 'VERTICAL_JUMP', value: 30 }),
        createMockMeasurement({ id: 'm5', metric: 'DASH_40YD', value: 4.8 }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMeasurements,
      });

      const { result } = renderHook(
        () => useMeasurementsByMetric('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.measurementsByMetric).toEqual({
        FLY10_TIME: [
          expect.objectContaining({ id: 'm1', value: 1.25 }),
          expect.objectContaining({ id: 'm2', value: 1.22 }),
        ],
        VERTICAL_JUMP: [
          expect.objectContaining({ id: 'm3', value: 28 }),
          expect.objectContaining({ id: 'm4', value: 30 }),
        ],
        DASH_40YD: [
          expect.objectContaining({ id: 'm5', value: 4.8 }),
        ],
      });
    });

    it('should return available metrics sorted alphabetically', async () => {
      const mockMeasurements = [
        createMockMeasurement({ metric: 'VERTICAL_JUMP' }),
        createMockMeasurement({ metric: 'FLY10_TIME' }),
        createMockMeasurement({ metric: 'DASH_40YD' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMeasurements,
      });

      const { result } = renderHook(
        () => useMeasurementsByMetric('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.availableMetrics).toEqual([
        'DASH_40YD',
        'FLY10_TIME',
        'VERTICAL_JUMP',
      ]);
    });

    it('should return empty data when no measurements', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(
        () => useMeasurementsByMetric('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.measurementsByMetric).toEqual({});
      expect(result.current.availableMetrics).toEqual([]);
    });
  });

  describe('useRecentMeasurements', () => {
    it('should return measurements sorted by date (most recent first)', async () => {
      const mockMeasurements = [
        createMockMeasurement({ id: 'm1', date: '2024-01-10' }),
        createMockMeasurement({ id: 'm2', date: '2024-01-15' }),
        createMockMeasurement({ id: 'm3', date: '2024-01-05' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMeasurements,
      });

      const { result } = renderHook(
        () => useRecentMeasurements('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.recentMeasurements[0].id).toBe('m2'); // Jan 15 - most recent
      expect(result.current.recentMeasurements[1].id).toBe('m1'); // Jan 10
      expect(result.current.recentMeasurements[2].id).toBe('m3'); // Jan 5 - oldest
    });

    it('should limit results to specified count', async () => {
      const mockMeasurements = Array.from({ length: 20 }, (_, i) =>
        createMockMeasurement({ id: `m${i}`, date: `2024-01-${String(i + 1).padStart(2, '0')}` })
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMeasurements,
      });

      const { result } = renderHook(
        () => useRecentMeasurements('athlete-123', 5),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.recentMeasurements).toHaveLength(5);
    });

    it('should default to 10 measurements', async () => {
      const mockMeasurements = Array.from({ length: 20 }, (_, i) =>
        createMockMeasurement({ id: `m${i}`, date: `2024-01-${String(i + 1).padStart(2, '0')}` })
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMeasurements,
      });

      const { result } = renderHook(
        () => useRecentMeasurements('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.recentMeasurements).toHaveLength(10);
    });

    it('should return all measurements when fewer than limit', async () => {
      const mockMeasurements = [
        createMockMeasurement({ id: 'm1' }),
        createMockMeasurement({ id: 'm2' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMeasurements,
      });

      const { result } = renderHook(
        () => useRecentMeasurements('athlete-123', 10),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.recentMeasurements).toHaveLength(2);
    });

    it('should return empty array when no measurements', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(
        () => useRecentMeasurements('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.recentMeasurements).toEqual([]);
    });
  });
});
