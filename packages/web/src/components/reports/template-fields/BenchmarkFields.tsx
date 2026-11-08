import { useCallback, useMemo, type ComponentProps } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { OrganizationBenchmarkWithDetails } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { BenchmarkSetPreview } from "@/components/benchmark-sets";
import { BenchmarkSetCombobox } from "@/components/benchmark-sets/BenchmarkSetCombobox";
import { BenchmarkChecklist, type BenchmarkChecklistProps } from "@/components/benchmarks/BenchmarkChecklist";
import { isBenchmarkSetNotFound, type useBenchmarkSets } from "@/lib/benchmark-sets-api";
import { resolveBenchmarkSelection, splitBenchmarkSelection } from "../benchmark-selection";
import type { useBenchmarkSetDetails } from "./useBenchmarkSetDetails";

// Module-level so BenchmarkChecklist's memos keep stable accessor props across renders
const getBenchmarkKey = (b: OrganizationBenchmarkWithDetails) => b.benchmarkId;
const getBenchmarkLabel = (b: OrganizationBenchmarkWithDetails) => b.name;
const getBenchmarkMeta = (b: OrganizationBenchmarkWithDetails) => ({
  metricCode: b.metricCode,
  gender: b.gender,
  level: b.level,
  tierGroupId: b.tierGroupId,
});

interface BenchmarkFieldsProps {
  organizationId: string;
  benchmarkSets: ReturnType<typeof useBenchmarkSets>["data"];
  benchmarkSetsLoading: boolean;
  setIds: string[];
  onAddSet: (setId: string) => void;
  onRemoveSet: (setId: string) => void;
  /** From useBenchmarkSetDetails(setIds); queries[i] belongs to setIds[i] */
  setQueries: ReturnType<typeof useBenchmarkSetDetails>["queries"];
  setsReady: boolean;
  /** Enabled site and custom benchmarks, merged */
  allBenchmarks: OrganizationBenchmarkWithDetails[];
  benchmarksLoading: boolean;
  benchmarksError: unknown;
  siteIds: string[];
  customIds: string[];
  /** Ids not in the enabled lists are kept as they were (see splitBenchmarkSelection) */
  onBenchmarksChange: (selection: { site: string[]; custom: string[] }) => void;
  setContext: ComponentProps<typeof BenchmarkSetCombobox>["context"];
  listContext: BenchmarkChecklistProps<OrganizationBenchmarkWithDetails>["context"];
}

/** Benchmark sets plus individual benchmark picks, shared by the report wizard and the template editor. */
export function BenchmarkFields({
  organizationId,
  benchmarkSets,
  benchmarkSetsLoading,
  setIds,
  onAddSet,
  onRemoveSet,
  setQueries,
  setsReady,
  allBenchmarks,
  benchmarksLoading,
  benchmarksError,
  siteIds,
  customIds,
  onBenchmarksChange,
  setContext,
  listContext,
}: BenchmarkFieldsProps) {
  const siteBenchmarkIds = useMemo(
    () => new Set(allBenchmarks.filter((b) => b.benchmarkType === "site").map((b) => b.benchmarkId)),
    [allBenchmarks],
  );
  const customBenchmarkIds = useMemo(
    () => new Set(allBenchmarks.filter((b) => b.benchmarkType === "custom").map((b) => b.benchmarkId)),
    [allBenchmarks],
  );
  const selectedBenchmarkIds = useMemo(() => [...siteIds, ...customIds], [siteIds, customIds]);

  const handleSelection = useCallback(
    (ids: string[]) =>
      onBenchmarksChange(
        splitBenchmarkSelection(ids, siteBenchmarkIds, customBenchmarkIds, { site: siteIds, custom: customIds }),
      ),
    [onBenchmarksChange, siteBenchmarkIds, customBenchmarkIds, siteIds, customIds],
  );

  // Overlapping sets can bring several tier groups for one metric; the team badge and PDF show only the first
  const multiTierGroup = useMemo(() => {
    if (!setsReady) return false;
    const { site, custom } = resolveBenchmarkSelection(setQueries.map((q) => q.data!), siteIds, customIds);
    const chosen = new Set([...site, ...custom]);
    const groups = new Map<string, Set<string>>();
    for (const b of allBenchmarks) {
      if (!chosen.has(b.benchmarkId) || !b.tierGroupId) continue;
      groups.set(b.metricCode, (groups.get(b.metricCode) ?? new Set()).add(b.tierGroupId));
    }
    return Array.from(groups.values()).some((g) => g.size > 1);
  }, [setsReady, setQueries, siteIds, customIds, allBenchmarks]);

  return (
    <>
      <div className="space-y-2">
        <h3 className="text-sm font-medium leading-none">Benchmark sets</h3>
        {setIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {setIds.map((setId, idx) => {
              const name = setQueries[idx]?.data?.name ?? benchmarkSets?.find((s) => s.id === setId)?.name ?? "Benchmark set";
              return (
                <Badge key={setId} variant="secondary" className="gap-1">
                  {name}
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onRemoveSet(setId)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
        {!benchmarkSetsLoading && benchmarkSets && benchmarkSets.length > 0 && (
          <BenchmarkSetCombobox
            organizationId={organizationId}
            value={null}
            onChange={(id) => id && !setIds.includes(id) && onAddSet(id)}
            context={setContext}
            placeholder="Add a benchmark set"
          />
        )}
        {setQueries.map((q, idx) => {
          const setId = setIds[idx];
          if (isBenchmarkSetNotFound(q.error)) {
            return (
              <p key={setId} role="status" className="text-sm text-muted-foreground">
                A benchmark set is no longer available. It stays until you remove it.
              </p>
            );
          }
          if (q.isError) {
            return (
              <div key={setId} role="alert" className="border border-destructive rounded-lg p-3 text-sm text-destructive">
                Failed to load a benchmark set. Remove it or retry before continuing.
                <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => q.refetch()}>
                  Retry
                </Button>
              </div>
            );
          }
          return q.data ? (
            <BenchmarkSetPreview key={setId} set={q.data} />
          ) : (
            <div key={setId} role="status" aria-label="Loading benchmark set" className="flex justify-center py-4">
              <LoadingSpinner />
            </div>
          );
        })}
        {multiTierGroup && (
          <div role="alert" className="flex items-start gap-x-2 border border-amber-500/50 rounded-lg p-3 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <span>
              The chosen sets include more than one tier group for the same metric. Tier distribution
              charts show all of them, but the team table badge and PDF label use only the first.
            </span>
          </div>
        )}
      </div>

      <h3 className="text-sm font-medium leading-none">Individual benchmarks</h3>
      {benchmarksLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {benchmarksError && (
            <div className="border border-destructive rounded-lg p-4 text-center">
              <p className="text-sm text-destructive">Failed to load benchmarks</p>
            </div>
          )}

          {allBenchmarks.length > 0 && (
            <BenchmarkChecklist
              items={allBenchmarks}
              getKey={getBenchmarkKey}
              getLabel={getBenchmarkLabel}
              getMeta={getBenchmarkMeta}
              selected={selectedBenchmarkIds}
              onChange={handleSelection}
              context={listContext}
              renderDetail={(b) => (
                <span className="text-xs text-muted-foreground">{b.benchmarkType === "site" ? "Site" : "Custom"}</span>
              )}
            />
          )}

          {!benchmarksError && allBenchmarks.length === 0 && (
            <div className="border rounded-lg p-4 text-center text-muted-foreground">
              <p>No enabled benchmarks available</p>
              <p className="text-sm mt-1">You can skip this step or enable benchmarks in Settings</p>
            </div>
          )}
        </>
      )}
    </>
  );
}
