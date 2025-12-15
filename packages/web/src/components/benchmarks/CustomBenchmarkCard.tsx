import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDeleteCustomBenchmark } from "@/lib/benchmarks-api";
import { useToast } from "@/hooks/use-toast";
import { useMetricConfig } from "@/hooks/use-metric-config";
import { Edit, Trash2, Target, Layers } from "lucide-react";
import { CustomBenchmarkDeleteDialog } from "./CustomBenchmarkDeleteDialog";
import { TierBadgeCompact } from "./TierBadge";
import type { CustomBenchmark } from "@shared/schema";

interface CustomBenchmarkCardProps {
  benchmark: CustomBenchmark;
  organizationId: string;
  onEdit: (benchmark: CustomBenchmark) => void;
}

export function CustomBenchmarkCard({
  benchmark,
  organizationId,
  onEdit,
}: CustomBenchmarkCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();
  const { getMetricConfig } = useMetricConfig();

  const deleteMutation = useDeleteCustomBenchmark();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({
        organizationId,
        benchmarkId: benchmark.id,
      });
      toast({
        title: "Custom Benchmark Deleted",
        description: "Custom benchmark has been deleted successfully.",
      });
      setShowDeleteDialog(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete custom benchmark.",
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
                <Badge variant="outline">{benchmark.metricCode}</Badge>
                <Badge variant="secondary">Custom</Badge>
                <Badge variant={benchmark.isActive ? "default" : "secondary"}>
                  {benchmark.isActive ? "Active" : "Inactive"}
                </Badge>
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

        <CardFooter className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => onEdit(benchmark)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Dialog */}
      <CustomBenchmarkDeleteDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        benchmarkName={benchmark.name}
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}
