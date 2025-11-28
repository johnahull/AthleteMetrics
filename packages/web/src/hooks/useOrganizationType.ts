/**
 * Organization Type React Hooks
 * 
 * @fileoverview Custom hooks for organization type operations in React components.
 * Provides optimized, type-safe hooks for common organization type operations.
 * 
 * @author AthleteMetrics System
 * @version 1.0.0  
 * @since 2025-11-09
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type OrganizationType,
  getOrganizationTypeLabel,
  getOrganizationTypeOptions,
  isValidOrganizationType,
  ORGANIZATION_TYPE_LABELS,
} from '@shared/organization-type-utils';
import {
  type OrganizationTypeStatistics,
  type MetricsByOrganizationTypeResponse,
  type BenchmarksByOrganizationTypeResponse,
  type OrganizationTypeValidationResult,
} from '@shared/organization-type-types';
import { STALE_TIME } from '@/lib/queryClient';

/**
 * Hook configuration for organization type operations
 */
interface UseOrganizationTypeConfig {
  /** Enable caching for queries (default: true) */
  enableCache?: boolean;
  /** Cache time in milliseconds (default: 5 minutes) */
  cacheTime?: number;
  /** Stale time in milliseconds (default: 2 minutes) */
  staleTime?: number;
  /** Enable background refetch (default: true) */
  refetchOnWindowFocus?: boolean;
}

/**
 * Default configuration for organization type hooks
 */
const DEFAULT_CONFIG: Required<UseOrganizationTypeConfig> = {
  enableCache: true,
  cacheTime: 5 * 60 * 1000, // 5 minutes
  staleTime: STALE_TIME.REALTIME, // 1 minute - organization type data changes occasionally
  refetchOnWindowFocus: true,
};

/**
 * Hook for managing organization type selection and validation
 * 
 * @param initialValue - Initial organization type value
 * @param config - Hook configuration
 * @returns Organization type state and utilities
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { 
 *     organizationType, 
 *     setOrganizationType, 
 *     isValid, 
 *     label,
 *     validate 
 *   } = useOrganizationType('college');
 *   
 *   return (
 *     <div>
 *       <p>Current: {label}</p>
 *       <button onClick={() => setOrganizationType('high_school')}>
 *         Switch to High School
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useOrganizationType(
  initialValue?: OrganizationType | null,
  config: UseOrganizationTypeConfig = {}
) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [organizationType, setOrgType] = useState<OrganizationType | null>(
    initialValue || null
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  // Memoized validation result
  const validationResult = useMemo<OrganizationTypeValidationResult>(() => {
    if (organizationType === null) {
      return { valid: true, value: null };
    }
    
    const isValid = isValidOrganizationType(organizationType);
    return {
      valid: isValid,
      value: isValid ? organizationType : null,
      error: isValid ? undefined : `Invalid organization type: ${organizationType}`,
    };
  }, [organizationType]);

  // Memoized label
  const label = useMemo(() => {
    return organizationType ? getOrganizationTypeLabel(organizationType) : null;
  }, [organizationType]);

  // Validated setter with error handling
  const setOrganizationType = useCallback((value: OrganizationType | null) => {
    if (value !== null && !isValidOrganizationType(value)) {
      setValidationError(`Invalid organization type: ${value}`);
      return false;
    }
    
    setValidationError(null);
    setOrgType(value);
    return true;
  }, []);

  // Manual validation function
  const validate = useCallback((value: unknown): OrganizationTypeValidationResult => {
    if (value === null || value === undefined) {
      return { valid: true, value: null };
    }
    
    const isValid = isValidOrganizationType(value);
    return {
      valid: isValid,
      value: isValid ? value : null,
      error: isValid ? undefined : `Invalid organization type: ${value}`,
    };
  }, []);

  // Reset function
  const reset = useCallback(() => {
    setOrgType(initialValue || null);
    setValidationError(null);
  }, [initialValue]);

  return {
    organizationType,
    setOrganizationType,
    isValid: validationResult.valid,
    validationError: validationError || validationResult.error,
    validationResult,
    label,
    validate,
    reset,
  };
}

/**
 * Hook for fetching metrics filtered by organization type
 * 
 * @param organizationType - Organization type to filter by
 * @param config - Hook configuration
 * @returns Query result for metrics
 */
export function useMetricsByOrganizationType(
  organizationType: OrganizationType | null,
  config: UseOrganizationTypeConfig = {}
) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return useQuery({
    queryKey: ['metrics', 'organizationType', organizationType],
    queryFn: async (): Promise<MetricsByOrganizationTypeResponse> => {
      if (!organizationType) {
        throw new Error('Organization type is required');
      }

      const response = await fetch(`/api/organization-types/${organizationType}/metrics`);
      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!organizationType && isValidOrganizationType(organizationType),
    staleTime: finalConfig.staleTime,
    gcTime: finalConfig.cacheTime,
    refetchOnWindowFocus: finalConfig.refetchOnWindowFocus,
    retry: 2,
  });
}

