import { useState, useEffect, useCallback, type MutableRefObject } from "react";
import { useForm, Controller } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { ChevronDown, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useUpdateCoachNotes } from "@/lib/reports-api";
import { coachNotesSchema, type CoachNotes } from "@shared/coach-notes";

export interface MetricOption {
  code: string;
  label: string;
}

/** Lets the parent card save a dirty form before Generate. Resolves false when saving failed. */
export type FlushNotes = () => Promise<boolean>;

interface Props {
  reportId: string;
  coachNotes?: unknown;
  metricOptions?: MetricOption[];
  flushRef: MutableRefObject<FlushNotes | null>;
}

// Inputs are strings (empty = unset); toNotes converts to the shared schema shape.
interface FormValues {
  goals: string;
  seasonPhase: string;
  trainingAgeYears: string;
  maturation: string;
  restrictionArea: string;
  restrictionStatus: string;
  restrictionPtCleared: boolean;
  testDayFlags: string[];
  limiterOverride: string;
  sessionsPerWeek: string;
  nextRetestDate: string;
  whatISaw: string;
}

const FLAGS: [string, string][] = [
  ["poor_wellness", "Poor wellness"],
  ["surface", "Surface"],
  ["weather", "Weather"],
  ["protocol_deviation", "Protocol deviation"],
];

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function fromNotes(raw: unknown): FormValues {
  const n = (coachNotesSchema.safeParse(raw).data ?? {}) as CoachNotes;
  return {
    goals: n.goals ?? "",
    seasonPhase: n.seasonPhase ?? "",
    trainingAgeYears: n.trainingAgeYears?.toString() ?? "",
    maturation: n.maturation ?? "",
    restrictionArea: n.restriction?.area ?? "",
    restrictionStatus: n.restriction?.status ?? "",
    restrictionPtCleared: n.restriction?.ptCleared ?? false,
    testDayFlags: n.testDayFlags ?? [],
    limiterOverride: n.limiterOverride ?? "",
    sessionsPerWeek: n.sessionsPerWeek?.toString() ?? "",
    nextRetestDate: n.nextRetestDate ?? "",
    whatISaw: n.whatISaw ?? "",
  };
}

function toNotes(v: FormValues): CoachNotes {
  const n: Record<string, unknown> = {};
  if (v.goals.trim()) n.goals = v.goals;
  if (v.seasonPhase) n.seasonPhase = v.seasonPhase;
  if (v.trainingAgeYears !== "") n.trainingAgeYears = Number(v.trainingAgeYears);
  if (v.maturation) n.maturation = v.maturation;
  if (v.restrictionArea.trim() || v.restrictionStatus.trim() || v.restrictionPtCleared) {
    n.restriction = { area: v.restrictionArea, status: v.restrictionStatus, ptCleared: v.restrictionPtCleared };
  }
  if (v.testDayFlags.length) n.testDayFlags = v.testDayFlags;
  if (v.limiterOverride) n.limiterOverride = v.limiterOverride;
  if (v.sessionsPerWeek !== "") n.sessionsPerWeek = Number(v.sessionsPerWeek);
  if (v.nextRetestDate) n.nextRetestDate = v.nextRetestDate;
  if (v.whatISaw.trim()) n.whatISaw = v.whatISaw;
  return n as CoachNotes;
}

const ERROR_FIELD: Record<string, keyof FormValues> = { area: "restrictionArea", status: "restrictionStatus", ptCleared: "restrictionPtCleared" };

