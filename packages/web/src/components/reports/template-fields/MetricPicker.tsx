import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { groupPickerMetrics } from "@/lib/metric-groups";
import type { useOrganizationMetrics } from "@/lib/metrics-api";
import { MetricGroupHeading } from "../MetricGroupHeading";

type OrgMetrics = NonNullable<ReturnType<typeof useOrganizationMetrics>["data"]>;

interface MetricPickerProps {
  metrics: OrgMetrics | undefined;
  isLoading: boolean;
  error: unknown;
  selected: string[];
  onToggle: (metricCode: string) => void;
  /** Prefix for checkbox ids when several pickers can share a page */
  idPrefix?: string;
}

/** Grouped metric checkboxes shared by the report wizard and the template editor. */
export function MetricPicker({ metrics, isLoading, error, selected, onToggle, idPrefix = "" }: MetricPickerProps) {
  const groupedMetrics = useMemo(() => groupPickerMetrics(metrics ?? []), [metrics]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-destructive rounded-lg p-4 text-center">
        <p className="text-destructive">Failed to load metrics</p>
        <p className="text-sm text-muted-foreground mt-1">
          {error instanceof Error ? error.message : "Please try again"}
        </p>
      </div>
    );
  }
  if (!metrics || metrics.length === 0) {
    return (
      <div className="border rounded-lg p-4 text-center text-muted-foreground">
        <p>No metrics enabled for this organization</p>
        <p className="text-sm mt-1">Please enable metrics in Settings first</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 border rounded-lg p-4 max-h-96 overflow-y-auto">
      {groupedMetrics.map((g) => (
        <div key={g.group} className="space-y-2">
          <MetricGroupHeading label={g.label} />
          {g.metrics.map((metric) => {
            const metricCode = metric.metricCode;
            const displayName = metric.customLabel || metric.siteMetric.label;
            const id = `${idPrefix}${metricCode}`;
            return (
              <div key={metricCode} className="flex items-center gap-x-2">
                <Checkbox id={id} checked={selected?.includes(metricCode)} onCheckedChange={() => onToggle(metricCode)} />
                <Label htmlFor={id} className="cursor-pointer flex-1">
                  <div className="font-medium">{displayName}</div>
                  <div className="text-sm text-muted-foreground">{metric.siteMetric.unit}</div>
                </Label>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
