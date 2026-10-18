/**
 * Quick load and preview for benchmark sets
 * Used in Analytics and Report Wizard for quick benchmark selection
 */

import { useState, useEffect, useCallback } from "react";
import { useBenchmarkSet } from "@/lib/benchmark-sets-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { BenchmarkSetWithItems } from "@shared/schema";
import type { FilterContext } from "@/components/benchmarks/benchmark-filtering";
import { BenchmarkSetCombobox } from "./BenchmarkSetCombobox";

interface BenchmarkSetQuickLoadProps {
  organizationId: string;
  onLoadSet: (benchmarkIds: { id: string; type: 'site' | 'custom' }[]) => void;
  className?: string;
  /** Starting filter chips (sport / gender) for the set list */
  context?: FilterContext;
}

/**
 * Searchable set picker for quick loading benchmark sets
 * Used in analytics benchmark line selector
 */
export function BenchmarkSetQuickLoad({
  organizationId,
  onLoadSet,
  className,
  context,
}: BenchmarkSetQuickLoadProps) {
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [isLoadingSet, setIsLoadingSet] = useState(false);
  const { toast } = useToast();

  const { data: selectedSet, error: setDetailsError } = useBenchmarkSet(
    organizationId,
    selectedSetId ?? ''
  );

  // Handle set data loading via useEffect (not during render)
  useEffect(() => {
    if (selectedSetId && selectedSet && selectedSet.id === selectedSetId && isLoadingSet && selectedSet.items) {
      const benchmarkIds = selectedSet.items.map((item) => ({
        id: item.benchmarkId,
        type: item.benchmarkType as 'site' | 'custom',
      }));
      onLoadSet(benchmarkIds);
      setSelectedSetId(null);
      setIsLoadingSet(false);
    }
  }, [selectedSetId, selectedSet, isLoadingSet, onLoadSet]);

  // Handle errors when loading set details
  useEffect(() => {
    if (selectedSetId && setDetailsError && isLoadingSet) {
      toast({
        title: "Failed to load benchmark set",
        description: setDetailsError instanceof Error ? setDetailsError.message : "Please try again",
        variant: "destructive",
      });
      setSelectedSetId(null);
      setIsLoadingSet(false);
    }
  }, [selectedSetId, setDetailsError, isLoadingSet, toast]);

  const handleSelectSet = useCallback((setId: string) => {
    setSelectedSetId(setId);
    setIsLoadingSet(true);
  }, []);

  return (
    <BenchmarkSetCombobox
      organizationId={organizationId}
      value={null}
      onChange={(id) => id && handleSelectSet(id)}
      context={context}
      placeholder="Load from Set"
      disabled={isLoadingSet}
      className={cn("w-auto", className)}
    />
  );
}

interface BenchmarkSetPreviewProps {
  set: BenchmarkSetWithItems;
}

/**
 * Preview card showing benchmarks in a set
 * Used in Report Wizard to show what will be included
 */
export function BenchmarkSetPreview({ set }: BenchmarkSetPreviewProps) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Benchmarks from set: {set.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {set.items?.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This set has no benchmarks yet.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-2">
              {set.items.length} benchmark{set.items.length !== 1 ? 's' : ''} will be included:
            </p>
            <div className="flex flex-wrap gap-2">
              {set.items.map((item) => (
                <Badge key={item.id} variant="secondary" className="text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  {item.customLabel || item.benchmark?.name || item.benchmarkId}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Export all components
export default {
  BenchmarkSetQuickLoad,
  BenchmarkSetPreview,
};
