import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToggleSiteBenchmarkStatus, useDeleteSiteBenchmark } from "@/lib/benchmarks-api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useMetricConfig } from "@/hooks/use-metric-config";
import { Edit, Trash2, Target, Layers } from "lucide-react";
import { BenchmarkDeleteDialog } from "./BenchmarkDeleteDialog";
import { TierBadgeCompact } from "./TierBadge";
import { getMetricDisplayName } from "@/constants/metrics";
import type { SiteBenchmark } from "@shared/schema";

interface BenchmarkCardProps {
  benchmark: SiteBenchmark;
  onEdit: (benchmark: SiteBenchmark) => void;
}

export function BenchmarkCard({ benchmark, onEdit }: BenchmarkCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { getMetricConfig } = useMetricConfig();

  const toggleStatusMutation = useToggleSiteBenchmarkStatus();
  const deleteMutation = useDeleteSiteBenchmark();

  const handleToggleStatus = async () => {
    try {
      await toggleStatusMutation.mutateAsync({
        id: benchmark.id,
        isActive: !benchmark.isActive,
      });
      toast({
        title: "Status Updated",
        description: `Benchmark ${benchmark.isActive ? "deactivated" : "activated"} successfully.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update status.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(benchmark.id);
      toast({
        title: "Benchmark Deleted",
        description: "Benchmark has been deleted successfully.",
      });
      setShowDeleteDialog(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete benchmark.",
        variant: "destructive",
      });
    }
  };

  // Get metric config for unit display
  const metricConfig = getMetricConfig(benchmark.metricCode);
  const unit = metricConfig?.unit || '';

  // Format comparison operator for display
  const operatorLabel = {
    lte: "≤ (Lower is better)",
    gte: "≥ (Higher is better)",
    eq: "= (Exact match)",
    range: "↔ (Target Range)",
  }[benchmark.comparisonOperator as 'lte' | 'gte' | 'eq' | 'range'] || benchmark.comparisonOperator;

  // Check if this is a range benchmark
  const isRangeBenchmark = benchmark.comparisonOperator === 'range';

  // Check if this is a tier benchmark
  const isTierBenchmark = !!benchmark.tierGroupId;

  // Format athlete filters
  const athleteFilters: string[] = [];
  if (benchmark.gender) athleteFilters.push(`Gender: ${benchmark.gender}`);
  if (benchmark.ageMin || benchmark.ageMax) {
    if (benchmark.ageMin && benchmark.ageMax) {
      athleteFilters.push(`Age: ${benchmark.ageMin}-${benchmark.ageMax}`);
    } else if (benchmark.ageMin) {
      athleteFilters.push(`Age: ${benchmark.ageMin}+`);
    } else if (benchmark.ageMax) {
      athleteFilters.push(`Age: ≤${benchmark.ageMax}`);
    }
  }
  if (benchmark.position) athleteFilters.push(`Position: ${benchmark.position}`);
  if (benchmark.level) athleteFilters.push(`Level: ${benchmark.level}`);

  return (
    <>
      <Card className={`${!benchmark.isActive ? "opacity-60" : ""}`}>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-4 w-4" />
                {benchmark.name}
              </CardTitle>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="outline">{getMetricDisplayName(benchmark.metricCode)}</Badge>
                <Badge variant={benchmark.isActive ? "default" : "secondary"}>
                  {benchmark.isActive ? "Active" : "Inactive"}
                </Badge>
                {benchmark.isSystemDefault && (
                  <Badge variant="secondary">System Default</Badge>
                )}
                {isTierBenchmark && benchmark.tierName && benchmark.tierColor && (
                  <TierBadgeCompact
                    tierName={benchmark.tierName}
                    tierColor={benchmark.tierColor}
                  />
                )}
                {isTierBenchmark && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    Tier {benchmark.tierOrder}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Description */}
          {benchmark.description && (
            <p className="text-sm text-muted-foreground">{benchmark.description}</p>
          )}

          {/* Benchmark Value & Operator */}
          <div className="bg-muted p-3 rounded-md">
            <div className="text-sm font-medium mb-1">
              {isRangeBenchmark ? "Target Range" : "Target Value"}
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-baseline gap-1">
                {isRangeBenchmark ? (
                  <>
                    <span className="text-2xl font-bold">
                      {benchmark.minValue ?? '—'} – {benchmark.maxValue ?? '—'}
                    </span>
                    {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-bold">{benchmark.benchmarkValue}</span>
                    {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
                  </>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{operatorLabel}</span>
            </div>
          </div>

          {/* Athlete Filters */}
          {athleteFilters.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Applies To:</div>
              <div className="flex flex-wrap gap-1">
                {athleteFilters.map((filter, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {filter}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between items-center pt-3 border-t">
          {/* Active Status Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id={`active-${benchmark.id}`}
              checked={benchmark.isActive}
              onCheckedChange={handleToggleStatus}
              disabled={toggleStatusMutation.isPending}
            />
            <label
              htmlFor={`active-${benchmark.id}`}
              className="text-sm font-medium cursor-pointer"
            >
              Active
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(benchmark)}
              data-testid="edit-benchmark-button"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={benchmark.isSystemDefault}
              title={benchmark.isSystemDefault ? "Cannot delete system defaults" : "Delete benchmark"}
              data-testid="delete-benchmark-button"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Dialog */}
      <BenchmarkDeleteDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        benchmarkName={benchmark.name}
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}
