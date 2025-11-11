import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

export interface ReportFilters {
  search: string;
  reportType?: 'all' | 'individual' | 'team';
  dateFrom?: string;
  dateTo?: string;
  metrics: string[];
  teamIds: string[];
  pinned?: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

const DEFAULT_FILTERS: ReportFilters = {
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

/**
 * Hook for managing report filter state with URL synchronization
 *
 * Features:
 * - Debounced search (300ms)
 * - URL query param synchronization (shareable URLs)
 * - Active filter count
 * - Reset functionality
 */
export function useReportFilters() {
  const [internalSearch, setInternalSearch] = useState('');
  const [reportType, setReportType] = useState<'all' | 'individual' | 'team' | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);
  const [metrics, setMetrics] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [pinned, setPinned] = useState<boolean | undefined>(undefined);
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Debounce search to avoid excessive URL updates
  const debouncedSearch = useDebounce(internalSearch, 300);

  // Initialize from URL query params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const searchParam = params.get('search');
    if (searchParam) {
      setInternalSearch(searchParam);
    }

    const reportTypeParam = params.get('reportType');
    if (reportTypeParam === 'all' || reportTypeParam === 'individual' || reportTypeParam === 'team') {
      setReportType(reportTypeParam);
    }

    const dateFromParam = params.get('dateFrom');
    if (dateFromParam) {
      setDateFrom(dateFromParam);
    }

    const dateToParam = params.get('dateTo');
    if (dateToParam) {
      setDateTo(dateToParam);
    }

    const metricsParam = params.getAll('metrics');
    if (metricsParam.length > 0) {
      setMetrics(metricsParam);
    }

    const teamIdsParam = params.getAll('teamIds');
    if (teamIdsParam.length > 0) {
      setTeamIds(teamIdsParam);
    }

    const pinnedParam = params.get('pinned');
    if (pinnedParam === 'true') {
      setPinned(true);
    } else if (pinnedParam === 'false') {
      setPinned(false);
    }

    const sortByParam = params.get('sortBy');
    if (sortByParam) {
      setSortBy(sortByParam);
    }

    const sortOrderParam = params.get('sortOrder');
    if (sortOrderParam === 'asc' || sortOrderParam === 'desc') {
      setSortOrder(sortOrderParam);
    }
  }, []); // Only run on mount

  // Sync filters to URL (with debounced search)
  useEffect(() => {
    const params = new URLSearchParams();

    if (debouncedSearch) {
      params.set('search', debouncedSearch);
    }

    if (reportType) {
      params.set('reportType', reportType);
    }

    if (dateFrom) {
      params.set('dateFrom', dateFrom);
    }

    if (dateTo) {
      params.set('dateTo', dateTo);
    }

    metrics.forEach(metric => {
      params.append('metrics', metric);
    });

    teamIds.forEach(teamId => {
      params.append('teamIds', teamId);
    });

    if (pinned !== undefined) {
      params.set('pinned', String(pinned));
    }

    if (sortBy !== DEFAULT_FILTERS.sortBy) {
      params.set('sortBy', sortBy);
    }

    if (sortOrder !== DEFAULT_FILTERS.sortOrder) {
      params.set('sortOrder', sortOrder);
    }

    const queryString = params.toString();
    const newUrl = queryString ? `/reports?${queryString}` : '/reports';

    window.history.pushState({}, '', newUrl);
  }, [debouncedSearch, reportType, dateFrom, dateTo, metrics, teamIds, pinned, sortBy, sortOrder]);

  // Combined filters object
  const filters: ReportFilters = useMemo(() => ({
    search: debouncedSearch,
    reportType,
    dateFrom,
    dateTo,
    metrics,
    teamIds,
    pinned,
    sortBy,
    sortOrder,
  }), [debouncedSearch, reportType, dateFrom, dateTo, metrics, teamIds, pinned, sortBy, sortOrder]);

  // Active filter count (excluding defaults and sort)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (debouncedSearch) count++;
    if (reportType) count++;
    if (dateFrom) count++;
    if (dateTo) count++;
    if (metrics.length > 0) count++;
    if (teamIds.length > 0) count++;
    if (pinned !== undefined) count++;
    // Sort is not counted as an active filter
    return count;
  }, [debouncedSearch, reportType, dateFrom, dateTo, metrics, teamIds, pinned]);

  // Reset all filters
  const reset = useCallback(() => {
    setInternalSearch('');
    setReportType(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
    setMetrics([]);
    setTeamIds([]);
    setPinned(undefined);
    setSortBy(DEFAULT_FILTERS.sortBy);
    setSortOrder(DEFAULT_FILTERS.sortOrder);
  }, []);

  // Helper method to update multiple filters at once
  const updateFilters = useCallback((updates: Partial<ReportFilters>) => {
    if (updates.search !== undefined) setInternalSearch(updates.search);
    if (updates.reportType !== undefined) setReportType(updates.reportType);
    if (updates.dateFrom !== undefined) setDateFrom(updates.dateFrom);
    if (updates.dateTo !== undefined) setDateTo(updates.dateTo);
    if (updates.metrics !== undefined) setMetrics(updates.metrics);
    if (updates.teamIds !== undefined) setTeamIds(updates.teamIds);
    if (updates.pinned !== undefined) setPinned(updates.pinned);
    if (updates.sortBy !== undefined) setSortBy(updates.sortBy);
    if (updates.sortOrder !== undefined) setSortOrder(updates.sortOrder);
  }, []);

  // Alias reset as resetFilters for consistency
  const resetFilters = reset;

  return {
    filters,
    setSearch: setInternalSearch,
    setReportType,
    setDateFrom,
    setDateTo,
    setMetrics,
    setTeamIds,
    setPinned,
    setSortBy,
    setSortOrder,
    reset,
    updateFilters,
    resetFilters,
    activeFilterCount,
  };
}
