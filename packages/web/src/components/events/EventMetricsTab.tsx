/**
 * EventMetricsTab - Configure which metrics/tests are conducted at an event
 * Allows adding, removing, and reordering metrics
 */

import { useState } from "react";
import {
  useEventMetrics,
  useAddEventMetric,
  useRemoveEventMetric,
  useUpdateEventMetric,
  useReorderEventMetrics,
} from "@/lib/events-api";
import { useSiteMetrics } from "@/lib/metrics-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
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
  GripVertical,
  ChevronUp,
  ChevronDown,
  Lock,
  AlertCircle,
} from "lucide-react";
import type { EventMetric, SiteMetric } from "@shared/schema";

interface EventMetricsTabProps {
  eventId: string;
  organizationId?: string;
  isFrozen?: boolean;
}

// Extended metric type with details from site_metrics
interface EventMetricWithDetails extends EventMetric {
  label?: string;
  category?: string;
  units?: string;
}

export function EventMetricsTab({ eventId, organizationId, isFrozen = false }: EventMetricsTabProps) {
  const { toast } = useToast();
  const [selectedMetric, setSelectedMetric] = useState<string>("");

  // Fetch event metrics (with details)
  const { data: eventMetrics, isLoading: metricsLoading } = useEventMetrics(eventId);

  // Fetch available site metrics
  const { data: siteMetrics, isLoading: siteMetricsLoading } = useSiteMetrics(false, organizationId);

  // Mutations
  const addMetric = useAddEventMetric();
  const removeMetric = useRemoveEventMetric();
  const updateMetric = useUpdateEventMetric();
  const reorderMetrics = useReorderEventMetrics();

  const typedEventMetrics = (eventMetrics as EventMetricWithDetails[]) || [];

  // Filter out already-added metrics from available list
  const addedMetricCodes = new Set(typedEventMetrics.map((m) => m.metricCode));
  const availableMetrics = (siteMetrics || []).filter(
    (m: SiteMetric) => !addedMetricCodes.has(m.code)
  );

  // Handle add metric
  const handleAddMetric = async () => {
    if (!selectedMetric) return;

    try {
      await addMetric.mutateAsync({
        eventId,
        data: {
          metricCode: selectedMetric,
          displayOrder: typedEventMetrics.length,
          isRequired: false,
        },
      });
      setSelectedMetric("");
      toast({
        title: "Metric Added",
        description: "The metric has been added to this event.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to add metric.",
      });
    }
  };

  // Handle remove metric
  const handleRemoveMetric = async (metricCode: string) => {
    try {
      await removeMetric.mutateAsync({ eventId, metricCode });
      toast({
        title: "Metric Removed",
        description: "The metric has been removed from this event.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to remove metric.",
      });
    }
  };

  // Handle toggle required
  const handleToggleRequired = async (metric: EventMetricWithDetails) => {
    try {
      await updateMetric.mutateAsync({
        eventId,
        metricCode: metric.metricCode,
        data: { isRequired: !metric.isRequired },
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update metric.",
      });
    }
  };

  // Handle move up/down
  const handleMove = async (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === typedEventMetrics.length - 1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    const newOrder = [...typedEventMetrics];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];

    try {
      await reorderMetrics.mutateAsync({
        eventId,
        orderedMetricCodes: newOrder.map((m) => m.metricCode),
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to reorder metrics.",
      });
    }
  };

  if (metricsLoading || siteMetricsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Event Metrics</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Event Metrics
              {isFrozen && (
                <Badge variant="outline" className="ml-2 bg-blue-100 text-blue-700">
                  <Lock className="h-3 w-3 mr-1" />
                  Frozen
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Configure which tests will be conducted at this event.
              {typedEventMetrics.length > 0 && ` ${typedEventMetrics.length} metrics configured.`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add Metric Section */}
        {!isFrozen && (
          <div className="flex gap-3">
            <Select value={selectedMetric} onValueChange={setSelectedMetric}>
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
              onClick={handleAddMetric}
              disabled={!selectedMetric || addMetric.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
        )}

        {isFrozen && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-700">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">
              This event is frozen. Metrics cannot be modified.
            </span>
          </div>
        )}

        {/* Configured Metrics List */}
        <div className="space-y-2">
          {typedEventMetrics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No metrics configured</p>
              <p className="text-sm mt-1">
                Add metrics to define which tests will be conducted at this event.
              </p>
            </div>
          ) : (
            typedEventMetrics
              .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
              .map((metric, index) => (
                <div
                  key={metric.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Drag handle / order indicator */}
                    <div className="text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                    </div>

                    {/* Order number */}
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-medium">{index + 1}</span>
                    </div>

                    {/* Metric info */}
                    <div>
                      <p className="font-medium">
                        {metric.customLabel || metric.label || metric.metricCode}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-mono text-xs">{metric.metricCode}</span>
                        {metric.category && (
                          <Badge variant="outline" className="text-xs">
                            {metric.category}
                          </Badge>
                        )}
                        {metric.units && <span>({metric.units})</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Required toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Required</span>
                      <Switch
                        checked={metric.isRequired || false}
                        onCheckedChange={() => handleToggleRequired(metric)}
                        disabled={isFrozen || updateMetric.isPending}
                      />
                    </div>

                    {/* Move buttons */}
                    {!isFrozen && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleMove(index, "up")}
                          disabled={index === 0 || reorderMetrics.isPending}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleMove(index, "down")}
                          disabled={index === typedEventMetrics.length - 1 || reorderMetrics.isPending}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    {/* Remove button */}
                    {!isFrozen && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemoveMetric(metric.metricCode)}
                        disabled={removeMetric.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
          )}
        </div>

        {/* Info footer */}
        {typedEventMetrics.length > 0 && (
          <div className="pt-4 border-t text-sm text-muted-foreground">
            <p>
              <strong>Tip:</strong> Mark metrics as "Required" to ensure all athletes complete
              those tests. Use the up/down arrows to set the order in which tests appear during
              data entry.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EventMetricsTab;
