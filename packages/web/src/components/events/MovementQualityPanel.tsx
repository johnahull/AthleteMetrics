/**
 * MovementQualityPanel - per-athlete Movement Quality (MQI) entry dialog (AM-FEAT-015)
 *
 * 8 pattern rows + 4 optional transition rows, each with a 0-3 segmented picker,
 * optional https clip link and optional notes. Shows a live MQI_TOTAL preview
 * ("incomplete" until all 8 patterns are scored). Prefilled from the event's existing
 * measurements so scores can be edited after the fact. The parent performs the writes.
 */

import { useEffect, useMemo, useRef } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2, Lock } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  MQI_NOTES_MAX,
  MQI_PATTERNS,
  MQI_RUBRIC,
  MQI_TRANSITIONS,
  computeMqiTotal,
  computeTransitionTotal,
  diffMqiEntry,
  emptyMqiEntry,
  mqiEntrySchema,
  type MqiEntryValues,
  type MqiMetricDef,
  type MqiSavedRow,
  type MqiWrite,
} from "@shared/mqi-entry-schema";
import type { Measurement } from "@shared/schema";

export interface MovementQualitySaveInput {
  upserts: MqiWrite[];
  deletes: string[];
}

interface MovementQualityPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteName: string;
  userId: string;
  /** Event start date (ISO). All scores are written with this date so derived totals line up. */
  eventDate: string;
  /** Metric codes enabled on the event; transition rows only show if one is enabled */
  enabledMetricCodes: string[];
  /** The event's existing measurements (any athlete/metric; filtered here) */
  measurements: Measurement[];
  /** Frozen event: read-only */
  disabled?: boolean;
  isSaving?: boolean;
  /** Per-metric errors returned by the server for the last save (metric code -> message) */
  serverErrors?: Record<string, string>;
  onSave: (input: MovementQualitySaveInput) => Promise<void> | void;
}

function rubricLabel(score: number | null | undefined): string | null {
  if (score === null || score === undefined) return null;
  return MQI_RUBRIC.find((r) => r.score === score)?.label ?? null;
}

function savedRowsFor(userId: string, measurements: Measurement[]): Record<string, MqiSavedRow> {
  const codes = new Set([...MQI_PATTERNS, ...MQI_TRANSITIONS].map((m) => m.code));
  const result: Record<string, MqiSavedRow> = {};
  for (const m of measurements) {
    if (m.userId !== userId || !codes.has(m.metric)) continue;
    result[m.metric] = {
      id: m.id,
      score: Number(m.value),
      mediaUrl: m.mediaUrl ?? null,
      notes: m.notes ?? null,
    };
  }
  return result;
}

function valuesFromSaved(saved: Record<string, MqiSavedRow>): MqiEntryValues {
  const values = emptyMqiEntry();
  for (const [code, row] of Object.entries(saved)) {
    values.rows[code] = { score: row.score, mediaUrl: row.mediaUrl ?? "", notes: row.notes ?? "" };
  }
  return values;
}

