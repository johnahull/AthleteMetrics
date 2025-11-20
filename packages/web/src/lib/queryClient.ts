import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Standard staleTime values for different data types
 *
 * Usage: Import STALE_TIME and use appropriate constant based on data freshness requirements
 *
 * @example
 * ```ts
 * import { STALE_TIME } from './queryClient';
 *
 * // For frequently changing data (athlete measurements, status)
 * useQuery({ queryKey: ['measurements'], staleTime: STALE_TIME.REALTIME });
 *
 * // For analytics and reports (default)
 * useQuery({ queryKey: ['analytics'], staleTime: STALE_TIME.DEFAULT });
 *
 * // For static reference data (metrics, benchmarks)
 * useQuery({ queryKey: ['metrics'], staleTime: STALE_TIME.STATIC });
 *
 * // For user preferences (rarely changes)
 * useQuery({ queryKey: ['preferences'], staleTime: STALE_TIME.INFINITE });
 * ```
 */
export const STALE_TIME = {
  /** 1 minute - For real-time data: athlete measurements, live status, recent activity */
  REALTIME: 1 * 60 * 1000,

  /** 5 minutes - Default for most data: analytics, reports, team data */
  DEFAULT: 5 * 60 * 1000,

  /** 15 minutes - For static/reference data: metric definitions, benchmarks, organization settings */
  STATIC: 15 * 60 * 1000,

  /** Never expires - For immutable data: user preferences, feature flags (until explicit invalidation) */
  INFINITE: Infinity,
} as const;

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  // Add CSRF token for state-changing operations
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include',
      });
      
      if (csrfResponse.ok) {
        const { csrfToken } = await csrfResponse.json();
        headers['X-CSRF-Token'] = csrfToken;
      }
    } catch (error) {
      console.warn('Failed to fetch CSRF token:', error);
      // Continue without CSRF token - let the server handle the error
    }
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: STALE_TIME.DEFAULT, // 5 minutes - balance between data freshness and API load
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
