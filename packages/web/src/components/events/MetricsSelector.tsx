/**
 * MetricsSelector - Select metrics for event creation form
 *
 * Unlike EventMetricsTab (which manages metrics for existing events via API),
 * MetricsSelector manages LOCAL state and passes selected metrics to the
 * form's onSubmit handler for post-creation API calls.
 *
 * Used in EventForm Step 3 to allow users to pre-select metrics
 * before an event is created.
 */

import { useState } from "react";
import { useSiteMetrics } from "@/lib/metrics-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { SiteMetric } from "@shared/schema";

// Type for selected metrics in the form context
export interface SelectedMetric {
  code: string;
  label: string;
  isRequired: boolean;
  category?: string;
  units?: string;
}

interface MetricsSelectorProps {
  selectedMetrics: SelectedMetric[];
  onMetricsChange: (metrics: SelectedMetric[]) => void;
  organizationId?: string;
}

export function MetricsSelector({
  selectedMetrics,
  onMetricsChange,
  organizationId,
}: MetricsSelectorProps) {
  const [dropdownValue, setDropdownValue] = useState<string>("");

  // Fetch available site metrics
  const { data: siteMetrics, isLoading } = useSiteMetrics(false, organizationId);

  // Filter out already-selected metrics from dropdown
  const selectedCodes = new Set(selectedMetrics.map((m) => m.code));
  const availableMetrics = (siteMetrics || []).filter(
    (m: SiteMetric) => !selectedCodes.has(m.code)
  );

  // Handle adding a metric
  const handleAdd = () => {
    if (!dropdownValue) return;

    const metricToAdd = siteMetrics?.find((m: SiteMetric) => m.code === dropdownValue);
    if (!metricToAdd) return;

    const newMetric: SelectedMetric = {
      code: metricToAdd.code,
      label: metricToAdd.label,
      isRequired: false,
      category: metricToAdd.category || undefined,
      units: metricToAdd.unit || undefined,
    };

    onMetricsChange([...selectedMetrics, newMetric]);
    setDropdownValue("");
  };

  // Handle removing a metric
  const handleRemove = (codeToRemove: string) => {
    onMetricsChange(selectedMetrics.filter((m) => m.code !== codeToRemove));
  };

  // Handle toggling required status
  const handleToggleRequired = (code: string) => {
    onMetricsChange(
      selectedMetrics.map((m) =>
        m.code === code ? { ...m, isRequired: !m.isRequired } : m
      )
    );
  };

  // Handle moving a metric up or down
  const handleMove = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === selectedMetrics.length - 1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    const newMetrics = [...selectedMetrics];
    [newMetrics[index], newMetrics[newIndex]] = [newMetrics[newIndex], newMetrics[index]];
    onMetricsChange(newMetrics);
  };

  return (
    <div className="space-y-4">
      {/* Add Metric Section */}
      <div className="flex gap-3">
        <Select
          value={dropdownValue}
          onValueChange={setDropdownValue}
          disabled={isLoading}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a metric to add..." />
          </SelectTrigger>
          <SelectContent>
            {availableMetrics.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">
                All available metrics have been added
              </div>
            ) : (
              availableMetrics.map((metric: SiteMetric) => (
                <SelectItem key={metric.code} value={metric.code}>
                  <div className="flex items-center gap-2">
                    <span>{metric.label}</span>
                    {metric.category && (
                      <Badge variant="outline" className="text-xs">
                        {metric.category}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          onClick={handleAdd}
          disabled={!dropdownValue || isLoading}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add
        </Button>
      </div>

      {/* Selected Metrics Header */}
      {selectedMetrics.length > 0 && (
        <div className="text-sm font-medium text-muted-foreground">
          Selected Metrics ({selectedMetrics.length})
        </div>
      )}

      {/* Selected Metrics List */}
      <div className="space-y-2">
        {selectedMetrics.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/30">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No metrics selected</p>
            <p className="text-sm mt-1">
              Add metrics to define which tests will be conducted at this event.
            </p>
          </div>
        ) : (
          selectedMetrics.map((metric, index) => (
            <div
              key={metric.code}
              data-metric-row
              className="flex items-center justify-between p-3 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {/* Order number */}
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-medium">{index + 1}</span>
                </div>

                {/* Metric info */}
                <div>
                  <p className="font-medium">{metric.label}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono text-xs">{metric.code}</span>
                    {metric.category && (
                      <Badge variant="outline" className="text-xs">
                        {metric.category}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Required toggle */}
                <div className="flex items-center gap-2">
                  <Label htmlFor={`required-${metric.code}`} className="text-sm text-muted-foreground">
                    Required
                  </Label>
                  <Switch
                    id={`required-${metric.code}`}
                    aria-label="Required"
                    checked={metric.isRequired}
                    onCheckedChange={() => handleToggleRequired(metric.code)}
                  />
                </div>

                {/* Move buttons */}
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleMove(index, "up")}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleMove(index, "down")}
                    disabled={index === selectedMetrics.length - 1}
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* Remove button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleRemove(metric.code)}
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Helpful tip */}
      {selectedMetrics.length > 0 && (
        <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
          <strong>Tip:</strong> Mark metrics as "Required" to ensure all athletes complete
          those tests. Use the arrows to set the order metrics appear during data entry.
        </div>
      )}
    </div>
  );
}

export default MetricsSelector;
