/**
 * EventDataEntry - Bulk measurement entry page for event data
 * Allows coaches to enter measurements for checked-in athletes at an event
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  useEvent,
  useEventRegistrations,
  useEventMetrics,
  useEventMeasurements,
  useCreateEventMeasurementsBulk,
  useSaveEventMovementQuality,
  MovementQualitySaveError,
  type EventRegistrationWithUser,
  type CreateEventMeasurementInput,
  type BulkMeasurementResult,
} from "@/lib/events-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useHorizontalScrollState } from "@/hooks/use-horizontal-scroll-state";
import { useAuth } from "@/lib/auth";
import { canManageEvent } from "@/lib/event-permissions";
import { getEventMetricDisplay } from "@/lib/event-metric-display";
import { getCellState, type CellState } from "@/lib/event-grid-cell-state";
import { chunkBulkItems } from "@/lib/event-grid-save";
import {
  MovementQualityPanel,
  type MovementQualitySaveInput,
} from "@/components/events/MovementQualityPanel";
import {
  MQI_PATTERNS,
  MQI_TRANSITIONS,
  MQI_TOTAL_CODE,
  MQI_TRANSITION_TOTAL_CODE,
  computeMqiTotal,
} from "@shared/mqi-entry-schema";
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
  Activity,
  MoveHorizontal,
} from "lucide-react";
import { format } from "date-fns";
import { EVENT_DATA_ENTRY_REGISTRATION_STATUSES } from "@shared/schema";
import type { EventMetric, Measurement, SiteMetric } from "@shared/schema";
import { toCalendarDate } from "@/utils/date-utils";

// Event metric with its site metric, as the server returns it (includeDetails=true)
interface EventMetricWithDetails extends EventMetric {
  metricDetails?: Pick<SiteMetric, "label" | "unit" | "category"> | null;
}

// Cell data type for the measurement grid
interface MeasurementCell {
  userId: string;
  metricCode: string;
  value: string;
  originalValue?: number;
  /** Newest saved row of this cell; a retype replaces it when it is the only one */
  savedMeasurementId?: string;
  /** Saved rows (trials) of this cell */
  savedCount: number;
  isDirty: boolean;
  error?: string;
}

const CELL_STATE_CLASSES: Record<CellState, string> = {
  error: "border-red-500 focus:ring-red-500",
  dirty: "border-yellow-500 bg-yellow-50",
  saved: "bg-green-50",
  empty: "",
};

// Pinned Athlete column. Opaque backgrounds that match the row and header tints, so
// cells scrolled under it do not show through; the box-shadow draws its right edge.
const ATHLETE_COL_WIDTH = "w-32 min-w-32 max-w-32 sm:w-44 sm:min-w-44 sm:max-w-44";
const PINNED_CELL = "sticky left-0 shadow-[1px_0_0_var(--border)]";

// Grid row type (one row per athlete)
interface AthleteRow {
  userId: string;
  fullName: string;
  registrationId: string;
  status: string;
  measurements: Record<string, MeasurementCell>;
}

// Movement Quality scores are entered in a per-athlete panel, not in the numeric grid
const MQ_BASE_CODES = new Set([...MQI_PATTERNS, ...MQI_TRANSITIONS].map((m) => m.code));
const MQ_CODES = new Set([...MQ_BASE_CODES, MQI_TOTAL_CODE, MQI_TRANSITION_TOTAL_CODE]);

// Stable empty list so consumers' memoized prefill does not re-run on every render
const EMPTY_MEASUREMENTS: Measurement[] = [];

