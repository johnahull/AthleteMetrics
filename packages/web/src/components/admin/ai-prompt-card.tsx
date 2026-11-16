import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, ChevronDown, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AI_PROMPT_OVERRIDE_KEYS,
  AI_PROMPT_OVERRIDE_MAX,
  AI_PROMPT_ROLE_MAX,
  AI_PROMPT_CHECKLIST_LINES,
  aiPromptOverridesSchema,
  type AIPromptOverrideKey,
  type AIPromptOverrides,
} from "@shared/ai-prompt-overrides";

type FormValues = z.input<typeof aiPromptOverridesSchema>;

interface PromptDefaults {
  defaults: Record<AIPromptOverrideKey, string>;
  roleMaxLength: number;
  checklistLines: number;
  systemPrompt: string;
  systemPromptNote: string;
}

const FIELDS: Record<AIPromptOverrideKey, { label: string; controls: string; locked: string }> = {
  role: {
    label: "Role",
    controls: "The opening sentence that says who the AI is. One line, up to 200 characters.",
    locked: "It must still use only the report data. That part cannot be changed.",
  },
  philosophy: {
    label: "Coaching philosophy",
    controls: "Optional principles added after the rules in the system prompt.",
    locked: "It cannot override the safety, grounding or medical rules.",
  },
  toneParent: {
    label: "Parent tone",
    controls: "How insights sound when written for a parent.",
    locked: "Section headings and word limits are fixed.",
  },
  toneAthlete: {
    label: "Athlete tone",
    controls: "How insights sound when written for the athlete.",
    locked: "Section headings and word limits are fixed.",
  },
  toneCoach: {
    label: "Coach tone",
    controls: "Extra guidance for insights written for the coach.",
    locked: "Section headings and word limits are fixed.",
  },
  analysisChecklist: {
    label: "Analysis checklist",
    controls: "Wording of the checklist the AI works through before writing.",
    locked: `Numbering, data validity and the coach's limiter call are fixed. Write exactly ${AI_PROMPT_CHECKLIST_LINES} lines, one per checklist item 2, 3, 4, 6, 7, 8 and 9, in that order.`,
  },
};

function parseApiError(error: unknown): { message: string; fields: { key: AIPromptOverrideKey; message: string }[] } {
  const raw = error instanceof Error ? error.message : String(error);
  const match = raw.match(/^\d+: ([\s\S]*)$/);
  if (!match) return { message: raw, fields: [] };
  try {
    const body = JSON.parse(match[1]);
    const fields = (Array.isArray(body.errors) ? body.errors : [])
      .map((e: { path?: unknown[]; message?: string }) => ({
        key: (e.path ?? []).find((p) => AI_PROMPT_OVERRIDE_KEYS.includes(p as AIPromptOverrideKey)) as AIPromptOverrideKey,
        message: e.message ?? "Invalid value",
      }))
      .filter((f: { key?: string }) => f.key);
    return { message: typeof body.message === "string" ? body.message : "The server rejected the change", fields };
  } catch {
    return { message: "The server rejected the change", fields: [] };
  }
}

const EMPTY: FormValues = Object.fromEntries(AI_PROMPT_OVERRIDE_KEYS.map((k) => [k, ""]));

