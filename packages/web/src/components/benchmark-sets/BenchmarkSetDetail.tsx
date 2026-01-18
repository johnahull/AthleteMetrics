/**
 * BenchmarkSetDetail - Detail view for managing benchmark set items
 * Allows viewing, adding, removing, and reordering benchmarks in a set
 */

import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useBenchmarkSet,
  useAddBenchmarkToSet,
  useRemoveBenchmarkFromSet,
  useReorderBenchmarkSetItems,
  useDeleteBenchmarkSet,
} from "@/lib/benchmark-sets-api";
import { useOrganizationBenchmarks } from "@/lib/benchmarks-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Trash,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Target,
  Pencil,
  Layers,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BenchmarkSetForm } from "./BenchmarkSetForm";
import type { BenchmarkSet, BenchmarkSetWithItems, OrganizationBenchmarkWithDetails } from "@shared/schema";

interface BenchmarkSetDetailProps {
  organizationId: string;
  setId: string;
}

export function BenchmarkSetDetail({ organizationId, setId }: BenchmarkSetDetailProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // State for dialogs
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);

  // Fetch the benchmark set with items
  const { data: benchmarkSet, isLoading, error, refetch } = useBenchmarkSet(organizationId, setId);

  // Fetch organization's enabled benchmarks for the add dialog
  const { data: enabledBenchmarks } = useOrganizationBenchmarks(organizationId, false);

  // Mutations
  const addMutation = useAddBenchmarkToSet(organizationId, setId);
  const removeMutation = useRemoveBenchmarkFromSet(organizationId, setId);
  const reorderMutation = useReorderBenchmarkSetItems(organizationId, setId);
  const deleteMutation = useDeleteBenchmarkSet(organizationId);

  // Filter out benchmarks already in the set
  const availableBenchmarks = useMemo(() => {
    if (!enabledBenchmarks || !benchmarkSet?.items) return [];
    const existingIds = new Set(benchmarkSet.items.map((item) => item.benchmarkId));
    return enabledBenchmarks.filter((b) => !existingIds.has(b.benchmarkId));
  }, [enabledBenchmarks, benchmarkSet]);

  // Handle adding a benchmark to the set
  const handleAddBenchmark = async (benchmark: OrganizationBenchmarkWithDetails) => {
    try {
      await addMutation.mutateAsync({
        benchmarkId: benchmark.benchmarkId,
        benchmarkType: benchmark.benchmarkType as 'site' | 'custom',
      });
      toast({
        title: "Benchmark Added",
        description: `Added "${benchmark.customName || benchmark.name}" to the set.`,
      });
      setShowAddDialog(false);
      refetch();
    } catch (err) {
      toast({
        title: "Failed to Add Benchmark",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  // Handle removing a benchmark from the set
  const handleRemoveBenchmark = async () => {
    if (!itemToRemove) return;
    try {
      await removeMutation.mutateAsync(itemToRemove);
      toast({
        title: "Benchmark Removed",
        description: "The benchmark has been removed from this set.",
      });
      setItemToRemove(null);
      refetch();
    } catch (err) {
      toast({
        title: "Failed to Remove Benchmark",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  // Handle reordering items
  const handleMoveItem = async (itemId: string, direction: "up" | "down") => {
    if (!benchmarkSet?.items) return;

    const items = [...benchmarkSet.items].sort((a, b) => a.displayOrder - b.displayOrder);
    const currentIndex = items.findIndex((item) => item.id === itemId);

    if (direction === "up" && currentIndex <= 0) return;
    if (direction === "down" && currentIndex >= items.length - 1) return;

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    // Swap the items
    [items[currentIndex], items[newIndex]] = [items[newIndex], items[currentIndex]];

    // Update display orders
    const reorderedItems = items.map((item, index) => ({
      id: item.id,
      displayOrder: index,
    }));

    try {
      await reorderMutation.mutateAsync({ items: reorderedItems });
      toast({
        title: "Order Updated",
        description: "Benchmark order has been updated.",
      });
      refetch();
    } catch (err) {
      toast({
        title: "Failed to Reorder",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  // Handle deleting the entire set
  const handleDeleteSet = async () => {
    try {
      await deleteMutation.mutateAsync(setId);
      toast({
        title: "Benchmark Set Deleted",
        description: "The benchmark set has been deleted.",
      });
      setLocation(`/organizations/${organizationId}/benchmark-sets`);
    } catch (err) {
      toast({
        title: "Failed to Delete Set",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  // Handle going back to the list
  const handleBack = () => {
    setLocation(`/organizations/${organizationId}/benchmark-sets`);
  };

  if (isLoading) {
    return <LoadingSpinner text="Loading benchmark set..." />;
  }

  if (error || !benchmarkSet) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Benchmark Set</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : "Benchmark set not found."}
            </p>
            <Button variant="outline" onClick={handleBack} className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Benchmark Sets
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sortedItems = [...(benchmarkSet.items || [])].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" onClick={handleBack} className="mb-2 -ml-3">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Benchmark Sets
          </Button>
          <div className="flex items-center gap-3">
            <Layers className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{benchmarkSet.name}</h1>
              {benchmarkSet.description && (
                <p className="text-muted-foreground mt-1">{benchmarkSet.description}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            {!benchmarkSet.isActive && <Badge variant="secondary">Inactive</Badge>}
            {benchmarkSet.sport && <Badge variant="outline">{benchmarkSet.sport}</Badge>}
            {benchmarkSet.level && <Badge variant="outline">{benchmarkSet.level}</Badge>}
            {benchmarkSet.gender && <Badge variant="outline">{benchmarkSet.gender}</Badge>}
            {benchmarkSet.isTemplate && <Badge variant="secondary">Template</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowEditForm(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit Set
          </Button>
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash className="mr-2 h-4 w-4" />
            Delete Set
          </Button>
        </div>
      </div>

      {/* Benchmarks in Set */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Benchmarks in Set
              </CardTitle>
              <CardDescription>
                {sortedItems.length === 0
                  ? "No benchmarks added yet. Add benchmarks to use this set in reports and analytics."
                  : `${sortedItems.length} benchmark${sortedItems.length !== 1 ? "s" : ""} in this set`}
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddDialog(true)} disabled={availableBenchmarks.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Add Benchmark
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sortedItems.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <Target className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Benchmarks Yet</h3>
              <p className="text-muted-foreground mb-4">
                Add benchmarks from your organization's enabled benchmarks.
              </p>
              <Button onClick={() => setShowAddDialog(true)} disabled={availableBenchmarks.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Benchmark
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedItems.map((item, index) => (
                <div
                  key={item.id}
                  data-benchmark-item
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMoveItem(item.id, "up")}
                      disabled={index === 0 || reorderMutation.isPending}
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMoveItem(item.id, "down")}
                      disabled={index === sortedItems.length - 1 || reorderMutation.isPending}
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">
                      {item.customLabel || item.benchmark?.name || "Unknown Benchmark"}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {item.benchmarkType === "site" ? "Site" : "Custom"}
                      </Badge>
                      {item.benchmark?.metricCode && (
                        <span>{item.benchmark.metricCode}</span>
                      )}
                      {item.benchmark?.benchmarkValue && (
                        <span>
                          {item.benchmark.comparisonOperator === "lte" ? "≤" :
                           item.benchmark.comparisonOperator === "gte" ? "≥" : "="}
                          {" "}{item.benchmark.benchmarkValue}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setItemToRemove(item.id)}
                    aria-label="Remove benchmark"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Benchmark Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Benchmark to Set</DialogTitle>
            <DialogDescription>
              Select a benchmark from your organization's enabled benchmarks.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {availableBenchmarks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                All enabled benchmarks are already in this set.
              </p>
            ) : (
              <div className="space-y-2">
                {availableBenchmarks.map((benchmark) => (
                  <button
                    key={benchmark.benchmarkId}
                    data-benchmark-id={benchmark.benchmarkId}
                    onClick={() => handleAddBenchmark(benchmark)}
                    disabled={addMutation.isPending}
                    className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-muted text-left disabled:opacity-50"
                  >
                    <div>
                      <div className="font-medium">
                        {benchmark.customName || benchmark.name || "Unknown"}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {benchmark.benchmarkType === "site" ? "Site" : "Custom"}
                        </Badge>
                        {benchmark.metricCode && (
                          <span>{benchmark.metricCode}</span>
                        )}
                      </div>
                    </div>
                    <Plus className="h-5 w-5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Benchmark Confirmation */}
      <AlertDialog open={!!itemToRemove} onOpenChange={(open) => !open && setItemToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Benchmark?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this benchmark from the set? You can add it back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveBenchmark}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Set Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Benchmark Set?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{benchmarkSet.name}"? This action cannot be undone
              and will remove all benchmarks from this set.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSet}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Form Dialog */}
      <BenchmarkSetForm
        open={showEditForm}
        onClose={() => {
          setShowEditForm(false);
          refetch();
        }}
        organizationId={organizationId}
        benchmarkSet={benchmarkSet}
      />
    </div>
  );
}