export default function EventDataEntry() {
  const { eventId } = useParams<{ eventId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, userOrganizations, organizationsError, refetchOrganizations } = useAuth();

  // State for the measurement grid
  const [gridData, setGridData] = useState<Record<string, AthleteRow>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [mqAthleteId, setMqAthleteId] = useState<string | null>(null);
  const [mqServerErrors, setMqServerErrors] = useState<Record<string, string> | undefined>();

  // Fetch event details
  const { data: event, isLoading: eventLoading } = useEvent(eventId);

  // Fetch checked-in registrations
  const { data: registrations, isLoading: registrationsLoading, refetch: refetchRegistrations } =
    useEventRegistrations(eventId);

  // Fetch configured metrics
  const { data: eventMetrics, isLoading: metricsLoading } = useEventMetrics(eventId);

  // Fetch existing measurements
  const {
    data: existingMeasurements,
    isLoading: measurementsLoading,
    isError: measurementsError,
    refetch: refetchMeasurements,
  } = useEventMeasurements(eventId);
  const savedMeasurements = existingMeasurements ?? EMPTY_MEASUREMENTS;

  // Mutation for bulk save
  const bulkCreate = useCreateEventMeasurementsBulk();
  const saveMovementQuality = useSaveEventMovementQuality();

  // Athletes the server accepts results for (same statuses as the recording sheet and device import)
  const checkedInAthletes = useMemo(() => {
    if (!registrations) return [];
    const statuses: readonly string[] = EVENT_DATA_ENTRY_REGISTRATION_STATUSES;
    return registrations.filter((r: EventRegistrationWithUser) => statuses.includes(r.status));
  }, [registrations]);

  // Sort metrics by display order
  const sortedMetrics = useMemo(() => {
    if (!eventMetrics) return [];
    return [...(eventMetrics as EventMetricWithDetails[])].sort(
      (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)
    );
  }, [eventMetrics]);

  // Numeric grid columns exclude Movement Quality metrics (entered via the MQ panel)
  const gridMetrics = useMemo(
    () => sortedMetrics.filter((m) => !MQ_CODES.has(m.metricCode)),
    [sortedMetrics]
  );
  const mqEnabledCodes = useMemo(
    () => sortedMetrics.map((m) => m.metricCode).filter((c) => MQ_BASE_CODES.has(c)),
    [sortedMetrics]
  );
  const hasMovementQuality = mqEnabledCodes.length > 0;
  const metricColumnCount = gridMetrics.length + (hasMovementQuality ? 1 : 0);
  const displayByCode = useMemo(
    () => new Map(gridMetrics.map((m) => [m.metricCode, getEventMetricDisplay(m)])),
    [gridMetrics]
  );
  const gridScroll = useHorizontalScrollState();
  // MQI_TOTAL / MQ_TRANSITION_TOTAL enabled without any base score to enter them from
  const hasOnlyMqTotals =
    !hasMovementQuality &&
    sortedMetrics.some((m) => m.metricCode === MQI_TOTAL_CODE || m.metricCode === MQI_TRANSITION_TOTAL_CODE);

  // Initialize grid data when data loads. A refetch (e.g. after saving Movement Quality
  // scores) must not erase unsaved grid edits: dirty cells keep their typed value.
  useEffect(() => {
    if (!checkedInAthletes.length || !sortedMetrics.length) return;

    // Rows come newest first (date, then createdAt): the first row per athlete+metric is the
    // cell's value, the rest are earlier trials. Rows derived from other rows are not typed values.
    const measurementLookup = new Map<string, { latest: Measurement; count: number }>();
    existingMeasurements?.forEach((m: Measurement) => {
      if (m.isCalculated && m.calculatedFromMeasurementIds?.length) return;
      const key = `${m.userId}-${m.metric}`;
      const entry = measurementLookup.get(key);
      if (entry) entry.count++;
      else measurementLookup.set(key, { latest: m, count: 1 });
    });

    // Build grid data
    const newGridData: Record<string, AthleteRow> = {};

    checkedInAthletes.forEach((reg: EventRegistrationWithUser) => {
      const userId = reg.userId;
      const measurements: Record<string, MeasurementCell> = {};

      gridMetrics.forEach((metric: EventMetricWithDetails) => {
        const key = `${userId}-${metric.metricCode}`;
        const saved = measurementLookup.get(key);
        const existing = saved?.latest;

        measurements[metric.metricCode] = {
          userId,
          metricCode: metric.metricCode,
          value: existing?.value?.toString() || "",
          originalValue: existing?.value ? Number(existing.value) : undefined,
          savedMeasurementId: existing?.id,
          savedCount: saved?.count ?? 0,
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

    setGridData((prev) => {
      for (const [userId, row] of Object.entries(newGridData)) {
        for (const [metricCode, cell] of Object.entries(row.measurements)) {
          const previous = prev[userId]?.measurements[metricCode];
          if (previous?.isDirty) {
            const originalValue = cell.originalValue?.toString() || "";
            row.measurements[metricCode] = {
              ...cell,
              value: previous.value,
              error: previous.error,
              isDirty: previous.value !== originalValue,
            };
          }
        }
      }
      return newGridData;
    });
  }, [checkedInAthletes, sortedMetrics, gridMetrics, existingMeasurements]);

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
      gridMetrics.filter((m) => m.isRequired).map((m) => m.metricCode)
    );
    // Required Movement Quality scores are entered in the panel, not the grid
    const requiredMqCodes = sortedMetrics
      .filter((m) => m.isRequired && MQ_BASE_CODES.has(m.metricCode))
      .map((m) => m.metricCode);
    const savedMq = new Set(
      savedMeasurements.filter((m) => MQ_BASE_CODES.has(m.metric)).map((m) => `${m.userId}-${m.metric}`)
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
      requiredMqCodes.forEach((code) => {
        required++;
        if (savedMq.has(`${row.userId}-${code}`)) requiredFilled++;
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
  }, [gridData, gridMetrics, sortedMetrics, savedMeasurements]);

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

    // Collect all dirty cells with valid values; cellsToSave[i] is the cell of measurementsToSave[i]
    const measurementsToSave: CreateEventMeasurementInput[] = [];
    const cellsToSave: MeasurementCell[] = [];

    Object.values(gridData).forEach((row) => {
      Object.values(row.measurements).forEach((cell) => {
        if (cell.isDirty && cell.value !== "" && !cell.error) {
          cellsToSave.push(cell);
          measurementsToSave.push({
            userId: cell.userId,
            metric: cell.metricCode,
            value: Number(cell.value),
            date: event?.startDate
              ? new Date(event.startDate).toISOString()
              : new Date().toISOString(),
            // One saved row: the retype corrects it. Several (trials): the retype is a new trial.
            ...(cell.savedCount === 1 && cell.savedMeasurementId
              ? { replaceMeasurementId: cell.savedMeasurementId }
              : {}),
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

    // Apply one request's per-item results to the cells it sent. A cell edited again while
    // the request was in flight keeps its new value and stays dirty.
    const applyResult = (offset: number, result: BulkMeasurementResult) => {
      const patches = new Map<MeasurementCell, (current: MeasurementCell) => Partial<MeasurementCell>>();
      const savedRows = [
        ...result.created.map((row) => ({ row, replaced: false })),
        ...result.replaced.map((row) => ({ row, replaced: true })),
      ];
      savedRows.forEach(({ row, replaced }) => {
        const sent = cellsToSave[offset + row.index];
        if (!sent) return;
        patches.set(sent, (current) => ({
          originalValue: Number(sent.value),
          savedMeasurementId: row.id,
          savedCount: replaced ? sent.savedCount : sent.savedCount + 1,
          ...(current.value === sent.value ? { isDirty: false, error: undefined } : {}),
        }));
      });
      result.errors.forEach(({ index, error }) => {
        const sent = cellsToSave[offset + index];
        if (sent) patches.set(sent, (current) => (current.value === sent.value ? { error } : {}));
      });
      setGridData((prev) => {
        const next = { ...prev };
        patches.forEach((patch, sent) => {
          const row = next[sent.userId];
          const current = row?.measurements[sent.metricCode];
          if (!current) return;
          next[sent.userId] = {
            ...row,
            measurements: { ...row.measurements, [sent.metricCode]: { ...current, ...patch(current) } },
          };
        });
        return next;
      });
      return { saved: savedRows.length, failed: result.errors.length };
    };

    // Requests of <= 200 items and well under 100 kB, sent one after another; stop at the first
    // request that fails as a whole. Saved cells are clean, so a retry cannot send them twice.
    let savedCount = 0;
    let failedCount = 0;
    let failure: string | undefined;
    setIsSaving(true);
    try {
      let offset = 0;
      for (const chunk of chunkBulkItems(measurementsToSave)) {
        const result = await bulkCreate.mutateAsync({ eventId: eventId!, measurements: chunk });
        const counts = applyResult(offset, result);
        savedCount += counts.saved;
        failedCount += counts.failed;
        offset += chunk.length;
      }
    } catch (error: any) {
      failure = error?.message || "Failed to save measurements.";
    } finally {
      setIsSaving(false);
      // Refetch whatever happened: earlier requests may have saved rows
      await refetchMeasurements();
    }

    const total = measurementsToSave.length;
    if (failure || failedCount > 0) {
      toast({
        variant: "destructive",
        title: failure ? "Save Failed" : "Partial Save",
        description: `Saved ${savedCount} of ${total} measurements. ${
          failure ?? `${failedCount} could not be saved; see the highlighted cells.`
        }`,
      });
    } else {
      toast({
        title: "Saved Successfully",
        description: `${savedCount} measurements saved.`,
      });
    }
  };

  // Per-athlete Movement Quality summary for the grid buttons (one pass over the measurements)
  const mqSummaryByUser = useMemo(() => {
    const scoresByUser = new Map<string, Record<string, number>>();
    savedMeasurements.forEach((m: Measurement) => {
      if (!MQ_BASE_CODES.has(m.metric)) return;
      const scores = scoresByUser.get(m.userId) ?? {};
      scores[m.metric] = Number(m.value);
      scoresByUser.set(m.userId, scores);
    });
    const summaries = new Map<string, string>();
    scoresByUser.forEach((scores, userId) => {
      const scored = MQI_PATTERNS.filter((p) => scores[p.code] !== undefined).length;
      const total = computeMqiTotal(scores);
      summaries.set(userId, total !== null ? `${total} / 24` : scored > 0 ? `${scored} of 8 scored` : "Not scored");
    });
    return summaries;
  }, [savedMeasurements]);

  const openMovementQuality = (userId: string) => {
    setMqServerErrors(undefined);
    setMqAthleteId(userId);
  };

  // Save one athlete's Movement Quality scores in one atomic request (upserts + deletes)
  const handleSaveMovementQuality = async ({ upserts, deletes }: MovementQualitySaveInput) => {
    if (event?.isFrozen) {
      toast({
        variant: "destructive",
        title: "Event is Frozen",
        description: "Cannot modify measurements for a frozen event.",
      });
      return;
    }
    if (!mqAthleteId) return;
    if (upserts.length === 0 && deletes.length === 0) {
      toast({ title: "No Changes", description: "No scores to save." });
      setMqAthleteId(null);
      return;
    }

    setIsSaving(true);
    setMqServerErrors(undefined);
    try {
      await saveMovementQuality.mutateAsync({
        eventId: eventId!,
        userId: mqAthleteId,
        upserts: upserts.map(({ metric, value, notes, mediaUrl }) => ({ metric, value, notes, mediaUrl })),
        deletes,
      });
      toast({ title: "Scores Saved", description: "Movement Quality scores saved." });
      setMqAthleteId(null);
    } catch (error: any) {
      if (error instanceof MovementQualitySaveError) {
        setMqServerErrors(Object.fromEntries(error.errors.map((e) => [e.metric, e.error])));
      }
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message || "Failed to save scores.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const mqAthlete = mqAthleteId ? gridData[mqAthleteId] : undefined;

  // Handle refresh
  const handleRefresh = async () => {
    await Promise.all([refetchRegistrations(), refetchMeasurements()]);
    toast({
      title: "Refreshed",
      description: "Data has been refreshed.",
    });
  };

  // Organization memberships could not be loaded: offer a retry instead of an endless skeleton
  const organizationsMissing = !!user && !user.isSiteAdmin && userOrganizations === null;
  if (organizationsMissing && organizationsError) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Could not load your organizations</h2>
            <p className="text-muted-foreground mb-4">
              Your organization memberships are needed to check access to this event.
            </p>
            <Button variant="outline" onClick={() => refetchOrganizations()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state (auth and organization memberships included, so managers never
  // see a flash of Access Denied while they load)
  const authLoading = !user || organizationsMissing;
  if (authLoading || eventLoading || registrationsLoading || metricsLoading || measurementsLoading) {
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

  // Event managers only (coach, org_admin, site_admin), same rule as the event page:
  // athletes cannot enter Movement Quality scores or attach clips (AM-FEAT-015)
  if (!canManageEvent(user, userOrganizations, event)) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">
              Only coaches and organization admins can enter data for this event.
            </p>
            <Button variant="outline" onClick={() => navigate(`/events/${eventId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Event
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
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              {format(toCalendarDate(event.startDate)!, "MMM d, yyyy")}
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
            <div className="text-2xl font-bold">{metricColumnCount}</div>
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

      {hasOnlyMqTotals && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-700">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">
            MQI total is calculated from the 8 Movement Quality pattern scores. Add those metrics
            to this event to enter scores.
          </span>
        </div>
      )}

      {hasMovementQuality && measurementsError && (
        <div role="alert" className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">
            Could not load saved scores. Movement Quality entry is disabled until you refresh.
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
        <CardContent className="px-3 sm:px-6">
          {gridScroll.hasOverflow && (
            <p className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MoveHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
              {metricColumnCount} metric {metricColumnCount === 1 ? "column" : "columns"} · scroll sideways to see {metricColumnCount === 1 ? "it" : "them all"}
            </p>
          )}
          <div className="relative">
            <div
              ref={gridScroll.ref}
              className="relative overflow-x-auto scrollbar-always-visible scroll-pl-32 sm:scroll-pl-44"
            >
              <TooltipProvider delayDuration={300}>
                <table className="w-max min-w-full border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th
                        scope="col"
                        className={`${PINNED_CELL} ${ATHLETE_COL_WIDTH} z-20 p-2 sm:p-3 text-left font-medium bg-[color-mix(in_srgb,var(--muted)_50%,var(--card))]`}
                      >
                        Athlete
                      </th>
                      {gridMetrics.map((metric: EventMetricWithDetails) => {
                        const display = displayByCode.get(metric.metricCode) ?? getEventMetricDisplay(metric);
                        return (
                          <th
                            key={metric.metricCode}
                            scope="col"
                            className="w-[104px] min-w-[104px] p-1.5 text-center align-bottom font-medium"
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="flex items-start justify-center gap-0.5 text-xs sm:text-sm leading-tight">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className="line-clamp-3 break-words"
                                      title={`${display.label} (${display.code})`}
                                    >
                                      {display.label}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div>{display.label}</div>
                                    <div className="font-mono text-xs text-muted-foreground">{display.code}</div>
                                  </TooltipContent>
                                </Tooltip>
                                {metric.isRequired && (
                                  <>
                                    <span className="text-red-500" aria-hidden="true">*</span>
                                    <span className="sr-only">(required)</span>
                                  </>
                                )}
                              </span>
                              {display.unit && (
                                <span className="text-xs font-normal text-muted-foreground">({display.unit})</span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                      {hasMovementQuality && (
                        <th scope="col" className="min-w-[136px] p-1.5 text-center align-bottom font-medium">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs sm:text-sm leading-tight">Movement Quality</span>
                            <span className="text-xs font-normal text-muted-foreground">(MQI, 0-24)</span>
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(gridData).map((row) => (
                      <tr key={row.userId} className="group border-b hover:bg-muted/30">
                        <th
                          scope="row"
                          className={`${PINNED_CELL} ${ATHLETE_COL_WIDTH} z-10 p-2 sm:p-3 text-left font-normal bg-card group-hover:bg-[color-mix(in_srgb,var(--muted)_30%,var(--card))]`}
                        >
                          <div className="font-medium break-words">{row.fullName}</div>
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
                        </th>
                        {gridMetrics.map((metric: EventMetricWithDetails) => {
                          const cell = row.measurements[metric.metricCode];
                          if (!cell) return <td key={metric.metricCode} className="p-1" />;
                          const errorId = `cell-error-${row.userId}-${metric.metricCode}`;
                          const trialsId = `cell-trials-${row.userId}-${metric.metricCode}`;
                          const hasTrials = cell.savedCount > 1;
                          const describedBy = [cell.error && errorId, hasTrials && trialsId].filter(Boolean).join(" ");

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
                                aria-label={`${(displayByCode.get(metric.metricCode) ?? getEventMetricDisplay(metric)).label} for ${row.fullName}`}
                                aria-required={metric.isRequired || undefined}
                                aria-invalid={cell.error ? true : undefined}
                                aria-describedby={describedBy || undefined}
                                className={`h-9 px-1 text-center ${CELL_STATE_CLASSES[getCellState(cell)]}`}
                                placeholder="-"
                              />
                              {cell.error && (
                                <div id={errorId} className="text-[11px] leading-tight text-red-500 text-center mt-1">
                                  {cell.error}
                                </div>
                              )}
                              {hasTrials && (
                                <div
                                  id={trialsId}
                                  title="Shows the newest trial. A new value is saved as another trial."
                                  className="text-[11px] leading-tight text-muted-foreground text-center mt-1"
                                >
                                  {cell.savedCount} saved trials
                                </div>
                              )}
                            </td>
                          );
                        })}
                        {hasMovementQuality && (
                          <td className="p-1 text-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openMovementQuality(row.userId)}
                              disabled={measurementsError}
                              aria-label={`Movement Quality for ${row.fullName}`}
                            >
                              <Activity className="h-4 w-4 mr-2" />
                              {mqSummaryByUser.get(row.userId) ?? "Not scored"}
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TooltipProvider>
            </div>
            {/* Edge fades: show that more columns are hidden even where the OS hides scrollbars.
                The left one reads as a shadow cast by the pinned Athlete column. */}
            {gridScroll.canScrollLeft && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 bottom-4 left-32 sm:left-44 z-10 w-3 bg-linear-to-r from-foreground/10 to-transparent"
              />
            )}
            {gridScroll.canScrollRight && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 bottom-4 right-0 z-10 w-10 bg-linear-to-l from-card to-transparent"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {hasMovementQuality && mqAthlete && (
        <MovementQualityPanel
          open={!!mqAthleteId}
          onOpenChange={(open) => !open && setMqAthleteId(null)}
          athleteName={mqAthlete.fullName}
          userId={mqAthlete.userId}
          eventDate={new Date(event.startDate).toISOString()}
          enabledMetricCodes={mqEnabledCodes}
          measurements={savedMeasurements}
          disabled={event.isFrozen}
          isSaving={isSaving}
          serverErrors={mqServerErrors}
          onSave={handleSaveMovementQuality}
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
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
