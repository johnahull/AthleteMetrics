/**
 * EvalReportDialog - the coach's selection screen for one athlete's eval report (AM-FEAT-019 P5).
 * Loads the defaults, lets the coach choose metrics and sections, previews without saving, then generates:
 * the report is saved, the PDF downloads, and a share link can be created on request (never automatically).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Download, Loader2, Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EvalReportBody } from "@/components/reports/EvalReportView";
import { ShareReportDialog } from "@/components/reports/ShareReportDialog";
import { useToast } from "@/hooks/use-toast";
import {
  apiErrorMessage,
  downloadEvalReportPdf,
  saveBlobAs,
  useEvalReportDefaults,
  useEvalReportModelQuery,
  useEvalReportSettings,
  useGenerateEvalReport,
  usePreviewEvalReport,
  usePutEvalReportSettings,
  type EvalMetricGroup,
  type EvalOfferedMetric,
  type EvalPreset,
} from "@/hooks/use-eval-report";
import {
  COLLEGE_GAUGE_MIN_AGE,
  PRESET_OPTIONS,
  applyPresetSwitch,
  autoCollegeGauge,
  buildInitialValues,
  computedMetricKeys,
  evalFormSchema,
  metricId,
  offeredList,
  presetValues,
  toOrgSelection,
  toRequest,
  type EvalFormValues,
  type PresetField,
} from "@/lib/eval-report-form";
import { COACH_NOTE_MAX_LENGTH, type EvalReportRequest } from "@shared/eval-report-config";
import type { EvalReportModelView, Report } from "@/types/report-types";

interface EvalReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  organizationId: string;
  athleteId: string;
  athleteName: string;
}

const GROUP_LABELS: Record<EvalMetricGroup, string> = {
  speed: "Speed",
  power: "Power",
  change_of_direction: "Change of direction",
  movement: "Movement",
  other: "Other",
};

const LOAD_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "heavy", label: "Heavy" },
  { value: "none", label: "Not set" },
] as const;

interface Suggestions {
  strengths: string[];
  developmentAreas: string[];
  limiter: string | null;
}

interface SavedResult {
  report: Report;
  model: EvalReportModelView;
  /** Filename of the downloaded PDF; null if the download failed */
  filename: string | null;
}

