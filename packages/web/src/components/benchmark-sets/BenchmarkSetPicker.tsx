/**
 * BenchmarkSetPicker - Dropdown for selecting benchmark sets
 * Used in Report Wizard and Analytics for quick benchmark selection
 */

import { useState, useEffect, useCallback } from "react";
import { useBenchmarkSets, useBenchmarkSet } from "@/lib/benchmark-sets-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Layers, ChevronRight, Check, Loader2 } from "lucide-react";
import type { BenchmarkSet, BenchmarkSetWithItems } from "@shared/schema";

interface BenchmarkSetPickerProps {
  organizationId: string;
  onSelect: (set: BenchmarkSetWithItems) => void;
  selectedSetId?: string;
  label?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Simple select dropdown for benchmark sets
 */
export function BenchmarkSetPicker({
  organizationId,
  onSelect,
  selectedSetId,
  label = "Benchmark Set",
  placeholder = "Select a benchmark set",
  className,
}: BenchmarkSetPickerProps) {
  const { data: sets, isLoading } = useBenchmarkSets(organizationId);

  // Fetch full set details when one is selected
  const { data: selectedSet, isLoading: isLoadingDetails } = useBenchmarkSet(
    organizationId,
    selectedSetId ?? ''
  );

  // Notify parent when full set data is loaded
  useEffect(() => {
    if (selectedSetId && selectedSet && selectedSet.id === selectedSetId && !isLoadingDetails) {
      onSelect(selectedSet);
    }
  }, [selectedSetId, selectedSet, isLoadingDetails, onSelect]);

  const handleSelect = (setId: string) => {
    // Selection is handled by updating the parent's selectedSetId prop
    // The useEffect above will call onSelect when full data loads
    // Note: The parent component must update selectedSetId when this is called
    // This is just a pass-through to trigger the data fetch
    if (onSelect && selectedSet && selectedSet.id === setId) {
      // If already loaded, call immediately
      onSelect(selectedSet);
    }
    // Otherwise, parent should track the setId and useEffect will handle it
  };

  return (
    <div className={className}>
      {label && (
        <label className="text-sm font-medium mb-2 block">{label}</label>
      )}
      <Select
        value={selectedSetId || ""}
        onValueChange={handleSelect}
        disabled={isLoading}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder}>
            {selectedSetId && sets?.find((s) => s.id === selectedSetId)?.name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {isLoading ? (
            <div className="p-2 text-center text-sm text-muted-foreground">
              Loading sets...
            </div>
          ) : sets?.length === 0 ? (
            <div className="p-2 text-center text-sm text-muted-foreground">
              No benchmark sets available
            </div>
          ) : (
            sets?.map((set) => (
              <SelectItem key={set.id} value={set.id}>
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span>{set.name}</span>
                  {set.sport && (
                    <Badge variant="outline" className="text-xs">
                      {set.sport}
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

interface BenchmarkSetQuickLoadProps {
  organizationId: string;
  onLoadSet: (benchmarkIds: { id: string; type: 'site' | 'custom' }[]) => void;
  className?: string;
}

/**
 * Button with popover for quick loading benchmark sets
 * Used in analytics benchmark line selector
 */
export function BenchmarkSetQuickLoad({
  organizationId,
  onLoadSet,
  className,
}: BenchmarkSetQuickLoadProps) {
  const [open, setOpen] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [isLoadingSet, setIsLoadingSet] = useState(false);

  const { data: sets, isLoading: isLoadingSets } = useBenchmarkSets(organizationId);
  const { data: selectedSet } = useBenchmarkSet(
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
      setOpen(false);
      setSelectedSetId(null);
      setIsLoadingSet(false);
    }
  }, [selectedSetId, selectedSet, isLoadingSet, onLoadSet]);

  const handleSelectSet = useCallback((setId: string) => {
    setSelectedSetId(setId);
    setIsLoadingSet(true);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Layers className="mr-2 h-4 w-4" />
          Load from Set
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Quick Load Benchmarks</h4>
          <p className="text-xs text-muted-foreground">
            Select a benchmark set to load all its benchmarks
          </p>
          <div className="max-h-64 overflow-y-auto space-y-1 mt-2">
            {isLoadingSets ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading sets...</span>
              </div>
            ) : sets?.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No benchmark sets available
              </div>
            ) : (
              sets?.map((set) => (
                <button
                  key={set.id}
                  onClick={() => handleSelectSet(set.id)}
                  disabled={isLoadingSet}
                  className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted text-left text-sm disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{set.name}</div>
                      {(set.sport || set.level) && (
                        <div className="text-xs text-muted-foreground">
                          {[set.sport, set.level].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedSetId === set.id && isLoadingSet ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
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
  BenchmarkSetPicker,
  BenchmarkSetQuickLoad,
  BenchmarkSetPreview,
};
