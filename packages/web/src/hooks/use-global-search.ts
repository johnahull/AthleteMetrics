/**
 * Global search hook for command palette
 * Uses React Query with debouncing to search across athletes, teams, and measurements
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useDebounce } from './useDebounce';

export interface GlobalSearchResult {
  results: {
    athletes: AthleteSearchResult[];
    teams: TeamSearchResult[];
    measurements: MeasurementSearchResult[];
  };
  total: number;
}

export interface AthleteSearchResult {
  id: string;
  name: string;
  team: string | null;
  birthYear: number | null;
  gender: string | null;
}

export interface TeamSearchResult {
  id: string;
  name: string;
  level: string | null;
  athleteCount: number;
}

export interface MeasurementSearchResult {
  id: string;
  athleteName: string;
  metric: string;
  date: string;
  value: number;
}

export interface UseGlobalSearchOptions {
  query: string;
  limit?: number;
  includeAthletes?: boolean;
  includeTeams?: boolean;
  includeMeasurements?: boolean;
  debounceMs?: number;
}

/**
 * Hook for global search across all entity types
 */
export function useGlobalSearch(options: UseGlobalSearchOptions) {
  const {
    query,
    limit = 20,
    includeAthletes = true,
    includeTeams = true,
    includeMeasurements = true,
    debounceMs = 300,
  } = options;

  // Debounce the search query to avoid excessive API calls
  const debouncedQuery = useDebounce(query, debounceMs);

  return useQuery<GlobalSearchResult>({
    queryKey: ['/api/search/global', debouncedQuery, limit, includeAthletes, includeTeams, includeMeasurements],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('q', debouncedQuery);
      params.set('limit', limit.toString());

      if (!includeAthletes) params.set('includeAthletes', 'false');
      if (!includeTeams) params.set('includeTeams', 'false');
      if (!includeMeasurements) params.set('includeMeasurements', 'false');

      const response = await apiRequest('GET', `/api/search/global?${params}`);
      if (!response.ok) {
        throw new Error('Search failed');
      }

      return response.json();
    },
    // Only search if query has at least 2 characters (matches backend validation)
    enabled: debouncedQuery.length >= 2,
    // Cache results for 5 minutes
    staleTime: 5 * 60 * 1000,
    // Don't retry on failure (search should be fast)
    retry: false,
  });
}
