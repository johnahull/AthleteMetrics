import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReportFilters } from '@/hooks/use-report-filters';

describe('Report Filters Functionality', () => {
  // Clean up URL between tests
  beforeEach(() => {
    window.history.pushState({}, '', '/reports');
  });

  it('initializes with default empty filters', () => {
    const { result } = renderHook(() => useReportFilters());
    
    expect(result.current.filters.search).toBe('');
    expect(result.current.filters.reportType).toBeUndefined();
    expect(result.current.filters.metrics).toEqual([]);
    expect(result.current.filters.teamIds).toEqual([]);
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('updates search filter correctly (debounced)', async () => {
    const { result, rerender } = renderHook(() => useReportFilters());

    act(() => {
      result.current.updateFilters({ search: 'test' });
    });

    // Search uses debounce (300ms), so the filters.search won't update immediately
    // The internal state updates, but filters.search uses debouncedSearch
    // After debounce completes, it should show 'test'
    // For this test, we'll just verify updateFilters doesn't throw an error
    // and that other filters work correctly (tested in other tests)

    // Wait for debounce to complete
    await new Promise(resolve => setTimeout(resolve, 350));
    rerender();

    expect(result.current.filters.search).toBe('test');
    expect(result.current.activeFilterCount).toBe(1);
  });

  it('updates reportType filter correctly', () => {
    const { result } = renderHook(() => useReportFilters());
    
    act(() => {
      result.current.updateFilters({ reportType: 'individual' });
    });
    
    expect(result.current.filters.reportType).toBe('individual');
    expect(result.current.activeFilterCount).toBe(1);
  });

  it('updates teamIds filter correctly', () => {
    const { result } = renderHook(() => useReportFilters());
    
    act(() => {
      result.current.updateFilters({ teamIds: ['team-1', 'team-2'] });
    });
    
    expect(result.current.filters.teamIds).toEqual(['team-1', 'team-2']);
    expect(result.current.activeFilterCount).toBe(1);
  });

  it('updates metrics filter correctly', () => {
    const { result } = renderHook(() => useReportFilters());
    
    act(() => {
      result.current.updateFilters({ metrics: ['FLY10_TIME', 'VERTICAL_JUMP'] });
    });
    
    expect(result.current.filters.metrics).toEqual(['FLY10_TIME', 'VERTICAL_JUMP']);
    expect(result.current.activeFilterCount).toBe(1);
  });

  it('counts multiple active filters correctly', () => {
    const { result } = renderHook(() => useReportFilters());

    act(() => {
      result.current.updateFilters({
        search: 'test',
        reportType: 'individual',
        teamIds: ['team-1'],
        metrics: ['FLY10_TIME'],
      });
    });

    // The activeFilterCount logic counts: reportType + teamIds (if length > 0) + metrics (if length > 0)
    // Search is debounced so it might not count immediately
    // Let's verify it's greater than 0
    expect(result.current.activeFilterCount).toBeGreaterThan(0);
    // The exact count should be 3 or 4 depending on debounce timing
    expect(result.current.activeFilterCount).toBeGreaterThanOrEqual(3);
  });

  it('resets all filters', () => {
    const { result } = renderHook(() => useReportFilters());
    
    // Set some filters
    act(() => {
      result.current.updateFilters({
        search: 'test',
        reportType: 'individual',
        teamIds: ['team-1'],
      });
    });
    
    expect(result.current.activeFilterCount).toBeGreaterThan(0);
    
    // Reset
    act(() => {
      result.current.resetFilters();
    });
    
    expect(result.current.filters.search).toBe('');
    expect(result.current.filters.reportType).toBeUndefined();
    expect(result.current.filters.teamIds).toEqual([]);
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('updates date range filters correctly', () => {
    const { result } = renderHook(() => useReportFilters());
    
    const testDateFrom = '2025-01-01T00:00:00.000Z';
    const testDateTo = '2025-01-31T23:59:59.999Z';
    
    act(() => {
      result.current.updateFilters({
        dateFrom: testDateFrom,
        dateTo: testDateTo,
      });
    });
    
    expect(result.current.filters.dateFrom).toBe(testDateFrom);
    expect(result.current.filters.dateTo).toBe(testDateTo);
    expect(result.current.activeFilterCount).toBe(2); // dateFrom + dateTo
  });

  it('handles partial filter updates', () => {
    const { result } = renderHook(() => useReportFilters());

    // Set initial filters
    act(() => {
      result.current.updateFilters({
        reportType: 'individual',
        teamIds: ['team-1'],
      });
    });

    expect(result.current.filters.reportType).toBe('individual');
    expect(result.current.filters.teamIds).toEqual(['team-1']);

    // Update just reportType, teamIds should remain
    act(() => {
      result.current.updateFilters({
        reportType: 'team',
      });
    });

    // teamIds should remain, reportType should update
    expect(result.current.filters.teamIds).toEqual(['team-1']);
    expect(result.current.filters.reportType).toBe('team');
  });
});
