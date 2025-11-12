/**
 * Editor component for creating and editing benchmark groups
 * Allows selecting multiple benchmarks to include in a group
 */

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateSiteBenchmarkGroup,
  useUpdateSiteBenchmarkGroup,
  useAddBenchmarkToSiteGroup,
  useRemoveBenchmarkFromSiteGroup,
  useSiteBenchmarkGroup,
} from "@/lib/benchmark-groups-api";
import { useSiteBenchmarks } from "@/lib/benchmarks-api";
import type { SiteBenchmarkGroup, SiteBenchmarkGroupWithMembers } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  name: z.string().min(1, "Group name is required").max(100),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

type FormData = z.infer<typeof formSchema>;

interface BenchmarkGroupEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: SiteBenchmarkGroup | SiteBenchmarkGroupWithMembers | null;
  onSuccess?: () => void;
}

export function BenchmarkGroupEditor({
  open,
  onOpenChange,
  group,
  onSuccess,
}: BenchmarkGroupEditorProps) {
  const [selectedBenchmarkIds, setSelectedBenchmarkIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Fetch full group data with members if editing
  const { data: fullGroup } = useSiteBenchmarkGroup(group?.id || "", true);

  // Fetch all available benchmarks
  const { data: availableBenchmarks, isLoading: benchmarksLoading } = useSiteBenchmarks(false);

  // Mutations
  const createMutation = useCreateSiteBenchmarkGroup();
  const updateMutation = useUpdateSiteBenchmarkGroup();
  const addBenchmarkMutation = useAddBenchmarkToSiteGroup();
  const removeBenchmarkMutation = useRemoveBenchmarkFromSiteGroup();

  // Form setup
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      isActive: true,
    },
  });

  const isActive = watch("isActive");

  // Initialize form when group changes
  useEffect(() => {
    if (group) {
      reset({
        name: group.name,
        description: group.description || "",
        isActive: group.isActive,
      });
    } else {
      reset({
        name: "",
        description: "",
        isActive: true,
      });
    }
  }, [group, reset]);

  // Initialize selected benchmarks when full group data loads
  useEffect(() => {
    if (fullGroup && 'benchmarks' in fullGroup) {
      const ids = new Set(fullGroup.benchmarks.map(b => b.id));
      setSelectedBenchmarkIds(ids);
    } else {
      setSelectedBenchmarkIds(new Set());
    }
  }, [fullGroup]);

  const handleBenchmarkToggle = (benchmarkId: string) => {
    setSelectedBenchmarkIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(benchmarkId)) {
        newSet.delete(benchmarkId);
      } else {
        newSet.add(benchmarkId);
      }
      return newSet;
    });
  };

  const onSubmit = async (data: FormData) => {
    try {
      if (group) {
        // Update existing group
        await updateMutation.mutateAsync({
          id: group.id,
          data,
        });

        // Update benchmark memberships
        const currentMemberIds = fullGroup && 'benchmarks' in fullGroup
          ? new Set(fullGroup.benchmarks.map(b => b.id))
          : new Set<string>();

        // Add new benchmarks
        const toAdd = Array.from(selectedBenchmarkIds).filter(id => !currentMemberIds.has(id));
        for (const benchmarkId of toAdd) {
          await addBenchmarkMutation.mutateAsync({ groupId: group.id, benchmarkId });
        }

        // Remove deleted benchmarks
        const toRemove = Array.from(currentMemberIds).filter(id => !selectedBenchmarkIds.has(id));
        for (const benchmarkId of toRemove) {
          await removeBenchmarkMutation.mutateAsync({ groupId: group.id, benchmarkId });
        }

        toast({
          title: "Success",
          description: "Benchmark group updated successfully",
        });
      } else {
        // Create new group
        const newGroup = await createMutation.mutateAsync(data);

        // Add selected benchmarks to the new group
        for (const benchmarkId of selectedBenchmarkIds) {
          await addBenchmarkMutation.mutateAsync({ groupId: newGroup.id, benchmarkId });
        }

        toast({
          title: "Success",
          description: "Benchmark group created successfully",
        });
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save benchmark group",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{group ? "Edit Benchmark Group" : "Create Benchmark Group"}</DialogTitle>
          <DialogDescription>
            {group
              ? "Update the group details and select which benchmarks to include"
              : "Create a new group and select benchmarks to include"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <div className="space-y-4 flex-1 overflow-y-auto px-1">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Group Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., NCAA D1 Women's Soccer"
                {...register("name")}
                data-testid="group-name-input"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the purpose of this benchmark group..."
                rows={3}
                {...register("description")}
                data-testid="group-description-input"
              />
            </div>

            {/* Active Status */}
            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={(checked) => setValue("isActive", checked)}
                data-testid="group-active-toggle"
              />
              <Label htmlFor="isActive">Active</Label>
            </div>

            {/* Benchmark Selection */}
            <div className="space-y-2">
              <Label>
                Select Benchmarks <span className="text-muted-foreground text-sm">(optional)</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                Choose which benchmarks to include in this group
              </p>

              {benchmarksLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : (
                <ScrollArea className="h-64 border rounded-md">
                  <div className="p-4 space-y-3">
                    {availableBenchmarks && availableBenchmarks.length > 0 ? (
                      availableBenchmarks.map((benchmark) => (
                        <div
                          key={benchmark.id}
                          className="flex items-start space-x-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <Checkbox
                            id={`benchmark-${benchmark.id}`}
                            checked={selectedBenchmarkIds.has(benchmark.id)}
                            onCheckedChange={() => handleBenchmarkToggle(benchmark.id)}
                            data-testid={`benchmark-checkbox-${benchmark.id}`}
                          />
                          <div className="flex-1 space-y-1">
                            <Label
                              htmlFor={`benchmark-${benchmark.id}`}
                              className="text-sm font-medium leading-none cursor-pointer"
                            >
                              {benchmark.name}
                            </Label>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="secondary" className="text-xs">
                                {benchmark.metricCode}
                              </Badge>
                              <span>
                                {benchmark.comparisonOperator === 'lte' ? '≤' : benchmark.comparisonOperator === 'gte' ? '≥' : '='}{' '}
                                {benchmark.benchmarkValue}
                              </span>
                              {benchmark.gender && <span>• {benchmark.gender}</span>}
                              {benchmark.ageMin && benchmark.ageMax && (
                                <span>• Ages {benchmark.ageMin}-{benchmark.ageMax}</span>
                              )}
                            </div>
                            {benchmark.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {benchmark.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No benchmarks available
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}

              {selectedBenchmarkIds.size > 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedBenchmarkIds.size} benchmark{selectedBenchmarkIds.size !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="save-group-button"
            >
              {isSubmitting ? "Saving..." : group ? "Update Group" : "Create Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
