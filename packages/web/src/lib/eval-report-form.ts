/**
 * Form model of the eval report selection dialog (AM-FEAT-019 P5): defaults, remembered-selection merge and the
 * request body. Kept free of React so the rules are easy to test.
 */
import { z } from "zod";
import {
  COACH_NOTE_MAX_LENGTH,
  evalPresetSchema,
  evalReportRequestSchema,
  type EvalReportRequest,
} from "@shared/eval-report-config";
import type {
  EvalDefaults,
  EvalOfferedMetric,
  EvalPreset,
  EvalReportSettings,
  OrgEvalSelection,
  OrgPresetOverride,
} from "@/hooks/use-eval-report";

/** The college gauge is hidden by default under this age; the coach can turn it on (spec Part 3) */
export const COLLEGE_GAUGE_MIN_AGE = 14;

export const PRESET_OPTIONS: { value: EvalPreset; label: string; hint: string }[] = [
  { value: "middle_school", label: "Middle school", hint: "Note first, no college gauge" },
  { value: "high_school", label: "High school", hint: "Age-group comparison" },
  { value: "senior", label: "Senior", hint: "College gauge on" },
];

/** What the preset does when the coach has not chosen (mirrors the server's presetDefaults + showCollegeGauge) */
export function autoCollegeGauge(preset: EvalPreset, age: number | null): boolean {
  if (age !== null && age < COLLEGE_GAUGE_MIN_AGE) return false;
  return preset === "senior";
}

export const evalFormSchema = z.object({
  preset: evalPresetSchema,
  metricKeys: z.array(z.string()).min(1, "Choose at least one metric"),
  /** null = follow the preset and the athlete's age */
  collegeGauge: z.boolean().nullable(),
  metricCollegeGauge: z.record(z.boolean()),
  freshAndHealthy: z.boolean(),
  coachNoteOn: z.boolean(),
  strengthsOn: z.boolean(),
  retestTrend: z.boolean(),
  radar: z.boolean(),
  load: z.enum(["light", "medium", "heavy", "none"]),
  coachNote: z.string().max(COACH_NOTE_MAX_LENGTH, `Keep the note to ${COACH_NOTE_MAX_LENGTH} characters or fewer`),
  /** null = not edited, the server suggests */
  strengths: z.array(z.string()).nullable(),
  developmentAreas: z.array(z.string()).nullable(),
  /** null = not edited; "" = the coach chose no limiter */
  limiter: z.string().nullable(),
});

export type EvalFormValues = z.infer<typeof evalFormSchema>;

/** Fields the coach can change; once changed, switching the preset leaves them alone */
export type PresetField = "metricKeys" | "collegeGauge" | "freshAndHealthy" | "retestTrend" | "coachNoteOn" | "strengthsOn";

/** The id a metric travels under in a request: its logical key, else its metric code */
export const metricId = (m: EvalOfferedMetric): string => m.key ?? m.code;

export function offeredList(defaults: EvalDefaults): EvalOfferedMetric[] {
  return [...defaults.offered.headline, ...defaults.offered.available];
}

/** Map a remembered key or code to an offered id; unknown metrics (no data for this athlete) drop out */
function toOfferedIds(saved: readonly string[], offered: readonly EvalOfferedMetric[]): string[] {
  const byName = new Map<string, string>();
  for (const m of offered) {
    byName.set(m.code, metricId(m));
    if (m.key) byName.set(m.key, metricId(m));
  }
  const ids = saved.map((s) => byName.get(s)).filter((id): id is string => !!id);
  return offered.map(metricId).filter((id) => ids.includes(id));
}

/** Org-remembered values that apply to this preset: the preset's saved defaults, then the last selection if it used the same preset */
function orgOverride(preset: EvalPreset, settings: EvalReportSettings | undefined): OrgPresetOverride {
  const last = settings?.lastSelection;
  const { preset: _preset, ...lastFields } = last && last.preset === preset ? last : ({} as OrgEvalSelection);
  return { ...(settings?.presets?.[preset] ?? {}), ...lastFields };
}

