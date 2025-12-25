/**
 * EventDataEntry - Bulk measurement entry page for event data
 * Allows coaches to enter measurements for checked-in athletes at an event
 */

import { useState, useMemo, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useEvent,
  useEventRegistrations,
  useEventMetrics,
  useEventMeasurements,
  useCreateEventMeasurementsBulk,
  type EventRegistrationWithUser,
  type CreateEventMeasurementInput,
} from "@/lib/events-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Save,
  CheckCircle,
  AlertCircle,
  Users,
  BarChart3,
  Lock,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import type { EventMetric, Measurement } from "@shared/schema";

// Extended metric type with details from site_metrics
interface EventMetricWithDetails extends EventMetric {
  label?: string;
  category?: string;
  units?: string;
}

// Cell data type for the measurement grid
interface MeasurementCell {
  userId: string;
  metricCode: string;
  value: string;
  originalValue?: number;
  isDirty: boolean;
  error?: string;
}

// Grid row type (one row per athlete)
interface AthleteRow {
  userId: string;
  fullName: string;
  registrationId: string;
  status: string;
  measurements: Record<string, MeasurementCell>;
}

export default function EventDataEntry() {
  const { eventId } = useParams<{ eventId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // State for the measurement grid
  const [gridData, setGridData] = useState<Record<string, AthleteRow>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Fetch event details
  const { data: event, isLoading: eventLoading } = useEvent(eventId);

  // Fetch checked-in registrations
  const { data: registrations, isLoading: registrationsLoading, refetch: refetchRegistrations } =
    useEventRegistrations(eventId);

  // Fetch configured metrics
  const { data: eventMetrics, isLoading: metricsLoading } = useEventMetrics(eventId);

  // Fetch existing measurements
  const { data: existingMeasurements, isLoading: measurementsLoading, refetch: refetchMeasurements } =
    useEventMeasurements(eventId);

  // Mutation for bulk save
  const bulkCreate = useCreateEventMeasurementsBulk();

  // Filter to only checked-in athletes
  const checkedInAthletes = useMemo(() => {
    if (!registrations) return [];
    return registrations.filter(
      (r: EventRegistrationWithUser) =>
        r.status === "checked_in" || r.status === "approved"
    );
  }, [registrations]);

  // Sort metrics by display order
  const sortedMetrics = useMemo(() => {
    if (!eventMetrics) return [];
    return [...(eventMetrics as EventMetricWithDetails[])].sort(
      (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)
    );
  }, [eventMetrics]);

  // Initialize grid data when data loads
  useMemo(() => {
    if (!checkedInAthletes.length || !sortedMetrics.length) return;

    // Build lookup of existing measurements
    const measurementLookup = new Map<string, Measurement>();
    existingMeasurements?.forEach((m: Measurement) => {
      const key = `${m.userId}-${m.metric}`;
      measurementLookup.set(key, m);
    });

    // Build grid data
    const newGridData: Record<string, AthleteRow> = {};

    checkedInAthletes.forEach((reg: EventRegistrationWithUser) => {
      const userId = reg.userId;
      const measurements: Record<string, MeasurementCell> = {};

      sortedMetrics.forEach((metric: EventMetricWithDetails) => {
        const key = `${userId}-${metric.metricCode}`;
        const existing = measurementLookup.get(key);

        measurements[metric.metricCode] = {
          userId,
          metricCode: metric.metricCode,
          value: existing?.value?.toString() || "",
          originalValue: existing?.value ? Number(existing.value) : undefined,
          isDirty: false,
        };
      });

      newGridData[userId] = {
        userId,
        fullName: reg.userFullName || reg.userFullNameSnapshot || "Unknown Athlete",
        registrationId: reg.id,
        status: reg.status,
        measurements,
      };
    });

    setGridData(newGridData);
  }, [checkedInAthletes, sortedMetrics, existingMeasurements]);

  // Handle cell value change
  const handleCellChange = useCallback(
    (userId: string, metricCode: string, value: string) => {
      setGridData((prev) => {
        const row = prev[userId];
        if (!row) return prev;

        const cell = row.measurements[metricCode];
        if (!cell) return prev;

        // Validate numeric input
        let error: string | undefined;
        if (value !== "" && isNaN(Number(value))) {
          error = "Must be a number";
        }

        const originalValue = cell.originalValue?.toString() || "";
        const isDirty = value !== originalValue;

        return {
          ...prev,
          [userId]: {
            ...row,
            measurements: {
              ...row.measurements,
              [metricCode]: {
                ...cell,
                value,
                isDirty,
                error,
              },
            },
          },
        };
      });
    },
    []
  );

  // Calculate dirty count
  const dirtyCount = useMemo(() => {
    let count = 0;
    Object.values(gridData).forEach((row) => {
      Object.values(row.measurements).forEach((cell) => {
        if (cell.isDirty && cell.value !== "" && !cell.error) {
          count++;
        }
      });
    });
    return count;
  }, [gridData]);

  // Calculate completion stats
  const completionStats = useMemo(() => {
    let filled = 0;
    let total = 0;
    let required = 0;
    let requiredFilled = 0;

    const requiredMetrics = new Set(
      sortedMetrics.filter((m) => m.isRequired).map((m) => m.metricCode)
    );

    Object.values(gridData).forEach((row) => {
      Object.entries(row.measurements).forEach(([metricCode, cell]) => {
        total++;
        if (cell.value !== "") filled++;
        if (requiredMetrics.has(metricCode)) {
          required++;
          if (cell.value !== "") requiredFilled++;
        }
      });
    });

    return {
      filled,
      total,
      required,
      requiredFilled,
      percentage: total > 0 ? Math.round((filled / total) * 100) : 0,
      requiredPercentage: required > 0 ? Math.round((requiredFilled / required) * 100) : 0,
    };
  }, [gridData, sortedMetrics]);

  // Handle save
  const handleSave = async () => {
    if (event?.isFrozen) {
      toast({
        variant: "destructive",
        title: "Event is Frozen",
        description: "Cannot modify measurements for a frozen event.",
      });
      return;
    }

    // Collect all dirty cells with valid values
    const measurementsToSave: CreateEventMeasurementInput[] = [];

    Object.values(gridData).forEach((row) => {
      Object.values(row.measurements).forEach((cell) => {
        if (cell.isDirty && cell.value !== "" && !cell.error) {
          measurementsToSave.push({
            userId: cell.userId,
            metric: cell.metricCode,
            value: Number(cell.value),
            date: event?.startDate
              ? new Date(event.startDate).toISOString()
              : new Date().toISOString(),
          });
        }
      });
    });

    if (measurementsToSave.length === 0) {
      toast({
        title: "No Changes",
        description: "No measurements to save.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await bulkCreate.mutateAsync({
        eventId: eventId!,
        measurements: measurementsToSave,
      });

      if (result.errors?.length > 0) {
        toast({
          variant: "destructive",
          title: "Partial Save",
          description: `Saved ${result.created.length} measurements. ${result.errors.length} errors occurred.`,
        });
      } else {
        toast({
          title: "Saved Successfully",
          description: `${result.created.length} measurements saved.`,
        });
      }

      // Refetch measurements to update the grid
      await refetchMeasurements();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message || "Failed to save measurements.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    await Promise.all([refetchRegistrations(), refetchMeasurements()]);
    toast({
      title: "Refreshed",
      description: "Data has been refreshed.",
    });
  };

  // Loading state
  if (eventLoading || registrationsLoading || metricsLoading || measurementsLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // Not found
  if (!event) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Event Not Found</h2>
            <Button variant="outline" onClick={() => navigate("/events")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Events
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No metrics configured
  if (sortedMetrics.length === 0) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/events/${eventId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Data Entry: {event.name}</h1>
        </div>

        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">No Metrics Configured</h2>
            <p className="text-muted-foreground mb-4">
              Configure which metrics will be recorded at this event first.
            </p>
            <Button onClick={() => navigate(`/events/${eventId}`)}>
              Go to Event Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No athletes checked in
  if (checkedInAthletes.length === 0) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/events/${eventId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Data Entry: {event.name}</h1>
        </div>

        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">No Athletes Ready</h2>
            <p className="text-muted-foreground mb-4">
              Athletes need to be checked in or approved before you can enter their data.
            </p>
            <Button onClick={() => navigate(`/events/${eventId}`)}>
              Go to Check-In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/events/${eventId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Data Entry: {event.name}
              {event.isFrozen && (
                <Badge variant="outline" className="bg-blue-100 text-blue-700">
                  <Lock className="h-3 w-3 mr-1" />
                  Frozen
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground">
              {format(new Date(event.startDate), "MMM d, yyyy")}
              {event.location && ` • ${event.location}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={handleSave}
            disabled={dirtyCount === 0 || isSaving || event.isFrozen}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save {dirtyCount > 0 && `(${dirtyCount})`}
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3">
            <div className="text-sm text-muted-foreground">Athletes</div>
            <div className="text-2xl font-bold">{checkedInAthletes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-sm text-muted-foreground">Metrics</div>
            <div className="text-2xl font-bold">{sortedMetrics.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-sm text-muted-foreground">Completion</div>
            <div className="text-2xl font-bold">
              {completionStats.percentage}%
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({completionStats.filled}/{completionStats.total})
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-sm text-muted-foreground">Required</div>
            <div className="text-2xl font-bold">
              {completionStats.requiredPercentage}%
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({completionStats.requiredFilled}/{completionStats.required})
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Frozen warning */}
      {event.isFrozen && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-700">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">
            This event is frozen. Measurements cannot be modified.
          </span>
        </div>
      )}

      {/* Unsaved changes warning */}
      {dirtyCount > 0 && !event.isFrozen && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg text-yellow-700">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">
            You have {dirtyCount} unsaved measurement{dirtyCount !== 1 && "s"}.
          </span>
        </div>
      )}

      {/* Data Entry Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Measurement Entry</CardTitle>
          <CardDescription>
            Enter measurements for each athlete. Tab or click between cells. Required metrics are
            marked with *.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium sticky left-0 bg-muted/50 min-w-[200px]">
                    Athlete
                  </th>
                  {sortedMetrics.map((metric: EventMetricWithDetails) => (
                    <th
                      key={metric.metricCode}
                      className="p-3 text-center font-medium min-w-[120px]"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>
                          {metric.customLabel || metric.label || metric.metricCode}
                          {metric.isRequired && <span className="text-red-500 ml-1">*</span>}
                        </span>
                        {metric.units && (
                          <span className="text-xs text-muted-foreground">({metric.units})</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.values(gridData).map((row) => (
                  <tr key={row.userId} className="border-b hover:bg-muted/30">
                    <td className="p-3 sticky left-0 bg-white">
                      <div className="font-medium">{row.fullName}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {row.status === "checked_in" ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-3 w-3" />
                            Checked In
                          </span>
                        ) : (
                          row.status
                        )}
                      </div>
                    </td>
                    {sortedMetrics.map((metric: EventMetricWithDetails) => {
                      const cell = row.measurements[metric.metricCode];
                      if (!cell) return <td key={metric.metricCode} className="p-1" />;

                      return (
                        <td key={metric.metricCode} className="p-1">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={cell.value}
                            onChange={(e) =>
                              handleCellChange(row.userId, metric.metricCode, e.target.value)
                            }
                            disabled={event.isFrozen}
                            className={`text-center ${
                              cell.error
                                ? "border-red-500 focus:ring-red-500"
                                : cell.isDirty
                                  ? "border-yellow-500 bg-yellow-50"
                                  : cell.originalValue !== undefined
                                    ? "bg-green-50"
                                    : ""
                            }`}
                            placeholder="-"
                          />
                          {cell.error && (
                            <div className="text-xs text-red-500 text-center mt-1">{cell.error}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-50 border border-green-200" />
          <span>Saved</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-50 border border-yellow-500" />
          <span>Unsaved changes</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-white border border-gray-300" />
          <span>Empty</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-red-500">*</span>
          <span>Required metric</span>
        </div>
      </div>
    </div>
  );
}
