import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDismissReport } from '../use-my-reports';

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

describe('useMyReports Hook', () => {
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

  describe('useDismissReport - Dismiss shared report operations', () => {
    it('should dismiss a shared report successfully', async () => {
      const mockResponse = {
        id: 'share-123',
        dismissedAt: '2026-01-23T04:00:00Z',
      };

      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useDismissReport(), { wrapper });

      await result.current.mutateAsync('share-123');

      expect(mockApiRequest).toHaveBeenCalledWith('DELETE', '/api/my/reports/share-123');
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Report Dismissed',
          description: 'This report has been removed from your list.',
        });
      });
    });

    it('should handle dismiss operation failure', async () => {
      const errorMessage = 'Share not found';
      mockApiRequest.mockRejectedValueOnce(new Error(errorMessage));

      const { result } = renderHook(() => useDismissReport(), { wrapper });

      try {
        await result.current.mutateAsync('share-invalid');
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

    it('should handle already dismissed share error', async () => {
      const errorMessage = 'This report has already been dismissed';
      mockApiRequest.mockRejectedValueOnce(new Error(errorMessage));

      const { result } = renderHook(() => useDismissReport(), { wrapper });

      try {
        await result.current.mutateAsync('share-123');
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

    it('should handle network failure gracefully', async () => {
      const errorMessage = 'Network error';
      mockApiRequest.mockRejectedValueOnce(new Error(errorMessage));

      const { result } = renderHook(() => useDismissReport(), { wrapper });

      try {
        await result.current.mutateAsync('share-123');
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

    it('should invalidate my-reports cache after dismiss', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'share-123', dismissedAt: '2026-01-23T04:00:00Z' }),
      });

      const { result } = renderHook(() => useDismissReport(), { wrapper });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await result.current.mutateAsync('share-123');

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ['my-reports'],
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ['my-reports', 'unread-count'],
        });
      });
    });

    it('should handle empty error message with fallback', async () => {
      // Simulate error with no message
      const errorWithoutMessage = new Error();
      mockApiRequest.mockRejectedValueOnce(errorWithoutMessage);

      const { result } = renderHook(() => useDismissReport(), { wrapper });

      try {
        await result.current.mutateAsync('share-123');
      } catch (error) {
        // Expected error
      }

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to dismiss report',
          variant: 'destructive',
        });
      });
    });
  });
});