/** The remembered college gauge never forces the gauge on for an athlete under 14 */
function rememberedCollege(override: OrgPresetOverride, age: number | null): boolean | null {
  if (override.collegeGauge === undefined) return null;
  if (age !== null && age < COLLEGE_GAUGE_MIN_AGE) return null;
  return override.collegeGauge;
}

/**
 * Fields a preset sets. Precedence (lowest first): built-in preset defaults, the org's saved preset, the org's
 * last selection (same preset only). A saved eval for this event and athlete is applied on top by buildInitialValues.
 */
export function presetValues(
  preset: EvalPreset,
  settings: EvalReportSettings | undefined,
  age: number | null,
  offered: readonly EvalOfferedMetric[],
  computedKeys: readonly string[]
): Pick<EvalFormValues, "metricKeys" | "collegeGauge" | "freshAndHealthy" | "retestTrend" | "coachNoteOn" | "strengthsOn"> {
  const override = orgOverride(preset, settings);
  const remembered = override.metricKeys ? toOfferedIds(override.metricKeys, offered) : [];
  return {
    metricKeys: remembered.length > 0 ? remembered : toOfferedIds(computedKeys, offered),
    collegeGauge: rememberedCollege(override, age),
    freshAndHealthy: override.freshAndHealthy ?? true,
    retestTrend: override.retestTrend ?? true,
    coachNoteOn: override.coachNote ?? true,
    strengthsOn: override.strengths ?? true,
  };
}

/** The metrics the server computed for the defaults; the checked offered metrics when it sent none (a saved eval with no selection) */
export function computedMetricKeys(defaults: EvalDefaults): string[] {
  const keys = defaults.selection?.metricKeys;
  return keys && keys.length > 0 ? keys : offeredList(defaults).filter((m) => m.checked).map(metricId);
}

export function buildInitialValues(args: {
  defaults: EvalDefaults;
  settings: EvalReportSettings | undefined;
  age: number | null;
  /** The preset the server computes for this athlete, for a saved eval that stored none */
  fallbackPreset?: EvalPreset;
}): EvalFormValues {
  const { defaults, settings, age } = args;
  const offered = offeredList(defaults);
  const preset: EvalPreset = defaults.selection?.preset ?? args.fallbackPreset ?? "high_school";
  const computedKeys = computedMetricKeys(defaults);
  const base = presetValues(preset, settings, age, offered, computedKeys);
  const common = {
    preset,
    metricCollegeGauge: {} as Record<string, boolean>,
    radar: false,
    load: "none" as const,
    coachNote: "",
    strengths: null,
    developmentAreas: null,
    limiter: null,
  };

  if (defaults.source === "saved") {
    // The coach's last saved eval for this athlete in this event wins over everything else
    const sel = defaults.selection ?? {};
    const saved = sel.metricKeys ? toOfferedIds(sel.metricKeys, offered) : [];
    return {
      ...common,
      metricKeys: saved.length > 0 ? saved : toOfferedIds(computedKeys, offered),
      collegeGauge: sel.collegeGauge ?? null,
      metricCollegeGauge: sel.metricCollegeGauge ?? {},
      freshAndHealthy: sel.sections?.freshAndHealthy ?? true,
      retestTrend: sel.sections?.retestTrend ?? true,
      coachNoteOn: sel.sections?.coachNote ?? true,
      strengthsOn: sel.sections?.strengths ?? true,
      radar: sel.sections?.radar ?? false,
      load: defaults.load ?? "none",
      coachNote: defaults.coachNote ?? "",
    };
  }
  return { ...common, ...base, load: defaults.load ?? "none", coachNote: defaults.coachNote ?? "" };
}

export interface RequestContext {
  offered: readonly EvalOfferedMetric[];
  /** False when the event has no earlier evaluation to compare with */
  hasPrior: boolean;
}

