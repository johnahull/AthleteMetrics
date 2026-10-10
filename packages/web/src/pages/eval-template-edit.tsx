/**
 * Edit or view one eval template (AM-FEAT-019).
 * Access and test resolution use the TEMPLATE's organization, not the organization the user is looking at.
 * The global default is read-only (with "Duplicate as my template") for everyone but a site admin, who edits it with
 * no organization and confirms once, because it changes the default for every organization.
 * Saving never changes existing events: they keep the tests copied when they were created. Last write wins.
 * Leaving with unsaved changes (a link in the app, or closing / reloading the tab) asks first.
 */
import { useEffect, useState } from "react";
import { Link, Redirect, useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Copy, Trash2 } from "lucide-react";
import { createEvalTemplateSchema } from "@shared/eval-template-schemas";
import { useAuth } from "@/lib/auth";
import { useOrganization } from "@/lib/organization-api";
import { canManageEvent } from "@/lib/event-permissions";
import {
  apiErrorMessage,
  useCreateEvalTemplate,
  useEvalTemplate,
  useResolvedEvalTemplate,
  useUpdateEvalTemplate,
  type EvalTemplatePatch,
  type ResolvedEvalTemplateMetric,
} from "@/hooks/use-eval-report";
import { useToast } from "@/hooks/use-toast";
import { TEMPLATE_KEY_LABELS } from "@/lib/eval-template-labels";
import { bothSingleLegRequired, duplicateMetrics, toEditorState, toTemplateMetrics } from "@/lib/eval-template-editor";
import { MetricsSelector, type SelectedMetric } from "@/components/events/MetricsSelector";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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

const formSchema = z.object({
  name: createEvalTemplateSchema.shape.name,
  description: z.string().max(2000).regex(/^(?:[\t\n\r]|[^\p{Cc}])*$/u, "Description must not contain control characters"),
});
type FormValues = z.infer<typeof formSchema>;

const UNUSABLE_REASON: Record<string, string> = {
  missing: "Not in the metric catalog",
  inactive: "Switched off",
  unavailable: "Not offered to this organization's type",
};

const testName = (m: ResolvedEvalTemplateMetric) => m.customLabel ?? m.label ?? TEMPLATE_KEY_LABELS[m.metricKey] ?? m.metricKey;
const sportLabel = (sport: string) => sport.charAt(0) + sport.slice(1).toLowerCase();

export default function EvalTemplateEdit() {
  const { templateId } = useParams<{ templateId: string }>();
  // Outside the per-template editor, so "Duplicated." is still announced on the copy's page
  const [status, setStatus] = useState("");
  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>
      {/* A fresh editor per template (duplicating navigates from one template to another) */}
      <TemplateEditor key={templateId} templateId={templateId} setStatus={setStatus} />
    </>
  );
}

/** A link inside the app (not a new tab, a download or another site): navigation the editor can hold back */
function inAppHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!anchor || anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) return null;
  const href = anchor.getAttribute("href") ?? "";
  return href.startsWith("/") && !href.startsWith("//") ? href : null;
}