/**
 * Hook for fetching benchmarks filtered by organization type
 * 
 * @param organizationType - Organization type to filter by  
 * @param config - Hook configuration
 * @returns Query result for benchmarks
 */
export function useBenchmarksByOrganizationType(
  organizationType: OrganizationType | null,
  config: UseOrganizationTypeConfig = {}
) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return useQuery({
    queryKey: ['benchmarks', 'organizationType', organizationType],
    queryFn: async (): Promise<BenchmarksByOrganizationTypeResponse> => {
      if (!organizationType) {
        throw new Error('Organization type is required');
      }

      const response = await fetch(`/api/organization-types/${organizationType}/benchmarks`);
      if (!response.ok) {
        throw new Error(`Failed to fetch benchmarks: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!organizationType && isValidOrganizationType(organizationType),
    staleTime: finalConfig.staleTime,
    gcTime: finalConfig.cacheTime,
    refetchOnWindowFocus: finalConfig.refetchOnWindowFocus,
    retry: 2,
  });
}

/**
 * Hook for fetching organization type statistics (site admin only)
 * 
 * @param config - Hook configuration
 * @returns Query result for organization type statistics
 */
export function useOrganizationTypeStatistics(
  config: UseOrganizationTypeConfig = {}
) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return useQuery({
    queryKey: ['organizationTypes', 'statistics'],
    queryFn: async (): Promise<OrganizationTypeStatistics> => {
      const response = await fetch('/api/organization-types/statistics');
      if (!response.ok) {
        throw new Error(`Failed to fetch statistics: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: finalConfig.staleTime,
    gcTime: finalConfig.cacheTime,
    refetchOnWindowFocus: finalConfig.refetchOnWindowFocus,
    retry: 2,
  });
}

/**
 * Hook for bulk organization type validation
 * 
 * @returns Mutation for validating organization types
 */
export function useOrganizationTypeValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ values, field = 'orgType' }: { 
      values: unknown[], 
      field?: string 
    }) => {
      const response = await fetch('/api/organization-types/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, field }),
      });
      
      if (!response.ok) {
        throw new Error(`Validation failed: ${response.statusText}`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['organizationTypes'] });
    },
  });
}

/**
 * Hook for managing organization type filters
 * Provides utilities for filtering and managing multiple organization types
 * 
 * @param initialTypes - Initial organization types
 * @returns Filter state and utilities
 */
export function useOrganizationTypeFilter(
  initialTypes: OrganizationType[] = []
) {
  const [selectedTypes, setSelectedTypes] = useState<Set<OrganizationType>>(
    new Set(initialTypes.filter(isValidOrganizationType))
  );

  // Memoized arrays for better performance
  const selectedArray = useMemo(
    () => Array.from(selectedTypes).sort(),
    [selectedTypes]
  );

  const availableTypes = useMemo(
    () => getOrganizationTypeOptions(),
    []
  );

  const unselectedTypes = useMemo(
    () => availableTypes.filter(type => !selectedTypes.has(type.value)),
    [availableTypes, selectedTypes]
  );

  // Add organization type to filter
  const addType = useCallback((type: OrganizationType) => {
    if (!isValidOrganizationType(type)) return false;
    
    setSelectedTypes(prev => new Set(prev).add(type));
    return true;
  }, []);

  // Remove organization type from filter
  const removeType = useCallback((type: OrganizationType) => {
    setSelectedTypes(prev => {
      const newSet = new Set(prev);
      newSet.delete(type);
      return newSet;
    });
  }, []);

  // Toggle organization type in filter
  const toggleType = useCallback((type: OrganizationType) => {
    if (!isValidOrganizationType(type)) return false;
    
    setSelectedTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
    return true;
  }, []);

  // Clear all selected types
  const clearAll = useCallback(() => {
    setSelectedTypes(new Set());
  }, []);

  // Select all available types
  const selectAll = useCallback(() => {
    setSelectedTypes(new Set(availableTypes.map(type => type.value)));
  }, [availableTypes]);

  // Check if type is selected
  const isSelected = useCallback((type: OrganizationType) => {
    return selectedTypes.has(type);
  }, [selectedTypes]);

  // Set multiple types at once
  const setTypes = useCallback((types: OrganizationType[]) => {
    const validTypes = types.filter(isValidOrganizationType);
    setSelectedTypes(new Set(validTypes));
  }, []);

  return {
    selectedTypes: selectedArray,
    selectedSet: selectedTypes,
    availableTypes,
    unselectedTypes,
    hasSelection: selectedTypes.size > 0,
    selectionCount: selectedTypes.size,
    addType,
    removeType,
    toggleType,
    clearAll,
    selectAll,
    isSelected,
    setTypes,
  };
}