export type BuiltRequest = { ok: true; body: EvalReportRequest } | { ok: false; message: string };

/** Build the request body and validate it with the shared schema the API uses */
export function toRequest(values: EvalFormValues, ctx: RequestContext): BuiltRequest {
  const selected = new Set(values.metricKeys);
  const ids = ctx.offered.map(metricId).filter((id) => selected.has(id));
  // Overrides may only name selected metrics that have a logical key (the server rejects others)
  const rankable = new Set(ctx.offered.filter((m) => m.key && m.key !== "MQI" && selected.has(metricId(m))).map(metricId));
  const keepRankable = (list: string[]) => list.filter((id) => rankable.has(id));
  const perMetric = Object.fromEntries(Object.entries(values.metricCollegeGauge).filter(([id]) => selected.has(id)));

  const candidate = {
    selection: {
      preset: values.preset,
      metricKeys: ids,
      ...(values.collegeGauge === null ? {} : { collegeGauge: values.collegeGauge }),
      ...(Object.keys(perMetric).length > 0 ? { metricCollegeGauge: perMetric } : {}),
      sections: {
        headline: true,
        freshAndHealthy: values.freshAndHealthy,
        coachNote: values.coachNoteOn,
        strengths: values.strengthsOn,
        retestTrend: values.retestTrend && ctx.hasPrior,
        radar: values.radar,
      },
    },
    load: values.load === "none" ? null : values.load,
    coachNote: values.coachNote,
    ...(values.strengths !== null ? { strengthsOverride: keepRankable(values.strengths) } : {}),
    ...(values.developmentAreas !== null ? { developmentAreasOverride: keepRankable(values.developmentAreas) } : {}),
    ...(values.limiter !== null ? { limiterOverride: values.limiter === "" || !rankable.has(values.limiter) ? null : values.limiter } : {}),
  };
  const parsed = evalReportRequestSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, message: parsed.error.errors[0]?.message ?? "Check the selection" };
  return { ok: true, body: parsed.data };
}

/** The org-remembered shape of what was used (eval-report-settings.lastSelection) */
export function toOrgSelection(values: EvalFormValues, ctx: RequestContext, _age: number | null): OrgEvalSelection {
  const built = toRequest(values, ctx);
  const selected = new Set(values.metricKeys);
  return {
    preset: values.preset,
    metricKeys: built.ok ? (built.body.selection?.metricKeys ?? []) : ctx.offered.map(metricId).filter((id) => selected.has(id)),
    // An untouched gauge is remembered as the preset's default. The age rule is per athlete and must not become an org-wide choice.
    collegeGauge: values.collegeGauge ?? values.preset === "senior",
    headline: true,
    freshAndHealthy: values.freshAndHealthy,
    coachNote: values.coachNoteOn,
    strengths: values.strengthsOn,
    retestTrend: values.retestTrend,
  };
}

/**
 * Switching preset: set the preset and take the new preset's values for every field the coach has not changed.
 * Pure; `next` comes from presetValues.
 */
export function applyPresetSwitch(
  values: EvalFormValues,
  touched: ReadonlySet<PresetField>,
  next: { preset: EvalPreset } & Pick<EvalFormValues, PresetField>,
  age: number | null
): EvalFormValues {
  const out: EvalFormValues = { ...values, preset: next.preset };
  const fields: PresetField[] = ["metricKeys", "collegeGauge", "freshAndHealthy", "retestTrend", "coachNoteOn", "strengthsOn"];
  for (const field of fields) {
    if (touched.has(field)) continue;
    (out as Record<PresetField, unknown>)[field] = next[field];
  }
  // A remembered "on" never reaches an athlete under 14 without the coach turning it on
  if (!touched.has("collegeGauge") && age !== null && age < COLLEGE_GAUGE_MIN_AGE && out.collegeGauge === true) out.collegeGauge = null;
  return out;
}
