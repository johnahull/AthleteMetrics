/**
 * API hooks for the eval report selection dialog and eval battery templates (AM-FEAT-019 P5).
 * Server routes: event-report-routes.ts (preview, save, defaults) and eval-template-routes.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { z } from "zod";
import type { EvalReportRequest, evalLoadSchema, evalPresetSchema } from "@shared/eval-report-config";
import type { evalPresetOverrideSchema, evalSelectionSchema } from "@shared/eval-template-schemas";
import type { EvalReportModelView, Report } from "@/types/report-types";

export type EvalPreset = z.infer<typeof evalPresetSchema>;
export type EvalLoad = z.infer<typeof evalLoadSchema>;
export type EvalMetricGroup = "speed" | "power" | "change_of_direction" | "movement" | "other";

export interface EvalOfferedMetric {
  code: string;
  /** Logical key; null for a measured metric outside the key map */
  key: string | null;
  label: string;
  group: EvalMetricGroup;
  checked: boolean;
}

/** Selection as stored on a saved eval row (the request's selection) or computed by the server (preset + metricKeys only) */
export interface EvalDefaultsSelection {
  preset: EvalPreset;
  metricKeys?: string[];
  collegeGauge?: boolean;
  metricCollegeGauge?: Record<string, boolean>;
  sections?: {
    headline?: boolean;
    freshAndHealthy?: boolean;
    coachNote?: boolean;
    noteFirst?: boolean;
    strengths?: boolean;
    retestTrend?: boolean;
    radar?: boolean;
  };
}

export interface EvalDefaults {
  /** "saved" = the latest saved eval for this event and athlete wins over everything else */
  source: "computed" | "saved";
  reportId?: string;
  selection: EvalDefaultsSelection;
  load: EvalLoad | null;
  coachNote: string | null;
  offered: { headline: EvalOfferedMetric[]; available: EvalOfferedMetric[] };
}

/** What the org remembers (eval-report-settings): flat, without radar or per-metric college switches */
export type OrgEvalSelection = z.infer<typeof evalSelectionSchema>;

export type OrgPresetOverride = z.infer<typeof evalPresetOverrideSchema>;

export interface EvalReportSettings {
  presets: Partial<Record<EvalPreset, OrgPresetOverride>>;
  lastSelection: OrgEvalSelection | null;
}

export interface EvalTemplateMetric {
  metricKey: string;
  isRequired: boolean;
  displayOrder: number;
  customLabel?: string;
}

export interface EvalTemplate {
  id: string;
  /** Null for the global default ("Soccer eval (yards)") */
  organizationId: string | null;
  name: string;
  sport: string;
  description?: string | null;
  metrics: EvalTemplateMetric[];
}

export interface ApplyEvalTemplateResult {
  added: string[];
  skipped: string[];
  alreadyPresent: string[];
}

const MAX_PLAIN_ERROR_LENGTH = 300;

/** apiRequest throws "400: {json body}"; show the server's own message when there is one */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const match = /^\d{3}: ([\s\S]*)$/.exec(error.message);
  const body = (match ? match[1] : error.message).trim();
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message || parsed.error || fallback;
  } catch {
    // An HTML error page or a huge body is not something to show a coach
    return body && !body.startsWith("<") && body.length <= MAX_PLAIN_ERROR_LENGTH ? body : fallback;
  }
}

const evalPath = (eventId: string, athleteId: string) => `/api/events/${eventId}/athletes/${athleteId}/eval-report`;

export const evalReportKeys = {
  defaults: (eventId: string, athleteId: string) => ["eval-report", eventId, athleteId, "defaults"] as const,
  model: (eventId: string, athleteId: string, tag: string, body: unknown) =>
    ["eval-report", eventId, athleteId, "model", tag, body] as const,
  settings: (orgId: string) => ["eval-report-settings", orgId] as const,
  templates: (orgId: string) => ["eval-templates", orgId] as const,
};

