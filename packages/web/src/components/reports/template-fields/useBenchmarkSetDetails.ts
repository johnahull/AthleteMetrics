import { useQueries } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/queryClient";
import { benchmarkSetKeys, fetchBenchmarkSet, isBenchmarkSetNotFound } from "@/lib/benchmark-sets-api";

/**
 * Loads every chosen benchmark set (with its items). Owns no state: `goneIds` lists sets that came back
 * 404 (deleted since they were chosen) and each caller decides what to do about them.
 * Invariant: `queries[i]` is the query for `ids[i]` (useQueries keeps input order).
 */
export function useBenchmarkSetDetails(organizationId: string, ids: string[]) {
  const queries = useQueries({
    queries: ids.map((setId) => ({
      queryKey: benchmarkSetKeys.detail(organizationId, setId),
      queryFn: () => fetchBenchmarkSet(organizationId, setId),
      staleTime: STALE_TIME.STATIC,
      enabled: !!organizationId,
    })),
  });
  const ready = queries.every((q) => q.isSuccess);
  // A 404 is "gone", not a failure
  const failed = queries.some((q) => q.isError && !isBenchmarkSetNotFound(q.error));
  const goneIds = ids.filter((_, i) => isBenchmarkSetNotFound(queries[i]?.error));
  return { queries, ready, failed, goneIds };
}
