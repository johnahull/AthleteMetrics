/**
 * Create or edit a report template: name, description, metrics, benchmark sets / picks and the chart choices for
 * team and individual reports. Items that were removed or switched off since the template was saved stay in it
 * (shown as "Unavailable") until the user removes them, so editing never drops data silently.
 */
import { useState } from "react";
import { Link, Redirect, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, X } from "lucide-react";
import type { CreateReportTemplateInput } from "@shared/report-template-schemas";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { canManageEvent } from "@/lib/event-permissions";
import { useOrganizationMetrics } from "@/lib/metrics-api";
import { useOrganizationBenchmarks } from "@/lib/benchmarks-api";
import { useBenchmarkSets } from "@/lib/benchmark-sets-api";
import {
  useCreateReportTemplate,
  useReportTemplates,
  useUpdateReportTemplate,
  type ReportTemplate,
} from "@/lib/report-templates-api";
import { useTemplateOrganizationId } from "@/hooks/use-template-organization";
import { useContextualLabels } from "@/hooks/useContextualLabels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricPicker } from "@/components/reports/template-fields/MetricPicker";
import { BenchmarkFields } from "@/components/reports/template-fields/BenchmarkFields";
import { ChartChoices } from "@/components/reports/template-fields/ChartChoices";
import { chartItems } from "@/components/reports/template-fields/chart-items";
import { useBenchmarkSetDetails } from "@/components/reports/template-fields/useBenchmarkSetDetails";
import { saveErrorMessage } from "@/components/reports/SaveReportTemplateDialog";
import { setTemplateCharts, templateCharts } from "@/components/reports/report-template";
import type { ReportTemplateCharts } from "@shared/report-template-schemas";

const LIST_PATH = "/reports/templates";

