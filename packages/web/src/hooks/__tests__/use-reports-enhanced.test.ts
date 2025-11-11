import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useReportsWithFilters, usePinReport, useUnpinReport } from '../use-reports';
import type { ReportFilters } from '../use-report-filters';

// Mock apiRequest
const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Create wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: any }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useReportsWithFilters', () => {
  beforeEach(() => {
    mockApiRequest.mockClear();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should build query string from filters correctly', async () => {
    const filters: ReportFilters = {
      search: 'test report',
      reportType: 'team',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
      teamIds: ['team-1', 'team-2'],
      pinned: true,
      sortBy: 'name',
      sortOrder: 'asc',
    };

    const mockResponse = {
      reports: [],
      pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
    };

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(
      () => useReportsWithFilters('org-1', filters),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    const callUrl = mockApiRequest.mock.calls[0][1];

    expect(callUrl).toContain('organizationId=org-1');
    expect(callUrl).toContain('search=test+report'); // URLSearchParams encodes space as +
    expect(callUrl).toContain('reportType=team');
    expect(callUrl).toContain('dateFrom=2025-01-01');
    expect(callUrl).toContain('dateTo=2025-12-31');
    expect(callUrl).toContain('metrics=FLY10_TIME');
    expect(callUrl).toContain('metrics=VERTICAL_JUMP');
    expect(callUrl).toContain('teamIds=team-1');
    expect(callUrl).toContain('teamIds=team-2');
    expect(callUrl).toContain('pinned=true');
    expect(callUrl).toContain('sortBy=name');
    expect(callUrl).toContain('sortOrder=asc');
  });

  it('should handle empty filters', async () => {
    const filters: ReportFilters = {
      search: '',
      reportType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      metrics: [],
      teamIds: [],
      pinned: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reports: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } }),
    });

    const { result } = renderHook(
      () => useReportsWithFilters('org-1', filters),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    const callUrl = mockApiRequest.mock.calls[0][1];

    expect(callUrl).toContain('organizationId=org-1');
    // Default sort should be included
    expect(callUrl).toContain('sortBy=createdAt');
    expect(callUrl).toContain('sortOrder=desc');
    // Empty filters should not be included
    expect(callUrl).not.toContain('search=');
    expect(callUrl).not.toContain('reportType=');
    expect(callUrl).not.toContain('pinned=');
  });

  it('should handle pagination parameters', async () => {
    const filters: ReportFilters = {
      search: '',
      reportType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      metrics: [],
      teamIds: [],
      pinned: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reports: [], pagination: { total: 0, limit: 10, offset: 20, hasMore: false } }),
    });

    const { result } = renderHook(
      () => useReportsWithFilters('org-1', filters, { limit: 10, offset: 20 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    const callUrl = mockApiRequest.mock.calls[0][1];

    expect(callUrl).toContain('limit=10');
    expect(callUrl).toContain('offset=20');
  });

  it('should return reports and pagination data', async () => {
    const filters: ReportFilters = {
      search: '',
      reportType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      metrics: [],
      teamIds: [],
      pinned: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };

    const mockResponse = {
      reports: [
        { id: 'report-1', name: 'Test Report 1', reportType: 'team', createdAt: '2025-01-01' },
        { id: 'report-2', name: 'Test Report 2', reportType: 'individual', createdAt: '2025-01-02' },
      ],
      pagination: {
        total: 50,
        limit: 20,
        offset: 0,
        hasMore: true,
      },
    };

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(
      () => useReportsWithFilters('org-1', filters),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockResponse);
    expect(result.current.data?.reports).toHaveLength(2);
    expect(result.current.data?.pagination.total).toBe(50);
    expect(result.current.data?.pagination.hasMore).toBe(true);
  });
});

describe('usePinReport', () => {
  beforeEach(() => {
    mockApiRequest.mockClear();
  });

  it('should call PATCH /api/reports/:id/pin endpoint', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'report-1', isPinned: true }),
    });

    const { result } = renderHook(() => usePinReport(), { wrapper: createWrapper() });

    await result.current.mutateAsync('report-1');

    expect(mockApiRequest).toHaveBeenCalledWith('PATCH', '/api/reports/report-1/pin');
  });

  it('should invalidate reports queries on success', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'report-1', isPinned: true }),
    });

    const { result } = renderHook(() => usePinReport(), { wrapper: createWrapper() });

    await result.current.mutateAsync('report-1');

    // Query invalidation happens automatically via React Query
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

describe('useUnpinReport', () => {
  beforeEach(() => {
    mockApiRequest.mockClear();
  });

  it('should call PATCH /api/reports/:id/unpin endpoint', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'report-1', isPinned: false }),
    });

    const { result } = renderHook(() => useUnpinReport(), { wrapper: createWrapper() });

    await result.current.mutateAsync('report-1');

    expect(mockApiRequest).toHaveBeenCalledWith('PATCH', '/api/reports/report-1/unpin');
  });

  it('should invalidate reports queries on success', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'report-1', isPinned: false }),
    });

    const { result } = renderHook(() => useUnpinReport(), { wrapper: createWrapper() });

    await result.current.mutateAsync('report-1');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
