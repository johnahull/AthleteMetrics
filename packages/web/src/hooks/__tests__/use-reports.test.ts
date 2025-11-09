import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useReports, useCreateReport } from '../use-reports';

// Mock apiRequest
const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

// Mock toast
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('useReports Hook', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    );

    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('useReports - Fetching reports', () => {
    it('should fetch reports with organizationId query parameter', async () => {
      const mockReports = [
        { id: 'report-1', name: 'Report 1', organizationId: 'org-123' },
        { id: 'report-2', name: 'Report 2', organizationId: 'org-123' },
      ];

      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => mockReports,
      });

      const { result } = renderHook(() => useReports('org-123'), { wrapper });

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      expect(mockApiRequest).toHaveBeenCalledWith('GET', '/api/reports?organizationId=org-123');
      expect(result.current.data).toEqual(mockReports);
    });

    it('should fetch all reports when no organizationId provided', async () => {
      const mockReports = [
        { id: 'report-1', name: 'Report 1', organizationId: 'org-123' },
        { id: 'report-2', name: 'Report 2', organizationId: 'org-456' },
      ];

      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => mockReports,
      });

      const { result } = renderHook(() => useReports(), { wrapper });

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      expect(mockApiRequest).toHaveBeenCalledWith('GET', '/api/reports');
      expect(result.current.data).toEqual(mockReports);
    });

    it('should use correct query key with organizationId', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useReports('org-123'), { wrapper });

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      // Verify query is cached with organizationId in key
      const cachedData = queryClient.getQueryData(['/api/reports', 'org-123']);
      expect(cachedData).toEqual([]);
    });

    it('should handle undefined organizationId correctly', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useReports(undefined), { wrapper });

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      expect(mockApiRequest).toHaveBeenCalledWith('GET', '/api/reports');
    });

    it('should handle errors when fetching reports', async () => {
      const errorMessage = 'Failed to fetch reports';
      mockApiRequest.mockRejectedValueOnce(new Error(errorMessage));

      const { result } = renderHook(() => useReports('org-123'), { wrapper });

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect((result.current.error as Error).message).toBe(errorMessage);
    });
  });

  describe('useCreateReport - Creating reports', () => {
    it('should require organizationId in mutation payload', async () => {
      const mockCreatedReport = {
        id: 'report-new',
        name: 'New Report',
        organizationId: 'org-123',
        reportType: 'coach',
      };

      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCreatedReport,
      });

      const { result } = renderHook(() => useCreateReport(), { wrapper });

      const reportData = {
        name: 'New Report',
        reportType: 'coach' as const,
        organizationId: 'org-123',
        config: {
          timeframe: { type: 'preset' as const, preset: 'season' as const },
          metrics: ['FLY10_TIME'],
        },
      };

      await result.current.mutateAsync(reportData);

      expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/reports', reportData);
    });

    it('should include organizationId in POST request body', async () => {
      const reportData = {
        name: 'Test Report',
        reportType: 'individual' as const,
        organizationId: 'org-456',
        config: {
          timeframe: { type: 'preset' as const, preset: 'all_time' as const },
          metrics: ['VERTICAL_JUMP'],
        },
      };

      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...reportData, id: 'report-123' }),
      });

      const { result } = renderHook(() => useCreateReport(), { wrapper });

      await result.current.mutateAsync(reportData);

      expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/reports', reportData);
      expect(mockApiRequest.mock.calls[0][2]).toHaveProperty('organizationId', 'org-456');
    });

    it('should show success toast on successful creation', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'report-new', name: 'New Report' }),
      });

      const { result } = renderHook(() => useCreateReport(), { wrapper });

      await result.current.mutateAsync({
        name: 'New Report',
        reportType: 'coach' as const,
        organizationId: 'org-123',
        config: {
          timeframe: { type: 'preset' as const, preset: 'season' as const },
          metrics: ['FLY10_TIME'],
        },
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Success',
          description: 'Report created successfully',
        });
      });
    });

    it('should show error toast on failed creation', async () => {
      const errorMessage = 'Organization ID is required';
      mockApiRequest.mockRejectedValueOnce(new Error(errorMessage));

      const { result } = renderHook(() => useCreateReport(), { wrapper });

      try {
        await result.current.mutateAsync({
          name: 'Test Report',
          reportType: 'coach' as const,
          organizationId: 'org-123',
          config: {
            timeframe: { type: 'preset' as const, preset: 'season' as const },
            metrics: ['FLY10_TIME'],
          },
        });
      } catch (error) {
        // Expected error
      }

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      });
    });

    it('should invalidate reports query cache after successful creation', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'report-new', name: 'New Report' }),
      });

      const { result } = renderHook(() => useCreateReport(), { wrapper });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await result.current.mutateAsync({
        name: 'New Report',
        reportType: 'coach' as const,
        organizationId: 'org-123',
        config: {
          timeframe: { type: 'preset' as const, preset: 'season' as const },
          metrics: ['FLY10_TIME'],
        },
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ['/api/reports'],
        });
      });
    });

    it('should validate config structure includes required fields', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'report-new' }),
      });

      const { result } = renderHook(() => useCreateReport(), { wrapper });

      const reportData = {
        name: 'Config Test Report',
        reportType: 'coach' as const,
        organizationId: 'org-789',
        config: {
          timeframe: { type: 'custom' as const, customStart: '2024-01-01', customEnd: '2024-12-31' },
          metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
          benchmarks: {
            site: ['benchmark-1'],
            custom: ['custom-1'],
          },
          compositeIndex: {
            enabled: true,
            weights: { 'FLY10_TIME': 0.6, 'VERTICAL_JUMP': 0.4 },
          },
          filters: {
            teamIds: ['team-1'],
            gender: 'Male',
          },
        },
      };

      await result.current.mutateAsync(reportData);

      expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/reports', reportData);

      const payload = mockApiRequest.mock.calls[0][2];
      expect(payload.config.timeframe).toBeDefined();
      expect(payload.config.metrics).toBeInstanceOf(Array);
      expect(payload.config.benchmarks).toBeDefined();
      expect(payload.config.compositeIndex).toBeDefined();
      expect(payload.config.filters).toBeDefined();
    });
  });
});
