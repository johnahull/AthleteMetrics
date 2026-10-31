import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { Calculator } from "lucide-react";
import type { SiteMetric, CustomOrgMetric } from "@shared/schema";

interface MetricDetailDialogProps {
  metric: SiteMetric | CustomOrgMetric | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const METRIC_TYPE_LABELS: Record<string, string> = {
  lower_is_better: "Lower is Better",
  higher_is_better: "Higher is Better",
  tracking: "Tracking Only",
};

/** Read-only view of a metric definition, available to every role that can see the metric list. */
export function MetricDetailDialog({ metric, open, onOpenChange }: MetricDetailDialogProps) {
  if (!metric) return null;

  const inputs = metric.dependentMetrics ?? [];
  const hasRange = metric.validationMin != null || metric.validationMax != null;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent title={metric.label} description={metric.code}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{METRIC_TYPE_LABELS[metric.metricType] ?? metric.metricType}</Badge>
            {metric.category && <Badge variant="outline">{metric.category}</Badge>}
            {metric.isDerived && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Calculator className="h-3 w-3" />
                Calculated
              </Badge>
            )}
          </div>

          {metric.description && <p className="text-sm text-muted-foreground">{metric.description}</p>}

          <div className="bg-muted p-3 rounded-md space-y-2 text-sm">
            {metric.unit && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit:</span>
                <span className="font-medium">{metric.unit}</span>
              </div>
            )}
            {hasRange && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valid Range:</span>
                <span className="font-medium">
                  {metric.validationMin ?? "—"} – {metric.validationMax ?? "—"}
                </span>
              </div>
            )}
            {metric.decimalPrecision != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Precision:</span>
                <span className="font-medium">{metric.decimalPrecision} {metric.decimalPrecision === 1 ? "decimal" : "decimals"}</span>
              </div>
            )}
            {metric.isDerived && metric.formula && (
              <div className="pt-2 border-t">
                <span className="text-muted-foreground">Formula:</span>
                <code className="block mt-1 text-xs bg-background p-2 rounded">{metric.formula}</code>
              </div>
            )}
            {metric.isDerived && inputs.length > 0 && (
              <div>
                <span className="text-muted-foreground">Calculated from:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {inputs.map((code) => (
                    <Badge key={code} variant="outline" className="font-mono text-xs">
                      {code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {metric.sportAssociations && metric.sportAssociations.length > 0 && (
            <div>
              <span className="text-sm font-medium">Sports:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {metric.sportAssociations.map((sport) => (
                  <Badge key={sport} variant="secondary" className="text-xs">
                    {sport}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