/**
 * Hook for performance-optimized organization type caching
 * Uses a local cache to minimize API calls for frequently accessed data
 * 
 * @param config - Hook configuration
 * @returns Cache utilities and statistics
 */
export function useOrganizationTypeCache(
  config: UseOrganizationTypeConfig = {}
) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const cache = useRef(new Map<string, { data: any; timestamp: number; expiry: number }>());
  const [stats, setStats] = useState({
    hits: 0,
    misses: 0,
    size: 0,
  });

  const get = useCallback(<T>(key: string): T | null => {
    const entry = cache.current.get(key);
    if (!entry) {
      setStats(prev => ({ ...prev, misses: prev.misses + 1 }));
      return null;
    }

    if (Date.now() > entry.expiry) {
      cache.current.delete(key);
      setStats(prev => ({ 
        ...prev, 
        misses: prev.misses + 1,
        size: cache.current.size,
      }));
      return null;
    }

    setStats(prev => ({ ...prev, hits: prev.hits + 1 }));
    return entry.data;
  }, []);

  const set = useCallback(<T>(key: string, data: T, ttl?: number): void => {
    const now = Date.now();
    const expiry = now + (ttl || finalConfig.cacheTime);
    
    cache.current.set(key, { data, timestamp: now, expiry });
    setStats(prev => ({ ...prev, size: cache.current.size }));
  }, [finalConfig.cacheTime]);

  const invalidate = useCallback((pattern?: string): number => {
    if (pattern) {
      let deleted = 0;
      for (const [key] of cache.current) {
        if (key.includes(pattern)) {
          cache.current.delete(key);
          deleted++;
        }
      }
      setStats(prev => ({ ...prev, size: cache.current.size }));
      return deleted;
    } else {
      const size = cache.current.size;
      cache.current.clear();
      setStats(prev => ({ ...prev, size: 0 }));
      return size;
    }
  }, []);

  const getHitRate = useCallback((): number => {
    const total = stats.hits + stats.misses;
    return total > 0 ? Math.round((stats.hits / total) * 100) : 0;
  }, [stats.hits, stats.misses]);

  return {
    get,
    set,
    invalidate,
    stats,
    hitRate: getHitRate(),
  };
}

/**
 * Hook for debounced organization type search/filtering
 * Useful for search inputs and real-time filtering
 * 
 * @param searchTerm - Search term
 * @param delay - Debounce delay in milliseconds (default: 300)
 * @returns Filtered organization type options
 */
export function useOrganizationTypeSearch(
  searchTerm: string = '',
  delay: number = 300
) {
  const [debouncedTerm, setDebouncedTerm] = useState(searchTerm);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, delay);

    return () => clearTimeout(timer);
  }, [searchTerm, delay]);

  // Memoized filtered results
  const filteredTypes = useMemo(() => {
    const options = getOrganizationTypeOptions();
    
    if (!debouncedTerm.trim()) {
      return options;
    }

    const term = debouncedTerm.toLowerCase();
    return options.filter(option => 
      option.label.toLowerCase().includes(term) ||
      option.description.toLowerCase().includes(term) ||
      option.value.toLowerCase().includes(term)
    );
  }, [debouncedTerm]);

  return {
    searchTerm: debouncedTerm,
    filteredTypes,
    hasResults: filteredTypes.length > 0,
    resultCount: filteredTypes.length,
  };
}

/**
 * Hook for organization type labels with memoization
 * Optimized for components that need labels for multiple types
 * 
 * @param organizationTypes - Array of organization types
 * @returns Memoized labels map
 */
export function useOrganizationTypeLabels(
  organizationTypes: readonly OrganizationType[]
) {
  return useMemo(() => {
    const labelsMap = new Map<OrganizationType, string>();
    
    organizationTypes.forEach(type => {
      if (isValidOrganizationType(type)) {
        labelsMap.set(type, getOrganizationTypeLabel(type));
      }
    });
    
    return labelsMap;
  }, [organizationTypes]);
}

/**
 * Utility hook for organization type constants
 * Provides memoized access to organization type constants
 * 
 * @returns Memoized organization type constants
 */
export function useOrganizationTypeConstants() {
  return useMemo(() => ({
    types: Object.keys(ORGANIZATION_TYPE_LABELS) as OrganizationType[],
    labels: ORGANIZATION_TYPE_LABELS,
    options: getOrganizationTypeOptions(),
  }), []);
}