function TemplateEditor({ templateId, setStatus }: { templateId: string; setStatus: (status: string) => void }) {
  const [, navigate] = useLocation();
  const { organizationContext, userOrganizations, user } = useAuth();
  const { toast } = useToast();

  // Same organization as the Events page: the target of "Duplicate as my template"
  const effectiveOrganizationId =
    organizationContext ||
    (!user?.isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0 ? userOrganizations[0].organizationId : null);

  const { data: template, isLoading, error: loadError } = useEvalTemplate(templateId);
  const isDefault = !!template && !template.organizationId;
  const canEdit = !!template && (template.organizationId ? canManageEvent(user, userOrganizations, { organizationId: template.organizationId }) : !!user?.isSiteAdmin);
  const canView = canEdit || (isDefault && canManageEvent(user, userOrganizations, { organizationId: effectiveOrganizationId }));
  // An organization template is judged by its own organization; a site admin edits the default for no organization;
  // anyone else views the default as it applies to the organization they would duplicate it into.
  const resolveFor = template?.organizationId ?? (canEdit ? undefined : effectiveOrganizationId ?? undefined);
  const {
    data: resolved,
    isLoading: resolving,
    error: resolveError,
    refetch: refetchResolved,
  } = useResolvedEvalTemplate(template && canView ? template.id : undefined, resolveFor);
  // Eval templates are part of the Events module of the organization they are used in (none for the default as a site admin edits it)
  const { data: organization, isLoading: organizationLoading } = useOrganization(template && canView ? resolveFor : undefined);

  const updateTemplate = useUpdateEvalTemplate();
  const createTemplate = useCreateEvalTemplate(effectiveOrganizationId ?? undefined);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: "", description: "" } });
  const [selected, setSelected] = useState<SelectedMetric[] | null>(null);
  const [unusable, setUnusable] = useState<ResolvedEvalTemplateMetric[]>([]);
  const [derived, setDerived] = useState<ResolvedEvalTemplateMetric[]>([]);
  const [baseline, setBaseline] = useState({ name: "", description: "", metrics: "" });
  const [pendingPatch, setPendingPatch] = useState<EvalTemplatePatch | null>(null);
  const [error, setError] = useState("");
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  useEffect(() => {
    if (!template || !resolved || selected) return;
    const state = toEditorState(resolved.metrics);
    const description = template.description ?? "";
    setSelected(state.selected);
    setUnusable(state.unusable);
    setDerived(state.derived);
    setBaseline({ name: template.name, description, metrics: JSON.stringify(toTemplateMetrics(state.selected, state.unusable)) });
    form.reset({ name: template.name, description });
  }, [template, resolved, selected, form]);

  const name = form.watch("name");
  const description = form.watch("description");
  const metrics = selected ? toTemplateMetrics(selected, unusable) : [];
  // A derived leftover is dropped on save, so it is a change of its own (a rename-only save sends the metrics too)
  const metricsChanged = selected !== null && (derived.length > 0 || JSON.stringify(metrics) !== baseline.metrics);
  const dirty =
    canEdit && selected !== null && (name.trim() !== baseline.name || description.trim() !== baseline.description || metricsChanged);

  // Unsaved changes: closing or reloading the tab asks the browser's own question; a link inside the app asks ours
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      const href = inAppHref(event);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(href);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (loadError || !template) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="pt-6">
            <p>This template does not exist or you cannot open it.</p>
            <Link href="/events/templates" className="mt-2 inline-flex min-h-10 items-center text-sm underline">
              Back to templates
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!canView) return <Redirect to="/" />;
  if (organizationLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (organization && !organization.eventsEnabled) {
    return (
      <div className="p-4 sm:p-6">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <p className="text-yellow-800">The Events module is off for this organization, so eval templates are not available.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const backLink = (
    <Link href="/events/templates" className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to templates
    </Link>
  );
  const loadErrorCard =
    resolveError && !resolved ? (
      <Card role="alert" className="border-red-200 bg-red-50">
        <CardContent className="flex flex-col items-start gap-3 pt-6">
          <p className="text-red-800">Could not load the tests of this template.</p>
          <Button type="button" variant="outline" onClick={() => void refetchResolved()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    ) : null;
  const errorRegion = error ? (
    <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {error}
    </p>
  ) : null;

  if (!canEdit) {
    const copy = resolved ? duplicateMetrics(resolved.metrics) : null;
    const duplicateBlocked = !copy
      ? resolveError
        ? "Duplicate is not available: the tests could not be loaded."
        : "Duplicate is available once the tests have loaded."
      : copy.metrics.length === 0
        ? "None of this template's tests are available for your organization, so there is nothing to copy."
        : null;
    const handleDuplicate = async () => {
      if (!copy || copy.metrics.length === 0) return;
      setError("");
      const { metrics, leftOut } = copy;
      try {
        const created = await createTemplate.mutateAsync({
          name: `${template.name.slice(0, 193)} (copy)`,
          sport: template.sport,
          ...(template.description ? { description: template.description } : {}),
          metrics,
        });
        const description =
          leftOut.length > 0 ? `Left out (not available for your organization): ${leftOut.map(testName).join(", ")}.` : "All of its tests were copied.";
        setStatus(`Duplicated. ${description}`);
        toast({ title: "Template duplicated", description });
        navigate(`/events/templates/${created.id}`);
      } catch (e) {
        setError(apiErrorMessage(e, "Could not duplicate the template"));
      }
    };

    const rows = [...(resolved?.metrics ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
    return (
      <div className="max-w-3xl p-4 sm:p-6">
        {backLink}
        <div className="mb-4 mt-2 flex flex-wrap items-center gap-2">
          <h1 className="break-words text-2xl font-semibold text-gray-900">{template.name}</h1>
          <Badge variant="secondary">Default</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Sport: {sportLabel(template.sport)}</p>
        {template.description && <p className="mt-2 whitespace-pre-line break-words text-sm">{template.description}</p>}
        <p className="mt-4 rounded-md bg-muted/40 p-3 text-sm">
          Only a site admin can change the default template. Duplicate it to make a version for your organization.
        </p>
        <div className="mt-4 space-y-3">
          {errorRegion}
          <Button
            onClick={handleDuplicate}
            disabled={!!duplicateBlocked || createTemplate.isPending}
            aria-describedby={duplicateBlocked ? "duplicate-blocked" : undefined}
          >
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Duplicate as my template
          </Button>
          {duplicateBlocked && (
            <p id="duplicate-blocked" className="text-sm text-muted-foreground">
              {duplicateBlocked}
            </p>
          )}
        </div>
        <h2 className="mb-2 mt-6 text-lg font-medium">Tests</h2>
        {loadErrorCard ?? (resolving ? (
          <Skeleton className="h-32" />
        ) : (
          <ol className="space-y-2">
            {rows.map((m, i) => (
              <li key={m.metricKey} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <span className="text-xs font-medium text-muted-foreground">{i + 1}.</span>
                <span className="font-medium">{testName(m)}</span>
                <Badge variant="outline">{m.isRequired ? "Required" : "Optional"}</Badge>
                {m.status !== "available" && (
                  <span className="text-xs text-muted-foreground">
                    {m.status === "derived" ? "Calculated automatically" : "Not available for this organization"}
                  </span>
                )}
              </li>
            ))}
          </ol>
        ))}
      </div>
    );
  }

  const singleLegConflict = selected ? bothSingleLegRequired(selected) : false;
  const canSave = selected !== null && dirty && metrics.length > 0 && !singleLegConflict && !updateTemplate.isPending;

  const save = async (patch: EvalTemplatePatch) => {
    setError("");
    try {
      await updateTemplate.mutateAsync({ id: template.id, patch });
      setBaseline({ name: name.trim(), description: description.trim(), metrics: JSON.stringify(metrics) });
      if (patch.metrics) setDerived([]);
      setStatus("Saved.");
      toast({ title: "Template saved" });
    } catch (e) {
      const message = apiErrorMessage(e, "Could not save the template");
      setError(message);
      // A duplicate name (409) is also shown on the Name field itself
      if (e instanceof Error && e.message.startsWith("409:")) form.setError("name", { type: "server", message });
      setStatus("");
      toast({ title: "Not saved", description: message, variant: "destructive" });
    }
  };

  const onValid = (values: FormValues) => {
    const patch: EvalTemplatePatch = {};
    if (values.name !== baseline.name) patch.name = values.name;
    const nextDescription = values.description.trim();
    if (nextDescription !== baseline.description) patch.description = nextDescription || null;
    if (metricsChanged) patch.metrics = metrics;
    if (isDefault) setPendingPatch(patch);
    else void save(patch);
  };

  return (
    <div className="max-w-3xl p-4 sm:p-6">
      {backLink}
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-gray-900">Edit template</h1>
        {isDefault && <Badge variant="secondary">Default</Badge>}
      </div>
      {isDefault && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This is the default template. Changes apply to every organization's new events.
        </p>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onValid)} className="space-y-6" noValidate>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={200} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} maxLength={2000} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-sm text-muted-foreground">Sport: {sportLabel(template.sport)}</p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-medium">Tests</h2>
            {selected === null ? (
              loadErrorCard ?? <Skeleton className="h-40" />
            ) : (
              <MetricsSelector selectedMetrics={selected} onMetricsChange={setSelected} organizationId={template.organizationId ?? undefined} />
            )}
            {singleLegConflict && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Both single-leg jump sides are required. Make one optional: an event uses one side per athlete.
              </p>
            )}
            {selected !== null && metrics.length === 0 && <p className="mt-3 text-sm text-red-700">Add at least one test.</p>}
          </div>

          {unusable.length > 0 && (
            <section aria-labelledby="unusable-heading" className="space-y-2">
              <h2 id="unusable-heading" className="text-lg font-medium">
                Not available for this organization
              </h2>
              <p className="text-sm text-muted-foreground">These stay in the template until you remove them. New events skip them.</p>
              <p className="text-sm text-muted-foreground">When you save, they are saved after the tests above.</p>
              <ul className="space-y-2">
                {unusable.map((m) => (
                  <li key={m.metricKey} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-medium">{testName(m)}</p>
                      <p className="text-sm text-muted-foreground">
                        {m.code !== testName(m) && <span className="break-all font-mono text-xs">{m.code} · </span>}
                        {UNUSABLE_REASON[m.status]} · {m.isRequired ? "Required" : "Optional"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="self-start text-red-600 hover:bg-red-50 hover:text-red-700 sm:self-auto"
                      onClick={() => setUnusable((list) => list.filter((u) => u.metricKey !== m.metricKey))}
                      aria-label={`Remove ${testName(m)}`}
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {derived.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Calculated automatically, so not a test to enter, and removed when you save: {derived.map(testName).join(", ")}.
            </p>
          )}

          {errorRegion}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSave}>
              Save changes
            </Button>
            <Button asChild variant="outline">
              <Link href="/events/templates">Cancel</Link>
            </Button>
          </div>
        </form>
      </Form>

      <AlertDialog open={leaveTo !== null} onOpenChange={(open) => !open && setLeaveTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>Your changes to this template are not saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (leaveTo) navigate(leaveTo);
                setLeaveTo(null);
              }}
            >
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingPatch !== null} onOpenChange={(open) => !open && setPendingPatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save the default template?</AlertDialogTitle>
            <AlertDialogDescription>
              This changes the default for every organization. Events already created keep their tests.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPatch) void save(pendingPatch);
                setPendingPatch(null);
              }}
            >
              Save default
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
