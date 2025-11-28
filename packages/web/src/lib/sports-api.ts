/**
 * Sports API client and React Query hooks
 * Provides type-safe API calls and data fetching hooks for sports management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  SiteSport,
  SitePosition,
  InsertSiteSport,
  UpdateSiteSport,
  InsertSitePosition,
  UpdateSitePosition,
  SiteSportWithPositions,
  SiteSportUsage,
  SitePositionUsage,
} from "@shared/schema";
import { STALE_TIME } from "@/lib/queryClient";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract error message from API response, with fallback
 */
async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const error = await response.json();
    return error.message || fallback;
  } catch {
    // Response might not be JSON (e.g., network errors, CORS errors)
    return fallback;
  }
}

// ============================================================================
// API Client Functions - Sports
// ============================================================================

/**
 * Fetch all active sports
 */
export async function fetchSports(): Promise<SiteSport[]> {
  const response = await fetch('/api/sports');
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch sports');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch all sports including inactive (site admin only)
 */
export async function fetchAllSports(): Promise<SiteSport[]> {
  const response = await fetch('/api/site-sports');
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch all sports');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch sport details with positions
 */
export async function fetchSport(code: string): Promise<SiteSportWithPositions> {
  const response = await fetch(`/api/sports/${code}`);
  if (!response.ok) {
    const defaultMsg = response.status === 404 ? `Sport not found: ${code}` : 'Failed to fetch sport';
    const message = await getErrorMessage(response, defaultMsg);
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch sport usage statistics (site admin only)
 */
export async function fetchSportUsage(code: string): Promise<SiteSportUsage> {
  const response = await fetch(`/api/sports/${code}/usage`);
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch sport usage');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Create a new sport (site admin only)
 */
export async function createSport(data: InsertSiteSport): Promise<SiteSport> {
  const response = await fetch('/api/sports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to create sport');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Update sport (site admin only)
 */
export async function updateSport(code: string, data: Partial<UpdateSiteSport>): Promise<SiteSport> {
  const response = await fetch(`/api/sports/${code}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to update sport');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Delete sport (site admin only)
 */
export async function deleteSport(code: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/sports/${code}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to delete sport');
    throw new Error(message);
  }

  return response.json();
}

// ============================================================================
// API Client Functions - Positions
// ============================================================================

/**
 * Fetch positions for a sport
 */
export async function fetchPositions(sportCode: string): Promise<SitePosition[]> {
  const response = await fetch(`/api/sports/${sportCode}/positions`);
  if (!response.ok) {
    const defaultMsg = response.status === 404 ? `Sport not found: ${sportCode}` : 'Failed to fetch positions';
    const message = await getErrorMessage(response, defaultMsg);
    throw new Error(message);
  }
  return response.json();
}

/**
 * Fetch position usage (site admin only)
 */
export async function fetchPositionUsage(id: string): Promise<SitePositionUsage> {
  const response = await fetch(`/api/positions/${id}/usage`);
  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to fetch position usage');
    throw new Error(message);
  }
  return response.json();
}

/**
 * Create position for a sport (site admin only)
 */
export async function createPosition(sportCode: string, data: Omit<InsertSitePosition, 'sportId'>): Promise<SitePosition> {
  const response = await fetch(`/api/sports/${sportCode}/positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to create position');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Update position (site admin only)
 */
export async function updatePosition(id: string, data: Partial<UpdateSitePosition>): Promise<SitePosition> {
  const response = await fetch(`/api/positions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to update position');
    throw new Error(message);
  }

  return response.json();
}

/**
 * Delete position (site admin only)
 */
export async function deletePosition(id: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/positions/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Failed to delete position');
    throw new Error(message);
  }

  return response.json();
}

// ============================================================================
// React Query Hooks - Sports
// ============================================================================

/**
 * Hook to fetch active sports (for dropdowns, etc.)
 */
export function useSports() {
  return useQuery({
    queryKey: ['sports'],
    queryFn: fetchSports,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch all sports including inactive (site admin only)
 */
export function useAllSports() {
  return useQuery({
    queryKey: ['sports', 'all'],
    queryFn: fetchAllSports,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch sport details with positions
 */
export function useSport(code: string) {
  return useQuery({
    queryKey: ['sports', code],
    queryFn: () => fetchSport(code),
    enabled: !!code,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch sport usage (site admin only)
 */
export function useSportUsage(code: string) {
  return useQuery({
    queryKey: ['sports', code, 'usage'],
    queryFn: () => fetchSportUsage(code),
    enabled: !!code,
    staleTime: STALE_TIME.REALTIME,
  });
}

/**
 * Hook to create sport (site admin only)
 */
export function useCreateSport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sports'] });
    },
  });
}

/**
 * Hook to update sport (site admin only)
 */
export function useUpdateSport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, data }: { code: string; data: Partial<UpdateSiteSport> }) =>
      updateSport(code, data),
    onSuccess: (_, { code }) => {
      queryClient.invalidateQueries({ queryKey: ['sports'] });
      queryClient.invalidateQueries({ queryKey: ['sports', code] });
    },
  });
}

/**
 * Hook to delete sport (site admin only)
 */
export function useDeleteSport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sports'] });
    },
  });
}

// ============================================================================
// React Query Hooks - Positions
// ============================================================================

/**
 * Hook to fetch positions for a sport
 */
export function usePositions(sportCode: string) {
  return useQuery({
    queryKey: ['sports', sportCode, 'positions'],
    queryFn: () => fetchPositions(sportCode),
    enabled: !!sportCode,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch positions for multiple sports
 */
export function usePositionsForSports(sportCodes: string[]) {
  return useQuery({
    queryKey: ['positions', 'multi', sportCodes],
    queryFn: async () => {
      const positionsByCode: Record<string, SitePosition[]> = {};
      await Promise.all(
        sportCodes.map(async (code) => {
          try {
            positionsByCode[code] = await fetchPositions(code);
          } catch {
            positionsByCode[code] = [];
          }
        })
      );
      return positionsByCode;
    },
    enabled: sportCodes.length > 0,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch position usage (site admin only)
 */
export function usePositionUsage(id: string) {
  return useQuery({
    queryKey: ['positions', id, 'usage'],
    queryFn: () => fetchPositionUsage(id),
    enabled: !!id,
    staleTime: STALE_TIME.REALTIME,
  });
}

/**
 * Hook to create position (site admin only)
 */
export function useCreatePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sportCode, data }: { sportCode: string; data: Omit<InsertSitePosition, 'sportId'> }) =>
      createPosition(sportCode, data),
    onSuccess: (_, { sportCode }) => {
      queryClient.invalidateQueries({ queryKey: ['sports'] });
      queryClient.invalidateQueries({ queryKey: ['sports', sportCode] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });
}

/**
 * Hook to update position (site admin only)
 */
export function useUpdatePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UpdateSitePosition> }) =>
      updatePosition(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sports'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });
}

/**
 * Hook to delete position (site admin only)
 */
export function useDeletePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sports'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });
}