export function AiPromptCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: settings } = useQuery<{ aiPromptOverrides?: AIPromptOverrides | null }>({
    queryKey: ["/api/site-settings"],
  });
  const { data: defaults } = useQuery<PromptDefaults>({ queryKey: ["/api/site-settings/ai-prompt-defaults"] });

  const form = useForm<FormValues, unknown, AIPromptOverrides>({
    resolver: zodResolver(aiPromptOverridesSchema),
    defaultValues: EMPTY,
  });
  const { register, handleSubmit, watch, setValue, reset, setError, formState } = form;

  // Reload the fields when the saved value changes (after a save or the first load). A background refetch
  // (window focus, another admin's save) must not wipe what this admin is typing, so touched fields stay.
  const storedJson = JSON.stringify(settings?.aiPromptOverrides ?? {});
  useEffect(() => {
    reset({ ...EMPTY, ...JSON.parse(storedJson) }, { keepDirtyValues: true });
  }, [storedJson, reset]);

  const save = useMutation({
    mutationFn: async (aiPromptOverrides: AIPromptOverrides) => {
      const res = await apiRequest("PATCH", "/api/site-settings", { aiPromptOverrides });
      return res.json();
    },
    onSuccess: (_data, saved) => {
      // The submitted values are already sanitized by the schema: show them, so the form is not left dirty with raw text
      reset({ ...EMPTY, ...saved });
      queryClient.invalidateQueries({ queryKey: ["/api/site-settings"] });
      toast({ title: "AI prompt updated", description: "The change applies to all organizations." });
    },
    onError: (error: unknown) => {
      const { message, fields } = parseApiError(error);
      fields.forEach((f) => setError(f.key, { type: "server", message: f.message }));
      toast({
        title: "Error updating AI prompt",
        description: fields.length ? "Fix the highlighted fields and save again." : message,
        variant: "destructive",
      });
    },
  });

  const clearField = (key: AIPromptOverrideKey) =>
    setValue(key, "", { shouldDirty: true, shouldValidate: formState.isSubmitted });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5" />
          AI insights prompt
        </CardTitle>
        <CardDescription>
          Reword the editable parts of the prompt that writes coaching insights. Leave a field empty to use the default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg" role="note">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-800 font-medium">Changes apply to all organizations immediately</p>
        </div>

        <p className="text-xs text-muted-foreground">
          The characters &lt; &gt; {"{"} {"}"} and ` are removed when you save, and so are a leading # and blank lines.
        </p>

        <form onSubmit={handleSubmit((values) => save.mutate(values))} className="space-y-4" noValidate>
          {AI_PROMPT_OVERRIDE_KEYS.map((key) => {
            const meta = FIELDS[key];
            const max = key === "role" ? defaults?.roleMaxLength ?? AI_PROMPT_ROLE_MAX : AI_PROMPT_OVERRIDE_MAX;
            const value = watch(key) ?? "";
            const error = formState.errors[key];
            const ids = { help: `ai-prompt-${key}-help`, count: `ai-prompt-${key}-count`, err: `ai-prompt-${key}-err` };
            return (
              <div key={key} className="rounded-lg border p-4 space-y-2">
                <label htmlFor={`ai-prompt-${key}`} className="text-base font-medium">
                  {meta.label}
                </label>
                <p id={ids.help} className="text-sm text-muted-foreground">
                  {meta.controls} {meta.locked}
                </p>
                {(() => {
                  const common = {
                    id: `ai-prompt-${key}`,
                    placeholder: defaults?.defaults[key] || "Empty by default",
                    "aria-invalid": error ? (true as const) : undefined,
                    "aria-describedby": [ids.help, ids.count, error ? ids.err : null].filter(Boolean).join(" "),
                    ...register(key),
                  };
                  // Role is one line; Enter would otherwise submit the form from an <input>
                  return key === "role" ? <Input {...common} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} /> : <Textarea rows={4} {...common} />;
                })()}
                {error && (
                  <p id={ids.err} className="text-sm font-medium text-destructive" role="alert">
                    {error.type === "too_big" ? `${meta.label} must be ${max} characters or less` : error.message}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <Button type="button" variant="ghost" size="sm" onClick={() => clearField(key)} disabled={!value}
                    aria-label={`Reset ${meta.label} to default`}>
                    Reset to default
                  </Button>
                  <span id={ids.count} className="text-xs text-muted-foreground">
                    {value.length} / {max}
                  </span>
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending || !formState.isDirty} data-testid="save-ai-prompt">
              Save prompt
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirmResetAll(true)}>
              Reset all to defaults
            </Button>
          </div>
        </form>

        <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="gap-1">
              <ChevronDown className={`h-4 w-4 transition-transform ${previewOpen ? "rotate-180" : ""}`} />
              {previewOpen ? "Hide" : "Show"} assembled system prompt
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Read-only. The audience tone and the analysis checklist are part of the user message, which is built for
              each report, so they are not shown here.
            </p>
            <pre className="whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs" data-testid="ai-system-prompt-preview">
              {defaults?.systemPrompt ?? "Loading…"}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      <AlertDialog open={confirmResetAll} onOpenChange={setConfirmResetAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all prompt fields?</AlertDialogTitle>
            <AlertDialogDescription>
              Every field is cleared. Nothing changes for organizations until you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reset(EMPTY, { keepDefaultValues: true })}>Reset all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