export default function ReportTemplateEdit() {
  const { templateId } = useParams<{ templateId: string }>();
  const { userOrganizations, user } = useAuth();
  const organizationId = useTemplateOrganizationId();
  const isNew = templateId === "new";
  const { data: templates, isLoading, isError, refetch } = useReportTemplates(organizationId ?? "");

  if (!organizationId) {
    return (
      <div className="p-4 sm:p-6">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <p className="text-yellow-800">Please select an organization to manage report templates.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!canManageEvent(user, userOrganizations, { organizationId })) return <Redirect to="/" />;

  const back = (
    <Link href={LIST_PATH} className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to templates
    </Link>
  );

  if (!isNew && isLoading) {
    return <div className="p-4 sm:p-6"><Skeleton className="h-64" /></div>;
  }
  if (!isNew && isError) {
    return (
      <div className="p-4 sm:p-6">
        {back}
        <Card role="alert" className="mt-2 border-red-200 bg-red-50">
          <CardContent className="flex flex-col items-start gap-3 pt-6">
            <p className="text-red-800">Could not load the template.</p>
            <Button variant="outline" onClick={() => void refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  const template = isNew ? undefined : templates?.find((t) => t.id === templateId);
  if (!isNew && !template) {
    return (
      <div className="p-4 sm:p-6">
        {back}
        <Card className="mt-2 border-dashed bg-gray-50">
          <CardContent className="py-8 text-center text-gray-600">This template was not found. It may have been deleted.</CardContent>
        </Card>
      </div>
    );
  }
  // A fresh form per template, so state never carries over from another one
  return <EditorForm key={templateId} organizationId={organizationId} template={template} back={back} />;
}

function EditorForm({ organizationId, template, back }: { organizationId: string; template?: ReportTemplate; back: React.ReactNode }) {
  const [, navigate] = useLocation();
  const labels = useContextualLabels();
  const create = useCreateReportTemplate(organizationId);
  const update = useUpdateReportTemplate();

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [metricCodes, setMetricCodes] = useState<string[]>(template?.metrics ?? []);
  const [setIds, setSetIds] = useState<string[]>(template?.benchmarkSetIds ?? []);
  const [siteIds, setSiteIds] = useState<string[]>(template?.siteBenchmarkIds ?? []);
  const [customIds, setCustomIds] = useState<string[]>(template?.customBenchmarkIds ?? []);
  const [charts, setCharts] = useState<ReportTemplateCharts>(template?.charts ?? {});
  const [error, setError] = useState<string | null>(null);

  const metricsQuery = useOrganizationMetrics(organizationId, true);
  const benchmarksQuery = useOrganizationBenchmarks(organizationId, false);
  const setsQuery = useBenchmarkSets(organizationId);
  const { queries: setQueries, ready: setsReady, failed: setsFailed, goneIds } = useBenchmarkSetDetails(organizationId, setIds);

  // Same source of truth the wizard uses: the Force-Velocity chart needs the site AND the org module on
  const { data: siteSettings } = useQuery<{ sprintFvEnabled?: boolean }>({
    queryKey: ["/api/site-settings/public"],
    queryFn: async () => (await apiRequest("GET", "/api/site-settings/public")).json(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: org } = useQuery<{ sprintFvEnabled?: boolean }>({
    queryKey: [`/api/organizations/${organizationId}`],
    queryFn: async () => (await apiRequest("GET", `/api/organizations/${organizationId}`)).json(),
    staleTime: 5 * 60 * 1000,
  });
  const fvEnabled = (siteSettings?.sprintFvEnabled ?? false) && (org?.sprintFvEnabled ?? false);

  const listsLoading = metricsQuery.isLoading || benchmarksQuery.isLoading || setsQuery.isLoading;
  const listsFailed = !!(metricsQuery.error || benchmarksQuery.error || setsQuery.error);
  // A set that came back 404 is "unavailable", not still loading
  const setsSettled = setQueries.every((q, i) => q.isSuccess || goneIds.includes(setIds[i]));

  const allBenchmarks = [...(benchmarksQuery.data ?? [])];
  const enabledMetricCodes = new Set((metricsQuery.data ?? []).map((m) => m.metricCode));
  const knownBenchmarkIds = new Set(allBenchmarks.map((b) => b.benchmarkId));
  const unavailableMetrics = listsLoading || listsFailed ? [] : metricCodes.filter((c) => !enabledMetricCodes.has(c));
  const unavailableBenchmarks = listsLoading || listsFailed ? [] : [...siteIds, ...customIds].filter((id) => !knownBenchmarkIds.has(id));
  const unavailableCount = unavailableMetrics.length + unavailableBenchmarks.length + goneIds.length;

  const toggleMetric = (code: string) =>
    setMetricCodes((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  const removeBenchmark = (id: string) => {
    setSiteIds((cur) => cur.filter((x) => x !== id));
    setCustomIds((cur) => cur.filter((x) => x !== id));
  };

  const chartSection = (type: "team" | "individual", title: string) => (
    <div className="grid gap-y-3 rounded-lg border bg-muted/30 p-4">
      <h3 className="font-medium">{title}</h3>
      <ChartChoices
        items={chartItems(type, labels, fvEnabled)}
        value={templateCharts({ charts }, type)}
        idPrefix={type}
        onChange={(key, checked) =>
          setCharts((cur) => setTemplateCharts(cur, type, { ...templateCharts({ charts: cur }, type), [key]: checked }))
        }
      />
    </div>
  );

  const canSave =
    !!name.trim() && metricCodes.length > 0 && !listsLoading && !listsFailed && setsSettled && !setsFailed &&
    !create.isPending && !update.isPending;

  const save = async () => {
    setError(null);
    const body = {
      name: name.trim(),
      metrics: metricCodes,
      benchmarkSetIds: setIds,
      siteBenchmarkIds: siteIds,
      customBenchmarkIds: customIds,
      charts,
    };
    const trimmed = description.trim();
    try {
      if (template) {
        // null clears a description on update; create just omits it
        await update.mutateAsync({ id: template.id, data: { ...body, description: trimmed || null } });
      } else {
        await create.mutateAsync({ ...body, description: trimmed || undefined } as CreateReportTemplateInput);
      }
      navigate(LIST_PATH);
    } catch (e) {
      setError(saveErrorMessage(e));
    }
  };

  const retryLists = () => {
    void metricsQuery.refetch();
    void benchmarksQuery.refetch();
    void setsQuery.refetch();
  };

  return (
    <div className="p-4 sm:p-6">
      {back}
      <h1 className="mb-6 mt-2 text-2xl font-semibold text-gray-900">{template ? "Edit report template" : "New report template"}</h1>

      <div className="grid max-w-3xl gap-y-6">
        {listsFailed && (
          <Card role="alert" className="border-red-200 bg-red-50">
            <CardContent className="flex flex-col items-start gap-3 pt-6">
              <p className="text-red-800">Metrics, benchmarks or benchmark sets failed to load, so the template can't be edited safely.</p>
              <Button type="button" variant="outline" onClick={retryLists}>Retry</Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-y-4">
          <div>
            <Label htmlFor="template-name">Template name *</Label>
            <Input id="template-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="template-description">Description</Label>
            <Textarea id="template-description" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        {unavailableCount > 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            {unavailableCount} {unavailableCount === 1 ? "item is" : "items are"} no longer available. {unavailableCount === 1 ? "It stays" : "They stay"} in the template until you remove {unavailableCount === 1 ? "it" : "them"}.
          </p>
        )}

        <section className="grid gap-y-3" aria-labelledby="metrics-heading">
          <h2 id="metrics-heading" className="text-lg font-semibold">Metrics *</h2>
          <MetricPicker
            metrics={metricsQuery.data}
            isLoading={metricsQuery.isLoading}
            error={metricsQuery.error}
            selected={metricCodes}
            onToggle={toggleMetric}
          />
          {unavailableMetrics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {unavailableMetrics.map((code) => (
                <Badge key={code} variant="outline" className="gap-1">
                  Unavailable: {code}
                  <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Remove ${code}`} onClick={() => toggleMetric(code)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-y-3" aria-labelledby="benchmarks-heading">
          <h2 id="benchmarks-heading" className="text-lg font-semibold">Benchmarks</h2>
          <BenchmarkFields
            organizationId={organizationId}
            benchmarkSets={setsQuery.data}
            benchmarkSetsLoading={setsQuery.isLoading}
            setIds={setIds}
            onAddSet={(id) => setSetIds((cur) => (cur.includes(id) ? cur : [...cur, id]))}
            onRemoveSet={(id) => setSetIds((cur) => cur.filter((x) => x !== id))}
            setQueries={setQueries}
            setsReady={setsReady}
            allBenchmarks={allBenchmarks}
            benchmarksLoading={benchmarksQuery.isLoading}
            benchmarksError={benchmarksQuery.error}
            siteIds={siteIds}
            customIds={customIds}
            onBenchmarksChange={({ site, custom }) => {
              setSiteIds(site);
              setCustomIds(custom);
            }}
            setContext={{}}
            listContext={{}}
          />
          {unavailableBenchmarks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {unavailableBenchmarks.map((id) => (
                <Badge key={id} variant="outline" className="gap-1">
                  Unavailable benchmark {id.slice(-6)}
                  <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Remove unavailable benchmark ${id.slice(-6)}`} onClick={() => removeBenchmark(id)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-y-3" aria-labelledby="charts-heading">
          <h2 id="charts-heading" className="text-lg font-semibold">Charts</h2>
          {chartSection("team", "Team reports")}
          {chartSection("individual", "Individual reports")}
        </section>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-x-2 border-t pt-4">
          <Button type="button" onClick={save} disabled={!canSave}>
            {create.isPending || update.isPending ? "Saving..." : "Save template"}
          </Button>
          <Button asChild variant="outline">
            <Link href={LIST_PATH}>Cancel</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