export function MovementQualityPanel({
  open,
  onOpenChange,
  athleteName,
  userId,
  eventDate,
  enabledMetricCodes,
  measurements,
  disabled = false,
  isSaving = false,
  serverErrors,
  onSave,
}: MovementQualityPanelProps) {
  const saved = useMemo(() => savedRowsFor(userId, measurements), [userId, measurements]);
  const showTransitions = MQI_TRANSITIONS.some((t) => enabledMetricCodes.includes(t.code));

  const form = useForm<MqiEntryValues>({
    resolver: zodResolver(mqiEntrySchema),
    defaultValues: valuesFromSaved(saved),
  });

  // Prefill only when the dialog goes from closed to open (or another athlete is opened):
  // a refetch of the saved data while it is open must not wipe in-progress edits.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      prefilledFor.current = null;
      return;
    }
    if (prefilledFor.current !== userId) {
      prefilledFor.current = userId;
      form.reset(valuesFromSaved(saved));
    }
  }, [open, userId, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useWatch({ control: form.control, name: "rows" });
  const scores = useMemo(
    () => Object.fromEntries(Object.entries(rows ?? {}).map(([code, r]) => [code, r?.score ?? null])),
    [rows]
  );
  const patternsScored = MQI_PATTERNS.filter((p) => scores[p.code] !== null && scores[p.code] !== undefined).length;
  const transitionsScored = MQI_TRANSITIONS.filter(
    (t) => scores[t.code] !== null && scores[t.code] !== undefined
  ).length;
  const mqiTotal = computeMqiTotal(scores);
  const transitionTotal = computeTransitionTotal(scores);

  const submit = form.handleSubmit(async (values) => {
    const diff = diffMqiEntry(userId, values, saved, eventDate);
    await onSave(diff);
  });

  const clearRow = (code: string) => {
    const opts = { shouldDirty: true, shouldValidate: form.formState.isSubmitted };
    form.setValue(`rows.${code}.score`, null, opts);
    form.setValue(`rows.${code}.mediaUrl`, "", opts);
    form.setValue(`rows.${code}.notes`, "", opts);
  };

  const renderRow = (metric: MqiMetricDef) => {
    const labelId = `mq-label-${metric.code}`;
    const scoreHintId = `mq-score-hint-${metric.code}`;
    const errorId = `mq-error-${metric.code}`;
    const clipId = `mq-clip-${metric.code}`;
    const notesId = `mq-notes-${metric.code}`;
    const error = form.formState.errors.rows?.[metric.code];
    const errorMessage =
      error?.score?.message || error?.mediaUrl?.message || error?.notes?.message || serverErrors?.[metric.code];
    const row = rows?.[metric.code];
    const rowEmpty = !row || (row.score === null && !row.mediaUrl && !row.notes);
    const describedBy = errorMessage ? errorId : undefined;
    return (
      <div key={metric.code} className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-sm">
            <span id={labelId}>{metric.label}</span>
            <span id={scoreHintId} className="sr-only">
              {" "}score (0 to 3)
            </span>
            {rubricLabel(scores[metric.code]) && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {rubricLabel(scores[metric.code])}
              </span>
            )}
          </span>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Controller
              control={form.control}
              name={`rows.${metric.code}.score`}
              render={({ field, fieldState }) => (
                <ToggleGroup
                  ref={field.ref}
                  type="single"
                  variant="outline"
                  value={field.value === null || field.value === undefined ? "" : String(field.value)}
                  onValueChange={(v) => field.onChange(v === "" ? null : Number(v))}
                  disabled={disabled}
                  role="group"
                  aria-labelledby={`${labelId} ${scoreHintId}`}
                  aria-describedby={describedBy}
                  aria-invalid={fieldState.invalid || !!serverErrors?.[metric.code] || undefined}
                  className="w-full justify-start sm:w-auto"
                >
                  {[...MQI_RUBRIC].reverse().map((r) => (
                    <ToggleGroupItem
                      key={r.score}
                      value={String(r.score)}
                      aria-label={`${r.score} ${r.label}`}
                      className="h-11 flex-1 sm:h-9 sm:w-9 sm:flex-none data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                      {r.score}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 shrink-0 sm:h-9"
              onClick={() => clearRow(metric.code)}
              disabled={disabled || rowEmpty}
              aria-label={`Clear ${metric.label}`}
            >
              Clear
            </Button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={clipId} className="sr-only">
              {metric.label} clip link
            </Label>
            <Input
              id={clipId}
              type="url"
              inputMode="url"
              placeholder="Clip link (https://...)"
              disabled={disabled}
              aria-invalid={!!error?.mediaUrl || undefined}
              aria-describedby={describedBy}
              {...form.register(`rows.${metric.code}.mediaUrl`)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={notesId} className="sr-only">
              {metric.label} notes
            </Label>
            <Input
              id={notesId}
              type="text"
              placeholder="Notes (hard faults, left/right)"
              maxLength={MQI_NOTES_MAX}
              disabled={disabled}
              aria-invalid={!!error?.notes || undefined}
              aria-describedby={describedBy}
              {...form.register(`rows.${metric.code}.notes`)}
            />
          </div>
        </div>
        {errorMessage && (
          <p id={errorId} role="alert" className="text-xs text-red-600">
            {errorMessage}
          </p>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Movement Quality: {athleteName}</DialogTitle>
          <DialogDescription>
            Score each pattern from the video review.{" "}
            {MQI_RUBRIC.map((r) => `${r.score} ${r.label}`).join(", ")}.
          </DialogDescription>
        </DialogHeader>

        {disabled && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            <Lock className="h-4 w-4" />
            This event is frozen. Scores cannot be modified.
          </div>
        )}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div
            data-testid="mqi-total"
            className="sticky top-0 z-10 flex items-center justify-between rounded-lg bg-muted p-3 shadow-sm"
            aria-live="polite"
          >
            <span className="text-sm font-medium">MQI total</span>
            {mqiTotal === null ? (
              <Badge variant="outline" className="text-yellow-700">
                <AlertCircle className="mr-1 h-3 w-3" />
                Incomplete ({patternsScored} of 8 scored)
              </Badge>
            ) : (
              <span className="text-lg font-bold">
                {mqiTotal} <span className="text-sm font-normal text-muted-foreground">/ 24</span>
              </span>
            )}
          </div>

          <section aria-label="Movement patterns" className="space-y-2">
            <h3 className="text-sm font-semibold">Patterns</h3>
            {MQI_PATTERNS.map(renderRow)}
          </section>

          {showTransitions && (
            <section aria-label="Transitions (optional)" className="space-y-2">
              <h3 className="text-sm font-semibold">Transitions (optional)</h3>
              {transitionsScored > 0 && (
                <div
                  data-testid="mqi-transition-total"
                  className="flex items-center justify-between rounded-lg bg-muted p-3"
                  aria-live="polite"
                >
                  <span className="text-sm font-medium">Transition total</span>
                  {transitionTotal === null ? (
                    <Badge variant="outline" className="text-yellow-700">
                      Incomplete ({transitionsScored} of 4 scored)
                    </Badge>
                  ) : (
                    <span className="text-lg font-bold">
                      {transitionTotal}{" "}
                      <span className="text-sm font-normal text-muted-foreground">/ 12</span>
                    </span>
                  )}
                </div>
              )}
              {MQI_TRANSITIONS.map(renderRow)}
            </section>
          )}

          <DialogFooter className="sticky bottom-0 flex-row justify-end gap-2 bg-background pt-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={disabled || isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save scores
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
