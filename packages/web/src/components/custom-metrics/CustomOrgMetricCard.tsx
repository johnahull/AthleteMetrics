import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useArchiveCustomOrgMetric, useRestoreCustomOrgMetric } from "@/lib/custom-metrics-api";
import { useToast } from "@/hooks/use-toast";
import { Edit, Archive, RotateCcw, Ruler, Calculator, Tag } from "lucide-react";
import type { CustomOrgMetric } from "@shared/schema";
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

interface CustomOrgMetricCardProps {
  metric: CustomOrgMetric;
  organizationId: string;
  onEdit: (metric: CustomOrgMetric) => void;
  canEdit?: boolean;
}

export function CustomOrgMetricCard({
  metric,
  organizationId,
  onEdit,
  canEdit = true,
}: CustomOrgMetricCardProps) {
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const { toast } = useToast();

  const archiveMutation = useArchiveCustomOrgMetric();
  const restoreMutation = useRestoreCustomOrgMetric();

  const handleArchive = async () => {
    try {
      await archiveMutation.mutateAsync({
        organizationId,
        code: metric.code,
      });
      toast({
        title: "Metric Archived",
        description: "Custom metric has been archived successfully.",
      });
      setShowArchiveDialog(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to archive custom metric.",
        variant: "destructive",
      });
    }
  };

  const handleRestore = async () => {
    try {
      await restoreMutation.mutateAsync({
        organizationId,
        code: metric.code,
      });
      toast({
        title: "Metric Restored",
        description: "Custom metric has been restored successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to restore custom metric.",
        variant: "destructive",
      });
    }
  };

  // Format metric type for display
  const metricTypeLabel = {
    lower_is_better: "Lower is Better",
    higher_is_better: "Higher is Better",
    tracking: "Tracking Only",
  }[metric.metricType] || metric.metricType;

  // Get badge color based on metric type
  const metricTypeBadgeVariant = {
    lower_is_better: "default",
    higher_is_better: "secondary",
    tracking: "outline",
  }[metric.metricType] as "default" | "secondary" | "outline" || "outline";

  return (
    <>
      <Card className={`${!metric.isActive ? "opacity-60" : ""}`}>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <CardTitle className="text-lg flex items-center gap-2">
                {metric.isDerived ? (
                  <Calculator className="h-4 w-4 text-purple-500" />
                ) : (
                  <Ruler className="h-4 w-4" />
                )}
                {metric.label}
              </CardTitle>
              <p className="text-xs text-muted-foreground font-mono mt-1">{metric.code}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant={metricTypeBadgeVariant}>{metricTypeLabel}</Badge>
                <Badge variant="outline">Custom</Badge>
                {metric.isDerived && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Calculator className="h-3 w-3" />
                    Derived
                  </Badge>
                )}
                {!metric.isActive && (
                  <Badge variant="destructive">Archived</Badge>
                )}
                {metric.category && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {metric.category}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {/* Description */}
          {metric.description && (
            <p className="text-sm text-muted-foreground">{metric.description}</p>
          )}

          {/* Metric Details */}
          <div className="bg-muted p-3 rounded-md space-y-2">
            {/* Unit */}
            {metric.unit && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Unit:</span>
                <span className="font-medium">{metric.unit}</span>
              </div>
            )}

            {/* Validation Range */}
            {(metric.validationMin !== null || metric.validationMax !== null) && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Valid Range:</span>
                <span className="font-medium">
                  {metric.validationMin ?? '—'} – {metric.validationMax ?? '—'}
                </span>
              </div>
            )}

            {/* Decimal Precision */}
            {metric.decimalPrecision !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Precision:</span>
                <span className="font-medium">{metric.decimalPrecision} decimals</span>
              </div>
            )}

            {/* Formula (for derived metrics) */}
            {metric.isDerived && metric.formula && (
              <div className="pt-2 border-t">
                <span className="text-sm text-muted-foreground">Formula:</span>
                <code className="block mt-1 text-xs bg-background p-2 rounded">
                  {metric.formula}
                </code>
              </div>
            )}
          </div>

          {/* Sport Associations */}
          {metric.sportAssociations && metric.sportAssociations.length > 0 && (
            <div>
              <span className="text-sm font-medium">Sports:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {metric.sportAssociations.map((sport, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {sport}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>

        {canEdit && (
          <CardFooter className="flex justify-end gap-2 pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(metric)}
              aria-label={`Edit ${metric.label}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            {metric.isActive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowArchiveDialog(true)}
                aria-label={`Archive ${metric.label}`}
              >
                <Archive className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestore}
                disabled={restoreMutation.isPending}
                aria-label={`Restore ${metric.label}`}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </CardFooter>
        )}
      </Card>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Custom Metric?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the metric "{metric.label}". Existing measurements using this
              metric will be preserved, but no new measurements can be added for this metric.
              You can restore the metric later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchive}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