export function EvalReportDialog({ open, onOpenChange, eventId, organizationId, athleteId, athleteName }: EvalReportDialogProps) {
  const { toast } = useToast();
  const defaultsQuery = useEvalReportDefaults(eventId, athleteId, open);
  const settingsQuery = useEvalReportSettings(organizationId, open);
  const defaults = defaultsQuery.data;
  const settings = settingsQuery.data;
  const offered = useMemo(() => (defaults ? offeredList(defaults) : []), [defaults]);

  // One read-only preview of every offered metric tells us the athlete's age, where a college standard exists
  // and whether an earlier evaluation exists. A failure only means those facts stay unknown.
  const probeBody = useMemo(
    () => ({ selection: { metricKeys: offered.map(metricId), sections: { retestTrend: true } } }),
    [offered]
  );
  const [result, setResult] = useState<SavedResult | null>(null);
  // No more previews once the report is saved: the success screen needs none of them
  const probeQuery = useEvalReportModelQuery(eventId, athleteId, "probe", probeBody, open && !result && offered.length > 0);

  const [hydrated, setHydrated] = useState(false);
  const [suggestBody, setSuggestBody] = useState<EvalReportRequest | null>(null);
  const [suggested, setSuggested] = useState<Suggestions | null>(null);
  const [previewModel, setPreviewModel] = useState<EvalReportModelView | null>(null);
  const [status, setStatus] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const touched = useRef(new Set<PresetField>());
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);

  const form = useForm<EvalFormValues>({
    resolver: zodResolver(evalFormSchema),
    defaultValues: {
      preset: "high_school",
      metricKeys: [],
      collegeGauge: null,
      metricCollegeGauge: {},
      freshAndHealthy: true,
      coachNoteOn: true,
      strengthsOn: true,
      retestTrend: true,
      radar: false,
      load: "none",
      coachNote: "",
      strengths: null,
      developmentAreas: null,
      limiter: null,
    },
  });
  const values = form.watch();

  const age = probeQuery.data?.athlete.age ?? null;
  const hasPrior = probeQuery.data ? probeQuery.data.metrics.some((m) => m.trend !== null) : true;
  const ctx = useMemo(() => ({ offered, hasPrior }), [offered, hasPrior]);
  const collegeAvailable = useMemo(
    () => new Set((probeQuery.data?.metrics ?? []).filter((m) => m.collegeStandard).map((m) => m.key ?? m.code)),
    [probeQuery.data]
  );

  const preview = usePreviewEvalReport(eventId, athleteId);
  const generate = useGenerateEvalReport(eventId, athleteId);
  const putSettings = usePutEvalReportSettings(organizationId);
  const suggestQuery = useEvalReportModelQuery(eventId, athleteId, "suggest", suggestBody ?? {}, open && !result && !!suggestBody);
  const busy = preview.isPending || generate.isPending || putSettings.isPending;

  // Fill the form once, when everything it depends on has settled
  const settled =
    !!defaults &&
    (settingsQuery.isSuccess || settingsQuery.isError) &&
    (offered.length === 0 || probeQuery.isSuccess || probeQuery.isError);
  useEffect(() => {
    if (!settled || hydrated || !defaults) return;
    const initial = buildInitialValues({ defaults, settings, age, fallbackPreset: probeQuery.data?.selection?.preset });
    form.reset(initial);
    if (defaults.source === "saved") {
      (["metricKeys", "collegeGauge", "freshAndHealthy", "retestTrend", "coachNoteOn", "strengthsOn"] as PresetField[]).forEach((f) =>
        touched.current.add(f)
      );
    }
    const built = toRequest(initial, ctx);
    if (built.ok) setSuggestBody(built.body);
    setHydrated(true);
  }, [settled, hydrated, defaults, settings, age, form, ctx, probeQuery.data]);

  useEffect(() => {
    if (suggestQuery.data) {
      setSuggested({
        strengths: suggestQuery.data.strengths ?? [],
        developmentAreas: suggestQuery.data.developmentAreas ?? [],
        limiter: suggestQuery.data.limiter ?? null,
      });
    }
  }, [suggestQuery.data]);

  useEffect(() => {
    if (result) successHeading.current?.focus();
  }, [result]);

  // react-hook-form cannot relate a generic field name to its value type; this is the only cast
  const writeField = (name: keyof EvalFormValues, value: unknown, shouldValidate = false) =>
    form.setValue(name, value as never, { shouldDirty: true, shouldValidate });

  /** A field the coach changed: preset switches leave it alone from now on */
  const setField = (name: PresetField, value: EvalFormValues[PresetField]) => {
    touched.current.add(name);
    writeField(name, value, name === "metricKeys");
  };

  const selected = new Set(values.metricKeys);
  const effectiveCollege = values.collegeGauge ?? autoCollegeGauge(values.preset, age);
  const youngAthlete = age !== null && age < COLLEGE_GAUGE_MIN_AGE;
  const rankable = offered.filter((m) => m.key && m.key !== "MQI" && selected.has(metricId(m)));
  const orderIds = offered.map(metricId);

  const changePreset = (value: string) => {
    if (!defaults) return;
    const preset = value as EvalPreset;
    const current = form.getValues();
    const next = applyPresetSwitch(
      current,
      touched.current,
      { preset, ...presetValues(preset, settings, age, offered, computedMetricKeys(defaults)) },
      age
    );
    (Object.keys(next) as (keyof EvalFormValues)[]).forEach((field) => {
      if (next[field] !== current[field]) writeField(field, next[field]);
    });
  };

  const toggleMetric = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setField("metricKeys", orderIds.filter((x) => next.has(x)));
    if (!checked) {
      // An override can only name metrics that are in the report
      if (values.strengths) form.setValue("strengths", values.strengths.filter((x) => x !== id));
      if (values.developmentAreas) form.setValue("developmentAreas", values.developmentAreas.filter((x) => x !== id));
      if (values.limiter === id) form.setValue("limiter", "");
    }
  };

  const currentStrengths = values.strengths ?? suggested?.strengths ?? [];
  const currentDevelopment = values.developmentAreas ?? suggested?.developmentAreas ?? [];
  const currentLimiter = values.limiter ?? suggested?.limiter ?? "";
  const inOrder = (list: string[]) => rankable.map(metricId).filter((id) => list.includes(id));

  const toggleStrength = (id: string, checked: boolean) => {
    const next = checked ? [...currentStrengths, id] : currentStrengths.filter((x) => x !== id);
    form.setValue("strengths", inOrder(next), { shouldDirty: true });
    // A metric is a strength or an area to develop, not both
    if (checked && currentDevelopment.includes(id)) {
      form.setValue("developmentAreas", inOrder(currentDevelopment.filter((x) => x !== id)), { shouldDirty: true });
    }
  };
  const toggleDevelopment = (id: string, checked: boolean) => {
    const next = checked ? [...currentDevelopment, id] : currentDevelopment.filter((x) => x !== id);
    form.setValue("developmentAreas", inOrder(next), { shouldDirty: true });
    if (checked && currentStrengths.includes(id)) {
      form.setValue("strengths", inOrder(currentStrengths.filter((x) => x !== id)), { shouldDirty: true });
    }
  };

  /** Say why the form did not submit, in the live region as well as next to the field */
  const onInvalid = (errors: FieldErrors<EvalFormValues>) => {
    const first = Object.values(errors).find((e) => e?.message);
    setStatus(first?.message ? `Not sent: ${first.message}` : "Not sent: check the selection.");
  };

  // Set synchronously, before the pending state renders, so a fast double click or a held Enter sends one request
  const inFlight = useRef(false);
  const guarded =
    (run: (formValues: EvalFormValues) => Promise<void>) =>
    async (event?: React.BaseSyntheticEvent) => {
      event?.preventDefault?.();
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await form.handleSubmit(run, onInvalid)();
      } finally {
        inFlight.current = false;
      }
    };

  const onPreview = guarded(async (formValues) => {
    const built = toRequest(formValues, ctx);
    if (!built.ok) {
      toast({ variant: "destructive", title: "Check the selection", description: built.message });
      return;
    }
    setStatus("Building preview...");
    try {
      const model = await preview.mutateAsync(built.body);
      setPreviewModel(model);
      setStatus("Preview updated. It is not saved.");
      // Keep the suggestions in step with the metrics now chosen, for fields the coach has not edited
      if (formValues.strengthsOn) {
        setSuggested((prev) => ({
          strengths: formValues.strengths === null ? (model.strengths ?? []) : (prev?.strengths ?? []),
          developmentAreas: formValues.developmentAreas === null ? (model.developmentAreas ?? []) : (prev?.developmentAreas ?? []),
          limiter: formValues.limiter === null ? (model.limiter ?? null) : (prev?.limiter ?? null),
        }));
      }
      requestAnimationFrame(() => {
        previewHeading.current?.focus();
        previewHeading.current?.scrollIntoView?.({ block: "start" });
      });
    } catch (error) {
      setStatus("The preview could not be built.");
      toast({ variant: "destructive", title: "Preview failed", description: apiErrorMessage(error, "Failed to build the preview.") });
    }
  });

  const downloadPdf = async (report: Report) => {
    try {
      const { blob, filename } = await downloadEvalReportPdf(report.id);
      saveBlobAs(blob, filename);
      setResult((prev) => (prev ? { ...prev, filename } : prev));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "PDF download failed",
        description: `${apiErrorMessage(error, "Failed to download the PDF.")} The report is saved; you can download it again.`,
      });
    }
  };

  const onGenerate = guarded(async (formValues) => {
    const built = toRequest(formValues, ctx);
    if (!built.ok) {
      toast({ variant: "destructive", title: "Check the selection", description: built.message });
      return;
    }
    let saved: { report: Report; model: EvalReportModelView };
    try {
      saved = await generate.mutateAsync(built.body);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not generate the report", description: apiErrorMessage(error, "Failed to generate the report.") });
      return;
    }
    setResult({ report: saved.report, model: saved.model, filename: null });
    // The org remembers what was used; failing to remember must not hide the saved report
    putSettings.mutateAsync({ lastSelection: toOrgSelection(formValues, ctx, age) }).catch(() => {
      toast({ title: "Selection not remembered", description: "The report is saved, but your choices could not be stored for next time." });
    });
    await downloadPdf(saved.report);
  });

  const onSaveDefault = async () => {
    const formValues = form.getValues();
    if (formValues.metricKeys.length === 0) {
      form.setError("metricKeys", { message: "Choose at least one metric" });
      return;
    }
    // Merge into the settings as they are now: a stale copy would overwrite presets saved since the dialog opened
    const fresh = await settingsQuery.refetch();
    if (fresh.isError || !fresh.data) {
      toast({ variant: "destructive", title: "Could not save the default", description: "Your saved defaults could not be read, so nothing was changed. Try again." });
      return;
    }
    const { preset, ...override } = toOrgSelection(formValues, ctx, age);
    try {
      await putSettings.mutateAsync({ presets: { ...fresh.data.presets, [preset]: override } });
      const label = PRESET_OPTIONS.find((p) => p.value === preset)?.label ?? preset;
      toast({ title: "Default saved", description: `These choices are now the starting point for ${label} reports.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save the default", description: apiErrorMessage(error, "Failed to save the default.") });
    }
  };

  const errors = form.formState.errors;
  const noteLength = values.coachNote.length;
  // Heads-up only: this uses the age frozen at the event date, not the athlete's age today, so it is deliberately
  // conservative. The API decides what is allowed based on age today.
  const under13 = result ? result.model.athlete.age === null || result.model.athlete.age < 13 : false;

  const checklist = (list: EvalOfferedMetric[]) =>
    list.map((m) => {
      const id = metricId(m);
      const isSelected = selected.has(id);
      const hasCollege = isSelected && collegeAvailable.has(id);
      return (
        <div key={id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Checkbox id={`eval-metric-${id}`} checked={isSelected} onCheckedChange={(c) => toggleMetric(id, c === true)} />
            <Label htmlFor={`eval-metric-${id}`} className="cursor-pointer text-sm font-normal">
              {m.label}
            </Label>
          </div>
          {hasCollege && (
            <div className="flex shrink-0 items-center gap-2">
              <Checkbox
                id={`eval-college-${id}`}
                aria-label={`College standard for ${m.label}`}
                checked={values.metricCollegeGauge[id] ?? effectiveCollege}
                onCheckedChange={(c) => form.setValue("metricCollegeGauge", { ...values.metricCollegeGauge, [id]: c === true }, { shouldDirty: true })}
              />
              <Label htmlFor={`eval-college-${id}`} className="cursor-pointer text-xs font-normal text-muted-foreground" aria-hidden="true">
                College
              </Label>
            </div>
          )}
        </div>
      );
    });

  const availableByGroup = (Object.keys(GROUP_LABELS) as EvalMetricGroup[])
    .map((group) => ({ group, items: (defaults?.offered.available ?? []).filter((m) => m.group === group) }))
    .filter((g) => g.items.length > 0);

  const sectionSwitch = (
    id: string,
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    options: { disabled?: boolean; hint?: string } = {}
  ) => (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {options.hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {options.hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={options.disabled}
        aria-describedby={options.hint ? `${id}-hint` : undefined}
        onCheckedChange={onChange}
      />
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Eval report for {athleteName}</DialogTitle>
            <DialogDescription>
              {result ? "Your report is ready." : "Choose what goes in the report. Nothing is saved until you generate it."}
            </DialogDescription>
          </DialogHeader>

          <div role="status" aria-live="polite" className="sr-only">
            {status}
          </div>

          {result ? (
            <div className="space-y-4" data-testid="eval-report-saved">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-600" aria-hidden="true" />
                <h2 ref={successHeading} tabIndex={-1} className="text-xl font-semibold outline-none">
                  Report saved
                </h2>
              </div>
              <p className="text-sm">
                {result.filename ? `The PDF was downloaded as ${result.filename}.` : "The PDF did not download. Your report is saved, so you can try again."}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" asChild>
                  <Link href={`/reports/${result.report.id}`}>Open saved report</Link>
                </Button>
                <Button variant="outline" onClick={() => downloadPdf(result.report)}>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  {result.filename ? "Download PDF again" : "Download PDF"}
                </Button>
              </div>

              {under13 && (
                <Alert>
                  <AlertTitle>Send this PDF to a parent</AlertTitle>
                  <AlertDescription>
                    Athletes under 13, or with no date of birth on file, are never sent reports through their own account. Share this PDF with a parent yourself.
                  </AlertDescription>
                </Alert>
              )}

              <section className="space-y-2 rounded-md border p-4" aria-labelledby="eval-share-heading">
                <h3 id="eval-share-heading" className="font-medium">
                  Share link (optional)
                </h3>
                <p className="text-sm text-muted-foreground">
                  No link has been created. Anyone with the link can view this report until it expires or you revoke it. If the athlete is a minor, the link only opens for a signed-in parent linked to them, so send the PDF instead.
                </p>
                <Button variant="outline" onClick={() => setShareOpen(true)}>
                  <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Create share link
                </Button>
              </section>

              <div className="flex justify-end">
                <Button onClick={() => onOpenChange(false)}>Done</Button>
              </div>
            </div>
          ) : !hydrated ? (
            defaultsQuery.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Could not load the report options</AlertTitle>
                <AlertDescription>
                  {/^404/.test(defaultsQuery.error?.message ?? "")
                    ? "There is no eval report for this athlete in this event. The athlete needs to be active and to have verified measurements here."
                    : apiErrorMessage(defaultsQuery.error, "Try again in a moment.")}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3" data-testid="eval-dialog-loading" aria-busy="true">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )
          ) : (
            <form onSubmit={onGenerate} noValidate className="space-y-6">
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Report style</legend>
                {defaults?.source === "saved" && (
                  <p className="text-xs text-muted-foreground">Starting from the last saved report for this athlete in this event.</p>
                )}
                <RadioGroup
                  value={values.preset}
                  onValueChange={changePreset}
                  aria-label="Report style"
                  className="grid-cols-1 gap-2 sm:grid-cols-3"
                >
                  {PRESET_OPTIONS.map((p) => (
                    <div key={p.value} className="rounded-md border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value={p.value} id={`eval-preset-${p.value}`} />
                        <Label htmlFor={`eval-preset-${p.value}`} className="cursor-pointer">
                          {p.label}
                        </Label>
                      </div>
                      <p className="mt-1 pl-6 text-xs text-muted-foreground">{p.hint}</p>
                    </div>
                  ))}
                </RadioGroup>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Headline metrics</legend>
                <div className="space-y-2">{checklist(defaults?.offered.headline ?? [])}</div>
              </fieldset>

              {availableByGroup.length > 0 && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold">Also measured (not included unless you check them)</legend>
                  {availableByGroup.map(({ group, items }) => (
                    <div key={group} className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">{GROUP_LABELS[group]}</p>
                      {checklist(items)}
                    </div>
                  ))}
                </fieldset>
              )}
              {errors.metricKeys && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.metricKeys.message}
                </p>
              )}

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Sections</legend>
                {sectionSwitch("eval-college", "Show college standard gauge", effectiveCollege, (c) => setField("collegeGauge", c), {
                  hint: youngAthlete
                    ? `Hidden by default for athletes under ${COLLEGE_GAUGE_MIN_AGE}. Turn it on if you want it.`
                    : "A second gauge against the college average, next to the age-group comparison.",
                })}
                {sectionSwitch("eval-fresh", "Fresh & Healthy", values.freshAndHealthy, (c) => setField("freshAndHealthy", c))}
                {sectionSwitch("eval-note-on", "What we saw note", values.coachNoteOn, (c) => setField("coachNoteOn", c), {
                  hint: values.preset === "middle_school" ? "For middle school this note appears first in the report." : undefined,
                })}
                {sectionSwitch("eval-strengths-on", "Strengths and areas to develop", values.strengthsOn, (c) => setField("strengthsOn", c))}
                {sectionSwitch("eval-retest", "Retest trend", values.retestTrend && hasPrior, (c) => setField("retestTrend", c), {
                  disabled: !hasPrior,
                  hint: hasPrior ? "Shows change since the last evaluation." : "There is no comparable earlier evaluation for this athlete.",
                })}
                {sectionSwitch("eval-radar", "Radar chart", values.radar, (c) => form.setValue("radar", c, { shouldDirty: true }))}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Load this week</legend>
                <RadioGroup
                  value={values.load}
                  onValueChange={(v) => form.setValue("load", v as EvalFormValues["load"], { shouldDirty: true })}
                  aria-label="Load this week"
                  className="grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  {LOAD_OPTIONS.map((o) => (
                    <div key={o.value} className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <RadioGroupItem value={o.value} id={`eval-load-${o.value}`} />
                      <Label htmlFor={`eval-load-${o.value}`} className="cursor-pointer font-normal">
                        {o.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="eval-coach-note" className="text-sm font-semibold">
                  What we saw
                </Label>
                <Textarea
                  id="eval-coach-note"
                  rows={4}
                  aria-describedby="eval-coach-note-count"
                  aria-invalid={!!errors.coachNote}
                  {...form.register("coachNote")}
                />
                <div className="flex justify-between gap-2 text-xs">
                  <span role={errors.coachNote ? "alert" : undefined} className="text-destructive">
                    {errors.coachNote?.message}
                  </span>
                  <span id="eval-coach-note-count" className={noteLength > COACH_NOTE_MAX_LENGTH ? "text-destructive" : "text-muted-foreground"}>
                    {noteLength} / {COACH_NOTE_MAX_LENGTH}
                  </span>
                </div>
              </div>

              {values.strengthsOn && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Suggested from how each metric compares with the age group. Change any of them before you generate.
                  </p>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-semibold">Strengths</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {rankable.map((m) => (
                        <div key={metricId(m)} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            id={`eval-strength-${metricId(m)}`}
                            aria-label={`Strength: ${m.label}`}
                            checked={currentStrengths.includes(metricId(m))}
                            onCheckedChange={(c) => toggleStrength(metricId(m), c === true)}
                          />
                          <Label htmlFor={`eval-strength-${metricId(m)}`} className="cursor-pointer font-normal" aria-hidden="true">
                            {m.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-semibold">Areas to develop</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {rankable.map((m) => (
                        <div key={metricId(m)} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            id={`eval-dev-${metricId(m)}`}
                            aria-label={`Area to develop: ${m.label}`}
                            checked={currentDevelopment.includes(metricId(m))}
                            onCheckedChange={(c) => toggleDevelopment(metricId(m), c === true)}
                          />
                          <Label htmlFor={`eval-dev-${metricId(m)}`} className="cursor-pointer font-normal" aria-hidden="true">
                            {m.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </fieldset>
                  <div className="space-y-2">
                    <Label htmlFor="eval-limiter" className="text-sm font-semibold">
                      Biggest opportunity
                    </Label>
                    <Select
                      value={currentLimiter === "" ? "none" : currentLimiter}
                      onValueChange={(v) => form.setValue("limiter", v === "none" ? "" : v, { shouldDirty: true })}
                    >
                      <SelectTrigger id="eval-limiter" className="w-full sm:w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {rankable.map((m) => (
                          <SelectItem key={metricId(m)} value={metricId(m)}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Button type="button" variant="outline" size="sm" onClick={onSaveDefault} disabled={busy || !settingsQuery.isSuccess}>
                  Save as default for this preset
                </Button>
                <p className="text-xs text-muted-foreground">
                  Your metric and section choices become the starting point for {PRESET_OPTIONS.find((p) => p.value === values.preset)?.label} reports
                  in your organization. Generating a report also remembers your last selection.
                </p>
              </div>

              {previewModel && (
                <section aria-labelledby="eval-preview-heading" className="space-y-3 rounded-md border bg-muted/30 p-3 sm:p-4">
                  <h3 id="eval-preview-heading" ref={previewHeading} tabIndex={-1} className="font-semibold outline-none">
                    Preview (not saved)
                  </h3>
                  <EvalReportBody model={previewModel} />
                </section>
              )}

              <div className="sticky -bottom-4 -mx-4 -mb-4 flex gap-2 border-t bg-background p-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:justify-end sm:p-6">
                <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={onPreview} disabled={busy}>
                  {preview.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Preview
                </Button>
                <Button type="submit" className="flex-1 sm:flex-none" disabled={busy}>
                  {generate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {generate.isPending ? "Generating..." : "Generate report"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {/* Mounted only on request so that no share data is loaded or created by opening this screen */}
      {shareOpen && result && <ShareReportDialog reportId={result.report.id} open={shareOpen} onClose={() => setShareOpen(false)} />}
    </>
  );
}