// Validates the converted payload against the shared schema, mapping issues back to form fields.
const resolver: Resolver<FormValues> = async (values) => {
  const result = coachNotesSchema.safeParse(toNotes(values));
  if (result.success) return { values, errors: {} };
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error.issues) {
    const [head, sub] = issue.path;
    const field = head === "restriction" ? ERROR_FIELD[String(sub)] : String(head);
    if (field && !errors[field]) errors[field] = { type: issue.code, message: issue.message };
  }
  return { values: {}, errors };
};

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export function CoachNotesForm({ reportId, coachNotes, metricOptions = [], flushRef }: Props) {
  const { toast } = useToast();
  const mutation = useUpdateCoachNotes(reportId);
  const hasNotes = Object.keys(toNotes(fromNotes(coachNotes))).length > 0;
  const [open, setOpen] = useState(hasNotes);

  // defaultValues are read on mount only; the card remounts this form after generation, which is intentional.
  const {
    register,
    control,
    handleSubmit,
    reset,
    trigger,
    getValues,
    watch,
    formState: { isDirty, errors },
  } = useForm<FormValues>({ defaultValues: fromNotes(coachNotes), resolver });

  const save = useCallback(
    async (notes: CoachNotes): Promise<boolean> => {
      try {
        const res = await mutation.mutateAsync(notes);
        reset(fromNotes(res.coachNotes));
        toast({ title: "Success", description: Object.keys(notes).length ? "Coach notes saved" : "Coach notes cleared" });
        return true;
      } catch (error: any) {
        toast({ title: "Error", description: error.message || "Failed to save coach notes", variant: "destructive" });
        return false;
      }
    },
    [mutation, reset, toast],
  );

  const flush = useCallback(async () => {
    if (!isDirty) return true;
    if (!(await trigger())) {
      setOpen(true);
      return false;
    }
    return save(toNotes(getValues()));
  }, [isDirty, trigger, save, getValues]);

  useEffect(() => {
    flushRef.current = flush;
    return () => {
      flushRef.current = null;
    };
  }, [flush, flushRef]);

  const onSubmit = handleSubmit((v) => {
    void save(toNotes(v));
  });

  const goalsLen = watch("goals").length;
  const sawLen = watch("whatISaw").length;
  const limiter = watch("limiterOverride");
  const options =
    limiter && !metricOptions.some((m) => m.code === limiter) ? [...metricOptions, { code: limiter, label: limiter }] : metricOptions;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border text-left">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="w-full justify-between">
          Coach notes for the AI
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form onSubmit={onSubmit} className="space-y-4 p-4 pt-2" noValidate data-testid="coach-notes-form">
          <div className="space-y-1">
            <Label htmlFor="cn-goals">Goals</Label>
            <Textarea
              id="cn-goals"
              rows={3}
              placeholder="e.g. get ready for college soccer; make varsity; run a sub 5.0 40 yd dash"
              aria-invalid={!!errors.goals}
              aria-describedby="cn-goals-count cn-goals-err"
              {...register("goals")}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <FieldError id="cn-goals-err" message={errors.goals?.message} />
              <span id="cn-goals-count" className="ml-auto">{goalsLen} / 1000</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cn-season">Season phase</Label>
              <select id="cn-season" className={selectClass} {...register("seasonPhase")}>
                <option value="">Not set</option>
                <option value="off">Off-season</option>
                <option value="pre">Pre-season</option>
                <option value="in">In-season</option>
                <option value="post">Post-season</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cn-age">Training age (years)</Label>
              <Input id="cn-age" type="number" min={0} max={30} step="any" inputMode="decimal" aria-invalid={!!errors.trainingAgeYears} aria-describedby="cn-age-err" {...register("trainingAgeYears")} />
              <FieldError id="cn-age-err" message={errors.trainingAgeYears?.message} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cn-maturation">Maturation</Label>
              <select id="cn-maturation" className={selectClass} {...register("maturation")}>
                <option value="">Not set</option>
                <option value="pre">Pre-PHV</option>
                <option value="circa">Circa-PHV</option>
                <option value="post">Post-PHV</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cn-limiter">Coach's limiter call</Label>
              <select id="cn-limiter" className={selectClass} {...register("limiterOverride")}>
                <option value="">Let the AI decide</option>
                {options.map((m) => (
                  <option key={m.code} value={m.code}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cn-sessions">Sessions per week</Label>
              <Input id="cn-sessions" type="number" min={0} max={14} step={1} inputMode="numeric" aria-invalid={!!errors.sessionsPerWeek} aria-describedby="cn-sessions-err" {...register("sessionsPerWeek")} />
              <FieldError id="cn-sessions-err" message={errors.sessionsPerWeek?.message} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cn-retest">Next retest date</Label>
              <Input id="cn-retest" type="date" aria-invalid={!!errors.nextRetestDate} aria-describedby="cn-retest-err" {...register("nextRetestDate")} />
              <FieldError id="cn-retest-err" message={errors.nextRetestDate?.message} />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Restriction</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cn-r-area">Restriction area</Label>
                <Input id="cn-r-area" maxLength={200} aria-invalid={!!errors.restrictionArea} aria-describedby="cn-r-area-err" {...register("restrictionArea")} />
                <FieldError id="cn-r-area-err" message={errors.restrictionArea?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cn-r-status">Restriction status</Label>
                <Input id="cn-r-status" maxLength={200} aria-invalid={!!errors.restrictionStatus} aria-describedby="cn-r-status-err" {...register("restrictionStatus")} />
                <FieldError id="cn-r-status-err" message={errors.restrictionStatus?.message} />
              </div>
            </div>
            <Controller
              control={control}
              name="restrictionPtCleared"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox id="cn-r-pt" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                  <Label htmlFor="cn-r-pt">PT-cleared</Label>
                </div>
              )}
            />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Test-day flags</legend>
            <Controller
              control={control}
              name="testDayFlags"
              render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  {FLAGS.map(([value, label]) => (
                    <div key={value} className="flex items-center gap-2">
                      <Checkbox
                        id={`cn-flag-${value}`}
                        checked={field.value.includes(value)}
                        onCheckedChange={(c) =>
                          field.onChange(c === true ? [...field.value, value] : field.value.filter((f) => f !== value))
                        }
                      />
                      <Label htmlFor={`cn-flag-${value}`}>{label}</Label>
                    </div>
                  ))}
                </div>
              )}
            />
          </fieldset>

          <div className="space-y-1">
            <Label htmlFor="cn-saw">What I saw</Label>
            <Textarea id="cn-saw" rows={4} aria-invalid={!!errors.whatISaw} aria-describedby="cn-saw-count cn-saw-err" {...register("whatISaw")} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <FieldError id="cn-saw-err" message={errors.whatISaw?.message} />
              <span id="cn-saw-count" className="ml-auto">{sawLen} / 1500</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save notes
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={mutation.isPending} onClick={() => void save({})}>
              Clear
            </Button>
          </div>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