export function useEvalReportDefaults(eventId: string, athleteId: string, enabled: boolean) {
  return useQuery<EvalDefaults>({
    queryKey: evalReportKeys.defaults(eventId, athleteId),
    queryFn: async () => (await apiRequest("GET", `${evalPath(eventId, athleteId)}/defaults`)).json(),
    enabled,
    // The selection screen must always reflect the latest saved report
    staleTime: 0,
    gcTime: 0,
  });
}

/** A read-only preview fetched as a query (used to learn age, college availability and suggestions on open) */
export function useEvalReportModelQuery(
  eventId: string,
  athleteId: string,
  tag: string,
  body: EvalReportRequest,
  enabled: boolean
) {
  return useQuery<EvalReportModelView>({
    queryKey: evalReportKeys.model(eventId, athleteId, tag, body),
    queryFn: async () => (await apiRequest("POST", `${evalPath(eventId, athleteId)}/preview`, body)).json().then((r) => r.model),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/** Preview: builds the model, saves nothing */
export function usePreviewEvalReport(eventId: string, athleteId: string) {
  return useMutation<EvalReportModelView, Error, EvalReportRequest>({
    mutationFn: async (body) => (await apiRequest("POST", `${evalPath(eventId, athleteId)}/preview`, body)).json().then((r) => r.model),
  });
}

/** Generate: saves a new eval report row (every generation is a new row) */
export function useGenerateEvalReport(eventId: string, athleteId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ report: Report; model: EvalReportModelView }, Error, EvalReportRequest>({
    mutationFn: async (body) => (await apiRequest("POST", evalPath(eventId, athleteId), body)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "reports"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      // Only the defaults change (the next open starts from this report); no refetch while the success screen shows
      queryClient.invalidateQueries({ queryKey: evalReportKeys.defaults(eventId, athleteId), refetchType: "none" });
    },
  });
}

/** GET /api/reports/:id/pdf as a blob, with the server's filename when it sends one */
export async function downloadEvalReportPdf(reportId: string): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`/api/reports/${reportId}/pdf`, { credentials: "include" });
  if (!response.ok) {
    let message = "Failed to download PDF";
    try {
      const body = await response.json();
      message = body?.message || body?.error || message;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  let filename = "Eval_Report.pdf";
  if (match) {
    try {
      filename = decodeURIComponent(match[1]);
    } catch {
      filename = match[1]; // not valid percent-encoding: use it as sent
    }
  }
  return { blob: await response.blob(), filename };
}

/** Hand the blob to the browser as a file download */
export function saveBlobAs(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export function useEvalReportSettings(orgId: string | undefined, enabled: boolean) {
  return useQuery<EvalReportSettings>({
    queryKey: evalReportKeys.settings(orgId ?? ""),
    queryFn: async () => (await apiRequest("GET", `/api/organizations/${orgId}/eval-report-settings`)).json(),
    enabled: enabled && !!orgId,
    staleTime: 0,
    retry: false,
  });
}

export function usePutEvalReportSettings(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation<EvalReportSettings, Error, Partial<EvalReportSettings>>({
    mutationFn: async (body) => (await apiRequest("PUT", `/api/organizations/${orgId}/eval-report-settings`, body)).json(),
    onSuccess: (data) => queryClient.setQueryData(evalReportKeys.settings(orgId), data),
  });
}

export function useEvalTemplates(orgId: string | undefined) {
  return useQuery<EvalTemplate[]>({
    queryKey: evalReportKeys.templates(orgId ?? ""),
    queryFn: async () => (await apiRequest("GET", `/api/organizations/${orgId}/eval-templates`)).json(),
    enabled: !!orgId,
    retry: false,
  });
}

/** Save the event's current metric set as an org template */
export function useSaveEventAsTemplate(eventId: string, orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<EvalTemplate, Error, { name: string }>({
    mutationFn: async (body) => (await apiRequest("POST", `/api/events/${eventId}/eval-templates`, body)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: evalReportKeys.templates(orgId ?? "") }),
  });
}

export async function applyEvalTemplate(
  eventId: string,
  body: { templateId: string; includeOptional?: string[] }
): Promise<ApplyEvalTemplateResult> {
  return (await apiRequest("POST", `/api/events/${eventId}/apply-eval-template`, body)).json();
}
