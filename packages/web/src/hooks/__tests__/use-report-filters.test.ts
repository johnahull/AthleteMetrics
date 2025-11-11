import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useReportFilters } from '../use-report-filters';

// Mock window.location and history
const mockPushState = vi.fn();
const mockReplaceState = vi.fn();

describe('useReportFilters', () => {
  beforeEach(() => {
    // Reset URL to clean state
    window.history.pushState({}, '', '/reports');

    // Mock history methods
    vi.spyOn(window.history, 'pushState').mockImplementation(mockPushState);
    vi.spyOn(window.history, 'replaceState').mockImplementation(mockReplaceState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default filter values', () => {
    const { result } = renderHook(() => useReportFilters());

    expect(result.current.filters).toEqual({
      search: '',
      reportType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      metrics: [],
      teamIds: [],
      pinned: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('should update search filter', async () => {
    const { result } = renderHook(() => useReportFilters());

    act(() => {
      result.current.setSearch('test query');
    });

    // Wait for debounce (300ms)
    await waitFor(() => {
      expect(result.current.filters.search).toBe('test query');
    }, { timeout: 400 });
  });

  it('should debounce search filter updates (300ms)', async () => {
    const { result } = renderHook(() => useReportFilters());

    // Rapidly type multiple characters
    act(() => {
      result.current.setSearch('t');
    });
    act(() => {
      result.current.setSearch('te');
    });
    act(() => {
      result.current.setSearch('tes');
    });
    act(() => {
      result.current.setSearch('test');
    });

    // Search should still be empty (debouncing)
    expect(result.current.filters.search).toBe('');

    // Wait for debounce
    await waitFor(() => {
      expect(result.current.filters.search).toBe('test');
    }, { timeout: 400 });
  });

  it('should update report type filter', () => {
    const { result } = renderHook(() => useReportFilters());

    act(() => {
      result.current.setReportType('team');
    });

    expect(result.current.filters.reportType).toBe('team');
  });

  it('should update date range filters', () => {
    const { result } = renderHook(() => useReportFilters());

    act(() => {
      result.current.setDateFrom('2025-01-01');
      result.current.setDateTo('2025-12-31');
    });

    expect(result.current.filters.dateFrom).toBe('2025-01-01');
    expect(result.current.filters.dateTo).toBe('2025-12-31');
  });

  it('should update metrics filter (array)', () => {
    const { result } = renderHook(() => useReportFilters());

    act(() => {
      result.current.setMetrics(['FLY10_TIME', 'VERTICAL_JUMP']);
    });

    expect(result.current.filters.metrics).toEqual(['FLY10_TIME', 'VERTICAL_JUMP']);
  });

  it('should update team IDs filter (array)', () => {
    const { result } = renderHook(() => useReportFilters());

    act(() => {
      result.current.setTeamIds(['team-1', 'team-2']);
    });

    expect(result.current.filters.teamIds).toEqual(['team-1', 'team-2']);
  });

  it('should update pinned filter', () => {
    const { result } = renderHook(() => useReportFilters());

    act(() => {
      result.current.setPinned(true);
    });

    expect(result.current.filters.pinned).toBe(true);
  });

  it('should update sort filters', () => {
    const { result } = renderHook(() => useReportFilters());

    act(() => {
      result.current.setSortBy('name');
      result.current.setSortOrder('asc');
    });

    expect(result.current.filters.sortBy).toBe('name');
    expect(result.current.filters.sortOrder).toBe('asc');
  });

  it('should reset all filters to defaults', () => {
    const { result } = renderHook(() => useReportFilters());

    // Set various filters
    act(() => {
      result.current.setSearch('test');
      result.current.setReportType('team');
      result.current.setMetrics(['FLY10_TIME']);
      result.current.setPinned(true);
    });

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.filters).toEqual({
      search: '',
      reportType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      metrics: [],
      teamIds: [],
      pinned: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('should sync filters to URL query params', async () => {
    const { result } = renderHook(() => useReportFilters());

    act(() => {
      result.current.setSearch('test');
      result.current.setReportType('team');
      result.current.setMetrics(['FLY10_TIME', 'VERTICAL_JUMP']);
    });

    // Wait for debounced search to apply
    await waitFor(() => {
      expect(result.current.filters.search).toBe('test');
    }, { timeout: 400 });

    // Should have called pushState with updated URL
    expect(mockPushState).toHaveBeenCalled();
    const lastCall = mockPushState.mock.calls[mockPushState.mock.calls.length - 1];
    const url = lastCall[2] as string;

    expect(url).toContain('search=test');
    expect(url).toContain('reportType=team');
    expect(url).toContain('metrics=FLY10_TIME');
    expect(url).toContain('metrics=VERTICAL_JUMP');
  });

  it('should initialize filters from URL query params', async () => {
    // Mock window.location.search for this test
    const originalSearch = window.location.search;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        search: '?search=initial&reportType=individual&pinned=true&sortBy=name&sortOrder=asc'
      }
    });

    const { result } = renderHook(() => useReportFilters());

    // Wait for debounced search to apply from initial URL
    await waitFor(() => {
      expect(result.current.filters.search).toBe('initial');
    }, { timeout: 400 });

    expect(result.current.filters.reportType).toBe('individual');
    expect(result.current.filters.pinned).toBe(true);
    expect(result.current.filters.sortBy).toBe('name');
    expect(result.current.filters.sortOrder).toBe('asc');

    // Restore original search
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        search: originalSearch
      }
    });
  });

  it('should handle array query params correctly', async () => {
    // Mock window.location.search for this test
    const originalSearch = window.location.search;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        search: '?metrics=FLY10_TIME&metrics=VERTICAL_JUMP&teamIds=team-1&teamIds=team-2'
      }
    });

    const { result } = renderHook(() => useReportFilters());

    // Array params should be initialized immediately (no debounce for these)
    expect(result.current.filters.metrics).toEqual(['FLY10_TIME', 'VERTICAL_JUMP']);
    expect(result.current.filters.teamIds).toEqual(['team-1', 'team-2']);

    // Restore original search
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        search: originalSearch
      }
    });
  });

  it('should clear URL params when resetting filters', () => {
    // Set URL with query params
    window.history.pushState(
      {},
      '',
      '/reports?search=test&reportType=team'
    );

    const { result } = renderHook(() => useReportFilters());

    act(() => {
      result.current.reset();
    });

    // Should push clean URL
    expect(mockPushState).toHaveBeenCalled();
    const lastCall = mockPushState.mock.calls[mockPushState.mock.calls.length - 1];
    const url = lastCall[2] as string;

    expect(url).toBe('/reports');
  });

  it('should provide active filter count', async () => {
    const { result } = renderHook(() => useReportFilters());

    // Initially no active filters (except defaults)
    expect(result.current.activeFilterCount).toBe(0);

    act(() => {
      result.current.setSearch('test');
      result.current.setReportType('team');
      result.current.setMetrics(['FLY10_TIME']);
    });

    // Wait for debounced search
    await waitFor(() => {
      expect(result.current.filters.search).toBe('test');
    }, { timeout: 400 });

    // Should count 3 active filters
    expect(result.current.activeFilterCount).toBe(3);

    act(() => {
      result.current.reset();
    });

    // Wait for debounced search to clear
    await waitFor(() => {
      expect(result.current.activeFilterCount).toBe(0);
    }, { timeout: 400 });
  });

  it('should not count default sort values as active filters', () => {
    const { result } = renderHook(() => useReportFilters());

    // Default sort should not count
    expect(result.current.activeFilterCount).toBe(0);

    act(() => {
      result.current.setSortBy('name');
    });

    // Changed sort should not count as active filter
    expect(result.current.activeFilterCount).toBe(0);
  });
});
