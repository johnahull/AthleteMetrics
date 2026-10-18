import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueries } from "@tanstack/react-query";
import { apiRequest, STALE_TIME } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useCreateReport } from "@/hooks/use-reports";
import { useOrganizationMetrics } from "@/lib/metrics-api";
import { useOrganizationBenchmarks } from "@/lib/benchmarks-api";
import { useBenchmarkSets, fetchBenchmarkSet, benchmarkSetKeys } from "@/lib/benchmark-sets-api";
import { useReportTemplates, useDeleteReportTemplate, type ReportTemplate } from "@/lib/report-templates-api";
import { BenchmarkSetPreview } from "@/components/benchmark-sets";
import { BenchmarkChecklist } from "@/components/benchmarks/BenchmarkChecklist";
import { splitBenchmarkSelection, resolveBenchmarkSelection } from "./benchmark-selection";
import { templateToFormValues, formToTemplate, templateCharts } from "./report-template";
import { SaveReportTemplateDialog } from "./SaveReportTemplateDialog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { BenchmarkSetCombobox } from "@/components/benchmark-sets/BenchmarkSetCombobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AlertTriangle, ChevronLeft, ChevronRight, Trash2, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TeamAthleteSelector } from "@/components/ui/team-athlete-selector";
import type { OrganizationBenchmarkWithDetails } from "@shared/schema";
import { useContextualLabels } from "@/hooks/useContextualLabels";
import { DEFAULT_CHART_SELECTION } from "@shared/report-charts";

// Module-level so BenchmarkChecklist's memos keep stable accessor props across renders
const getBenchmarkKey = (b: OrganizationBenchmarkWithDetails) => b.benchmarkId;
const getBenchmarkLabel = (b: OrganizationBenchmarkWithDetails) => b.name;
const getBenchmarkMeta = (b: OrganizationBenchmarkWithDetails) => ({
  metricCode: b.metricCode,
  gender: b.gender,
  level: b.level,
  tierGroupId: b.tierGroupId,
});

const reportConfigSchema = z.object({
  reportType: z.enum(["team", "individual"]),
  name: z.string().min(1, "Report name is required"),
  description: z.string().optional(),
  athleteIds: z.array(z.string()).optional(),
  timeframeType: z.enum(["preset", "custom"]),
  timeframePreset: z.enum(["season", "year", "all_time"]).optional(),
  timeframeStart: z.string().optional(),
  timeframeEnd: z.string().optional(),
  metrics: z.array(z.string()).min(1, "At least one metric is required"),
  siteBenchmarks: z.array(z.string()).optional(),
  customBenchmarks: z.array(z.string()).optional(),
  teamIds: z.array(z.string()).optional(),
  gender: z.string().optional(),
  positions: z.array(z.string()).optional(),
  audience: z.enum(["coach", "athlete", "parent"]).default("coach"),
  enableCompositeIndex: z.boolean().default(false),
  // Individual reports only: compare the athlete to a group (percentiles, radar, distribution)
  groupComparison: z.boolean().default(false),
  charts: z.object({
    radar: z.boolean().default(true),
    benchmarkStanding: z.boolean().default(true),
    trends: z.boolean().default(true),
    distribution: z.boolean().default(true),
    fvProfile: z.boolean().default(true),
    leaderboard: z.boolean().default(true),
    tierDistribution: z.boolean().default(true),
    boxSwarm: z.boolean().default(true),
  }).default(DEFAULT_CHART_SELECTION),
  compositeWeights: z.record(z.string(), z.number()).optional(),
}).superRefine((data, ctx) => {
  if (data.reportType === "individual" && (!data.athleteIds || data.athleteIds.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one athlete is required for individual reports",
      path: ["athleteIds"],
    });
  }
});

type ReportFormData = z.infer<typeof reportConfigSchema>;

interface ReportWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (reportId: string | string[]) => void;
}

export function ReportWizard({ open, onClose, onSuccess }: ReportWizardProps) {
  const labels = useContextualLabels();
  const { organizationContext } = useAuth();
  const [step, setStep] = useState(1);
  const totalSteps = 8;

  // Benchmark sets combine with the individual picks; the report gets the deduped union
  const [selectedBenchmarkSetIds, setSelectedBenchmarkSetIds] = useState<string[]>([]);
  // Template the form was prefilled from (step 1), and how many of its items no longer exist
  const [loadedTemplate, setLoadedTemplate] = useState<ReportTemplate | null>(null);
  const [droppedCount, setDroppedCount] = useState(0);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  const {
    register,
    watch,
    getValues,
    setValue,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<ReportFormData>({
    resolver: zodResolver(reportConfigSchema),
    defaultValues: {
      reportType: "team",
      audience: "coach",
      athleteIds: [],
      timeframeType: "preset",
      timeframePreset: "all_time",
      metrics: [],
      siteBenchmarks: [],
      customBenchmarks: [],
      teamIds: [],
      positions: [],
      enableCompositeIndex: false,
      groupComparison: false,
      charts: DEFAULT_CHART_SELECTION,
    },
  });

  const createReport = useCreateReport();

  // Watch form values
  const reportType = watch("reportType");
  const reportName = watch("name");

  // Default audience based on report type — reset to coach for team reports
  // since athlete/parent audiences only make sense for individual reports
  useEffect(() => {
    if (reportType === "team") {
      setValue("audience", "coach");
    } else if (!dirtyFields.audience) {
      setValue("audience", "coach");
    }
  }, [reportType, setValue, dirtyFields.audience]);
  const timeframeType = watch("timeframeType");
  const selectedMetrics = watch("metrics");
  const enableCompositeIndex = watch("enableCompositeIndex");
  const charts = watch("charts");
  const groupComparison = watch("groupComparison");
  // Radar and distribution are group comparisons: unavailable on an individual report without one
  const comparisonChartOff = (key: string) =>
    reportType === "individual" && !groupComparison && (key === "radar" || key === "distribution");

  // Fetch organization's enabled metrics using standardized hook
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useOrganizationMetrics(
    organizationContext || "",
    true // enabledOnly
  );

  // Fetch teams
  const { data: teams, isLoading: teamsLoading, error: teamsError } = useQuery({
    queryKey: ["/api/teams", organizationContext],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/teams?organizationId=${organizationContext}`);
      return res.json();
    },
    enabled: !!organizationContext,
  });

  // Sprint-FV feature flags (site AND org must be on) gate the Force-Velocity
  // chart option. Same source of truth the sidebar uses for the /sprint-fv nav.
  const { data: siteSettings } = useQuery<{ sprintFvEnabled?: boolean }>({
    queryKey: ["/api/site-settings/public"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/site-settings/public");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: wizardOrg } = useQuery<{ sprintFvEnabled?: boolean }>({
    queryKey: [`/api/organizations/${organizationContext}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${organizationContext}`);
      return res.json();
    },
    enabled: !!organizationContext,
    staleTime: 5 * 60 * 1000,
  });
  const fvEnabled = (siteSettings?.sprintFvEnabled ?? false) && (wizardOrg?.sprintFvEnabled ?? false);

  // Fetch enabled benchmarks for the organization using standardized hook
  const { data: enabledBenchmarks, isLoading: benchmarksLoading, error: benchmarksError } = useOrganizationBenchmarks(
    organizationContext || "",
    false // includeInactive - only get active benchmarks
  );

  // Fetch benchmark sets for the organization
  const { data: benchmarkSets, isLoading: benchmarkSetsLoading, error: benchmarkSetsError } = useBenchmarkSets(
    organizationContext || ""
  );

  // Default the set picker's chips: sport only when the org's teams agree on one, gender only when chosen
  const wizardGender = watch("gender");
  const teamSports = useMemo(
    () =>
      Array.from(new Set<string>(
        (teams ?? []).map((t: { sport?: string | null }) => t.sport).filter((v: unknown): v is string => !!v)
      )),
    [teams],
  );
  const benchmarkSetContext = useMemo(
    () => ({ sports: teamSports.length === 1 ? teamSports : undefined, gender: wizardGender }),
    [teamSports, wizardGender],
  );
  const benchmarkListContext = useMemo(() => ({ gender: wizardGender }), [wizardGender]);

  // Fetch every selected set; Create / Save-as-template wait for all of them to load
  const setQueries = useQueries({
    queries: selectedBenchmarkSetIds.map((setId) => ({
      queryKey: benchmarkSetKeys.detail(organizationContext || "", setId),
      queryFn: () => fetchBenchmarkSet(organizationContext || "", setId),
      staleTime: STALE_TIME.STATIC,
      enabled: !!organizationContext,
    })),
  });
  const setsReady = setQueries.every((q) => q.isSuccess);
  const setsFailed = setQueries.some((q) => q.isError);

  const { data: templates } = useReportTemplates(organizationContext || "");
  const deleteTemplate = useDeleteReportTemplate();
  const { toast } = useToast();
  // A template is applied against these lists, so wait for them (a missing list would look like "all gone")
  const templateListsReady = !metricsLoading && !benchmarksLoading && !benchmarkSetsLoading;
  const templateListsFailed = !!(metricsError || benchmarksError || benchmarkSetsError);

  // A set deleted since the template was saved (404) is dropped and counted as no longer available
  const goneSetIds = setQueries
    .map((q, i) => ((q.error as { status?: number } | null)?.status === 404 ? selectedBenchmarkSetIds[i] : null))
    .filter((id): id is string => !!id);
  const goneKey = goneSetIds.join(",");
  useEffect(() => {
    if (!goneKey) return;
    const gone = goneKey.split(",");
    setSelectedBenchmarkSetIds((ids) => ids.filter((id) => !gone.includes(id)));
    setDroppedCount((c) => c + gone.length);
  }, [goneKey]);

  // Separate site and custom benchmarks from the enabled benchmarks (memoized for performance)
  const siteBenchmarks = useMemo(
    () => enabledBenchmarks?.filter((b) => b.benchmarkType === 'site') || [],
    [enabledBenchmarks]
  );

  const customBenchmarks = useMemo(
    () => enabledBenchmarks?.filter((b) => b.benchmarkType === 'custom') || [],
    [enabledBenchmarks]
  );

  // One merged picker; split the chosen benchmarkIds back into the two form fields by type
  const allBenchmarks = useMemo(() => [...siteBenchmarks, ...customBenchmarks], [siteBenchmarks, customBenchmarks]);
  const handleBenchmarkSelection = useCallback(
    (ids: string[]) => {
      const { site, custom } = splitBenchmarkSelection(
        ids,
        new Set(siteBenchmarks.map((b) => b.benchmarkId)),
        new Set(customBenchmarks.map((b) => b.benchmarkId)),
        { site: getValues("siteBenchmarks") || [], custom: getValues("customBenchmarks") || [] },
      );
      setValue("siteBenchmarks", site);
      setValue("customBenchmarks", custom);
    },
    [siteBenchmarks, customBenchmarks, getValues, setValue],
  );
  const watchedSiteIds = watch("siteBenchmarks");
  const watchedCustomIds = watch("customBenchmarks");
  const selectedBenchmarkIds = useMemo(
    () => [...(watchedSiteIds || []), ...(watchedCustomIds || [])],
    [watchedSiteIds, watchedCustomIds],
  );

  // Overlapping sets can bring several tier groups for one metric; the team badge and PDF show only the first
  const multiTierGroup = useMemo(() => {
    if (!setsReady) return false;
    const { site, custom } = resolveBenchmarkSelection(
      setQueries.map((q) => q.data!),
      watchedSiteIds || [],
      watchedCustomIds || [],
    );
    const chosen = new Set([...site, ...custom]);
    const groups = new Map<string, Set<string>>();
    for (const b of allBenchmarks) {
      if (!chosen.has(b.benchmarkId) || !b.tierGroupId) continue;
      groups.set(b.metricCode, (groups.get(b.metricCode) ?? new Set()).add(b.tierGroupId));
    }
    return Array.from(groups.values()).some((g) => g.size > 1);
  }, [setsReady, setQueries, watchedSiteIds, watchedCustomIds, allBenchmarks]);

  const applyTemplate = (template: ReportTemplate, type: "team" | "individual") => {
    const { values, droppedCount: dropped } = templateToFormValues(template, type, {
      enabledMetricCodes: new Set((metrics ?? []).map((m) => m.metricCode)),
      availableSetIds: new Set((benchmarkSets ?? []).map((s) => s.id)),
      enabledBenchmarkIds: {
        site: new Set(siteBenchmarks.map((b) => b.benchmarkId)),
        custom: new Set(customBenchmarks.map((b) => b.benchmarkId)),
      },
    });
    setValue("metrics", values.metrics);
    setValue("siteBenchmarks", values.siteBenchmarks);
    setValue("customBenchmarks", values.customBenchmarks);
    setValue("charts", values.charts);
    setSelectedBenchmarkSetIds(values.benchmarkSetIds);
    setLoadedTemplate(template);
    setDroppedCount(dropped);
  };

  const handleTemplateChange = (id: string) => {
    const template = templates?.find((t) => t.id === id);
    if (template) {
      applyTemplate(template, reportType);
    } else {
      setLoadedTemplate(null);
      setDroppedCount(0);
    }
  };

  const handleReportTypeChange = (value: "team" | "individual") => {
    setValue("reportType", value);
    // Charts are stored per report type: show the new type's choices, keep the rest as picked
    if (loadedTemplate) {
      setValue("charts", templateCharts(loadedTemplate, value));
    }
  };

  // Chart selection items shown in the step-8 "Charts to include" panel.
  // Individual and team reports show different chart sets (team doesn't use
  // the individual-only `distribution` histogram — it uses `boxSwarm` instead).
  type ChartItemKey = keyof NonNullable<ReportFormData["charts"]>;
  const individualChartItems: ReadonlyArray<readonly [ChartItemKey, string, string]> = [
    ['radar', 'All-around profile (radar)', 'Percentile shape across all metrics (needs ≥3 metrics)'],
    ['benchmarkStanding', 'Benchmark standing', 'Where the athlete sits vs each benchmark'],
    ['trends', 'Progress over time', 'Trend line per metric (needs ≥2 measurements)'],
    ['distribution', 'Where you stand (distribution)', 'The group spread with the athlete marked'],
    // Only offered when the sprint-FV module is enabled for the site AND org.
    ...(fvEnabled
      ? [['fvProfile', 'Force-Velocity profile', 'Latest sprint F-V profile in the report window (KPIs, chart, analysis)'] as const]
      : []),
  ];
  const teamChartItems: ReadonlyArray<readonly [ChartItemKey, string, string]> = [
    ['benchmarkStanding', 'Benchmark standing', `Where the ${labels.team.toLowerCase()} average sits vs each benchmark`],
    ['trends', 'Progress over time', `${labels.team} average trend line per metric (needs ≥2 measurements)`],
    ['boxSwarm', 'Distribution (box + swarm)', `The spread of every ${labels.athlete.toLowerCase()}'s performance per metric`],
    ['leaderboard', 'Leaderboard', `Ranked bar chart of ${labels.athletes.toLowerCase()} per metric`],
    ['tierDistribution', 'Tier distribution', `${labels.team} composition across benchmark tiers`],
  ];
  const renderChartCheckboxes = (items: ReadonlyArray<readonly [ChartItemKey, string, string]>) => (
    <>
      {items.map(([key, title, desc]) => (
        <div key={key} className="flex items-start gap-x-2">
          <Checkbox id={`chart-${key}`} checked={!comparisonChartOff(key) && (charts?.[key] ?? true)}
            disabled={comparisonChartOff(key)}
            onCheckedChange={(v) => setValue(`charts.${key}` as const, v as boolean)} className="mt-1" />
          <div>
            <Label htmlFor={`chart-${key}`} className="cursor-pointer font-medium">{title}</Label>
            <p className="text-sm text-muted-foreground">{desc}</p>
          </div>
        </div>
      ))}
    </>
  );

  const handleNext = (e?: React.MouseEvent) => {
    e?.preventDefault();

    // Validate report name on step 3 before progressing
    if (step === 3 && (!reportName || reportName.trim() === "")) {
      return;
    }

    if (step < totalSteps) {
      // Skip athlete selection step for team reports
      if (step === 1 && reportType === "team") {
        setStep(3); // Skip step 2 (athlete selection)
      } else {
        setStep(step + 1);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      // Skip athlete selection step for team reports when going back
      if (step === 3 && reportType === "team") {
        setStep(1); // Skip step 2 (athlete selection)
      } else {
        setStep(step - 1);
      }
    }
  };

  const onSubmit = async (data: ReportFormData) => {
    // Prevent submission if not on final step
    if (step !== totalSteps) {
      return;
    }

    if (!organizationContext || !setsReady) {
      return;
    }

    // Extra validation for individual reports
    if (data.reportType === "individual") {
      if (!data.athleteIds || data.athleteIds.length === 0) {
        // The Zod schema should have prevented this, but double-check
        return;
      }
    }

    const config: any = {
      timeframe: {
        type: data.timeframeType,
        ...(data.timeframeType === "preset"
          ? { preset: data.timeframePreset }
          : { customStart: data.timeframeStart, customEnd: data.timeframeEnd }),
      },
      metrics: data.metrics,
      athleteIds: data.athleteIds,
      audience: data.audience,
      ...(data.reportType === "individual" && { groupComparison: data.groupComparison }),
    };

    // Sets and individual picks combine into one deduped list; the sets are recorded for traceability
    const sets = setQueries.map((q) => q.data!);
    const { site, custom } = resolveBenchmarkSelection(sets, data.siteBenchmarks || [], data.customBenchmarks || []);
    if (site.length || custom.length) {
      config.benchmarks = {
        site,
        custom,
        ...(sets.length && { setIds: sets.map((s) => s.id), setNames: sets.map((s) => s.name) }),
      };
    }

    if (data.enableCompositeIndex && data.reportType === "team") {
      config.compositeIndex = {
        enabled: true,
        weights: data.compositeWeights,
      };
    }

    // Each report type only persists the chart keys it actually uses, so the
    // stored config doesn't carry inert fields from the other report type
    // (e.g. team reports use `boxSwarm`, not `distribution`, and vice versa).
    config.charts = data.reportType === "team"
      ? {
          benchmarkStanding: data.charts.benchmarkStanding,
          trends: data.charts.trends,
          boxSwarm: data.charts.boxSwarm,
          leaderboard: data.charts.leaderboard,
          tierDistribution: data.charts.tierDistribution,
        }
      : {
          radar: data.groupComparison && data.charts.radar,
          benchmarkStanding: data.charts.benchmarkStanding,
          trends: data.charts.trends,
          distribution: data.groupComparison && data.charts.distribution,
          // Never persist true while the sprint-FV feature is off for this org.
          fvProfile: fvEnabled ? data.charts.fvProfile : false,
        };

    // An individual report without group comparison has no cohort to filter
    const hasCohort = data.reportType === "team" || data.groupComparison;
    if (hasCohort && (data.teamIds?.length || data.gender || data.positions?.length)) {
      config.filters = {
        teamIds: data.teamIds,
        gender: data.gender,
        positions: data.positions,
      };
    }

    const result = await createReport.mutateAsync({
      name: data.name,
      description: data.description,
      reportType: data.reportType,
      config,
      organizationId: organizationContext,
    });

    // Handle batch creation (multiple athletes) vs single report
    if ('reports' in result && Array.isArray(result.reports)) {
      // Batch creation - pass array of report IDs
      const reportIds = result.reports.map((r: any) => r.id);
      onSuccess(reportIds);
    } else {
      // Single report creation
      onSuccess(result.id);
    }
  };

  const toggleMetric = (metricCode: string) => {
    const current = selectedMetrics || [];
    if (current.includes(metricCode)) {
      setValue("metrics", current.filter((m) => m !== metricCode));
    } else {
      setValue("metrics", [...current, metricCode]);
    }
  };

  const progress = (step / totalSteps) * 100;

  // Determine if Next button should be disabled
  const isNextDisabled = step === 3 && (!reportName || reportName.trim() === "");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Report</DialogTitle>
          <DialogDescription>
            Step {step} of {totalSteps}
          </DialogDescription>
        </DialogHeader>

        <Progress value={progress} className="mb-4" />

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6"
          onKeyDown={(e) => {
            // Prevent Enter key from submitting form except when explicitly clicking submit button
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
              e.preventDefault();
            }
          }}
        >
          {/* Step 1: Report Type */}
          {step === 1 && (
            <div className="grid gap-y-4">
              <Label>Report Type</Label>
              <RadioGroup
                value={reportType}
                onValueChange={(value) => handleReportTypeChange(value as "team" | "individual")}
              >
                <div className="flex items-center gap-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="team" id="team" />
                  <Label htmlFor="team" className="cursor-pointer flex-1">
                    <div className="font-semibold">{labels.team} Report</div>
                    <div className="text-sm text-muted-foreground">
                      {labels.team}-wide performance analysis with rankings and composite index
                    </div>
                  </Label>
                </div>
                <div className="flex items-center gap-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="individual" id="individual" />
                  <Label htmlFor="individual" className="cursor-pointer flex-1">
                    <div className="font-semibold">Individual Report</div>
                    <div className="text-sm text-muted-foreground">
                      Individual {labels.athlete.toLowerCase()} performance with {labels.team.toLowerCase()} rank and percentiles
                    </div>
                  </Label>
                </div>
              </RadioGroup>
              {errors.reportType && (
                <p className="text-sm text-destructive">{errors.reportType.message}</p>
              )}

              {templates && templates.length > 0 && (
                <div className="grid gap-y-2">
                  <Label htmlFor="report-template">Start from template (optional)</Label>
                  <div className="flex items-center gap-x-2">
                    <Select value={loadedTemplate?.id ?? "none"} onValueChange={handleTemplateChange} disabled={!templateListsReady || templateListsFailed}>
                      <SelectTrigger id="report-template">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {loadedTemplate && (
                      <ConfirmationDialog
                        title="Delete template?"
                        description={`"${loadedTemplate.name}" will be removed for everyone in your organization. Existing reports are not affected.`}
                        confirmText="Delete"
                        onConfirm={() =>
                          deleteTemplate.mutate(loadedTemplate.id, {
                            onSuccess: () => handleTemplateChange("none"),
                            onError: () =>
                              toast({ title: "Could not delete the template", description: "Please try again.", variant: "destructive" }),
                          })
                        }
                      >
                        <Button type="button" variant="outline" size="icon" aria-label="Delete template">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </ConfirmationDialog>
                    )}
                  </div>
                  {templateListsFailed && (
                    <p role="alert" className="text-sm text-destructive">
                      Templates are unavailable because metrics, benchmarks or benchmark sets failed to load.
                    </p>
                  )}
                  {loadedTemplate && droppedCount > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {droppedCount} {droppedCount === 1 ? "item is" : "items are"} no longer available and {droppedCount === 1 ? "was" : "were"} left out.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Athlete Selection (Individual Reports Only) */}
          {step === 2 && reportType === "individual" && (
            <div className="grid gap-y-4">
              <Label>Select {labels.athletes}</Label>
              <p className="text-sm text-muted-foreground">
                Choose individual {labels.athletes.toLowerCase()} or select entire {labels.teams.toLowerCase()}. One report will be created for each {labels.athlete.toLowerCase()}.
              </p>

              <TeamAthleteSelector
                organizationId={organizationContext!}
                selectedAthleteIds={watch("athleteIds") || []}
                onSelectionChange={(ids) => {
                  setValue("athleteIds", ids);
                }}
              />

              {errors.athleteIds && (
                <p className="text-sm text-destructive">{errors.athleteIds.message}</p>
              )}
            </div>
          )}

          {/* Step 2 for Team Reports - Skip to Step 3 */}
          {step === 2 && reportType === "team" && (
            <div className="space-y-4">
              <p className="text-muted-foreground">Athlete selection is only for individual reports. Proceeding to report details...</p>
            </div>
          )}

          {/* Step 3: Basic Details */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Report Name *</Label>
                <Input
                  id="name"
                  {...register("name")}
                  placeholder={`e.g., Spring 2025 ${labels.team} Performance`}
                />
                {errors.name && (
                  <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  {...register("description")}
                  placeholder="Add a description for this report"
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* Step 4: Timeframe */}
          {step === 4 && (
            <div className="grid gap-y-4">
              <Label>Timeframe</Label>
              <RadioGroup
                value={timeframeType}
                onValueChange={(value) => setValue("timeframeType", value as any)}
              >
                <div className="flex items-center gap-x-2">
                  <RadioGroupItem value="preset" id="preset" />
                  <Label htmlFor="preset">Preset</Label>
                </div>
                <div className="flex items-center gap-x-2">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom">Custom Date Range</Label>
                </div>
              </RadioGroup>

              {timeframeType === "preset" && (
                <Select
                  value={watch("timeframePreset")}
                  onValueChange={(value) => setValue("timeframePreset", value as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timeframe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="season">Current Season</SelectItem>
                    <SelectItem value="year">Current Year</SelectItem>
                    <SelectItem value="all_time">All Time</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {timeframeType === "custom" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="timeframeStart">Start Date</Label>
                    <Input
                      id="timeframeStart"
                      type="date"
                      {...register("timeframeStart")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="timeframeEnd">End Date</Label>
                    <Input id="timeframeEnd" type="date" {...register("timeframeEnd")} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Metrics Selection */}
          {step === 5 && (
            <div className="grid gap-y-4">
              <Label>Select Metrics *</Label>
              {metricsLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : metricsError ? (
                <div className="border border-destructive rounded-lg p-4 text-center">
                  <p className="text-destructive">Failed to load metrics</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {metricsError instanceof Error ? metricsError.message : "Please try again"}
                  </p>
                </div>
              ) : !metrics || metrics.length === 0 ? (
                <div className="border rounded-lg p-4 text-center text-muted-foreground">
                  <p>No metrics enabled for this organization</p>
                  <p className="text-sm mt-1">Please enable metrics in Settings first</p>
                </div>
              ) : (
                <div className="space-y-2 border rounded-lg p-4 max-h-96 overflow-y-auto">
                  {metrics.map((metric) => {
                    const metricCode = metric.metricCode;
                    const displayName = metric.customLabel || metric.siteMetric.label;
                    return (
                      <div key={metricCode} className="flex items-center gap-x-2">
                        <Checkbox
                          id={metricCode}
                          checked={selectedMetrics?.includes(metricCode)}
                          onCheckedChange={() => toggleMetric(metricCode)}
                        />
                        <Label htmlFor={metricCode} className="cursor-pointer flex-1">
                          <div className="font-medium">{displayName}</div>
                          <div className="text-sm text-muted-foreground">
                            {metric.siteMetric.unit} • {metric.siteMetric.category}
                          </div>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}
              {errors.metrics && (
                <p className="text-sm text-destructive">{errors.metrics.message}</p>
              )}
            </div>
          )}

          {/* Step 6: Benchmarks (Optional) */}
          {step === 6 && (
            <div className="grid gap-y-4">
              <Label>Benchmarks (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Add benchmark sets, pick individual benchmarks, or both. The report uses everything chosen.
              </p>

              <div className="space-y-2">
                <h3 className="text-sm font-medium leading-none">Benchmark sets</h3>
                {selectedBenchmarkSetIds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedBenchmarkSetIds.map((setId, idx) => {
                      const name = setQueries[idx]?.data?.name ?? benchmarkSets?.find((s) => s.id === setId)?.name ?? "Benchmark set";
                      return (
                        <Badge key={setId} variant="secondary" className="gap-1">
                          {name}
                          <button
                            type="button"
                            aria-label={`Remove ${name}`}
                            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setSelectedBenchmarkSetIds((ids) => ids.filter((id) => id !== setId))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                {!benchmarkSetsLoading && benchmarkSets && benchmarkSets.length > 0 && (
                  <BenchmarkSetCombobox
                    organizationId={organizationContext || ""}
                    value={null}
                    onChange={(id) =>
                      id && setSelectedBenchmarkSetIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
                    }
                    context={benchmarkSetContext}
                    placeholder="Add a benchmark set"
                  />
                )}
                {setQueries.map((q, idx) => {
                  const setId = selectedBenchmarkSetIds[idx];
                  if (q.isError) {
                    return (
                      <div key={setId} role="alert" className="border border-destructive rounded-lg p-3 text-sm text-destructive">
                        Failed to load a benchmark set. Remove it or retry before continuing.
                        <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => q.refetch()}>
                          Retry
                        </Button>
                      </div>
                    );
                  }
                  return q.data ? (
                    <BenchmarkSetPreview key={setId} set={q.data} />
                  ) : (
                    <div key={setId} role="status" aria-label="Loading benchmark set" className="flex justify-center py-4">
                      <LoadingSpinner />
                    </div>
                  );
                })}
                {multiTierGroup && (
                  <div role="alert" className="flex items-start gap-x-2 border border-amber-500/50 rounded-lg p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                    <span>
                      The chosen sets include more than one tier group for the same metric. Tier distribution
                      charts show all of them, but the team table badge and PDF label use only the first.
                    </span>
                  </div>
                )}
              </div>

              <h3 className="text-sm font-medium leading-none">Individual benchmarks</h3>
              {benchmarksLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : (
                <>
                  {benchmarksError && (
                    <div className="border border-destructive rounded-lg p-4 text-center">
                      <p className="text-sm text-destructive">Failed to load benchmarks</p>
                    </div>
                  )}

                  {allBenchmarks.length > 0 && (
                    <BenchmarkChecklist
                      items={allBenchmarks}
                      getKey={getBenchmarkKey}
                      getLabel={getBenchmarkLabel}
                      getMeta={getBenchmarkMeta}
                      selected={selectedBenchmarkIds}
                      onChange={handleBenchmarkSelection}
                      context={benchmarkListContext}
                      renderDetail={(b) => (
                        <span className="text-xs text-muted-foreground">
                          {b.benchmarkType === "site" ? "Site" : "Custom"}
                        </span>
                      )}
                    />
                  )}

                  {!benchmarksError && allBenchmarks.length === 0 && (
                    <div className="border rounded-lg p-4 text-center text-muted-foreground">
                      <p>No enabled benchmarks available</p>
                      <p className="text-sm mt-1">You can skip this step or enable benchmarks in Settings</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 7: Filters (Optional) */}
          {step === 7 && (
            <div className="grid gap-y-4">
              {reportType === "individual" && (
                <div className="flex items-start gap-x-3 border rounded-lg p-4">
                  <Switch
                    id="group-comparison"
                    checked={groupComparison}
                    onCheckedChange={(v) => setValue("groupComparison", v)}
                  />
                  <div>
                    <Label htmlFor="group-comparison" className="cursor-pointer font-medium">Compare to a group</Label>
                    <p className="text-sm text-muted-foreground">
                      Show group average, percentile, radar and distribution. Off: results and benchmarks only.
                    </p>
                  </div>
                </div>
              )}

              {(reportType === "team" || groupComparison) && (<>
              <Label>Filters (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Filter athletes included in the report
              </p>

              <div>
                <Label>{labels.teams}</Label>
                {teamsLoading ? (
                  <div className="flex justify-center py-4">
                    <LoadingSpinner />
                  </div>
                ) : teamsError ? (
                  <div className="border border-destructive rounded-lg p-4 text-center">
                    <p className="text-sm text-destructive">Failed to load {labels.teams.toLowerCase()}</p>
                  </div>
                ) : !teams || teams.length === 0 ? (
                  <div className="border rounded-lg p-4 text-center text-muted-foreground">
                    <p className="text-sm">No {labels.teams.toLowerCase()} available</p>
                  </div>
                ) : (
                  <div className="space-y-2 border rounded-lg p-4 max-h-48 overflow-y-auto">
                    {teams.map((team: any) => (
                      <div key={team.id} className="flex items-center gap-x-2">
                        <Checkbox
                          id={`team-${team.id}`}
                          checked={watch("teamIds")?.includes(team.id)}
                          onCheckedChange={(checked) => {
                            const current = watch("teamIds") || [];
                            setValue(
                              "teamIds",
                              checked
                                ? [...current, team.id]
                                : current.filter((id) => id !== team.id)
                            );
                          }}
                        />
                        <Label htmlFor={`team-${team.id}`} className="cursor-pointer">
                          {team.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="gender">Gender</Label>
                <Select
                  value={watch("gender")}
                  onValueChange={(value) => setValue("gender", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All genders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              </>)}
            </div>
          )}

          {/* Step 8: Audience + Composite Index (Team Reports) / Audience + Review (Individual) */}
          {step === 8 && (
            <div className="grid gap-y-4 mb-4">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Who will read this report?
              </Label>
              <RadioGroup
                value={watch("audience")}
                onValueChange={(value) => setValue("audience", value as "coach" | "athlete" | "parent", { shouldDirty: true })}
              >
                <div className="flex items-center gap-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="coach" id="audience-coach" />
                  <Label htmlFor="audience-coach" className="cursor-pointer flex-1">
                    <div className="font-semibold">Coach</div>
                    <div className="text-sm text-muted-foreground">
                      Direct, objective coaching language with actionable training recommendations
                    </div>
                  </Label>
                </div>
                {/* Athlete and Parent audiences only apply to individual reports */}
                {reportType === "individual" && (
                  <>
                    <div className="flex items-center gap-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent">
                      <RadioGroupItem value="athlete" id="audience-athlete" />
                      <Label htmlFor="audience-athlete" className="cursor-pointer flex-1">
                        <div className="font-semibold">Athlete</div>
                        <div className="text-sm text-muted-foreground">
                          Motivating "you" language — honest, specific, and to the point
                        </div>
                      </Label>
                    </div>
                    <div className="flex items-center gap-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent">
                      <RadioGroupItem value="parent" id="audience-parent" />
                      <Label htmlFor="audience-parent" className="cursor-pointer flex-1">
                        <div className="font-semibold">Parent</div>
                        <div className="text-sm text-muted-foreground">
                          Clear non-technical language explaining what the numbers mean for their child
                        </div>
                      </Label>
                    </div>
                  </>
                )}
              </RadioGroup>
            </div>
          )}

          {step === 8 && reportType === "team" && (
            <div className="space-y-4">
              <Separator />
              <Label className="block">Composite Index (Optional)</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Create a weighted composite score across multiple metrics to rank athletes
              </p>
              <div className="flex items-center gap-x-2">
                <Checkbox
                  id="enableCompositeIndex"
                  checked={enableCompositeIndex}
                  onCheckedChange={(checked) =>
                    setValue("enableCompositeIndex", checked as boolean)
                  }
                />
                <Label htmlFor="enableCompositeIndex" className="cursor-pointer">
                  Enable Composite Index
                </Label>
              </div>

              {enableCompositeIndex && selectedMetrics.length > 0 && (
                <div className="space-y-3 border rounded-lg p-4 bg-accent/50">
                  <p className="text-sm font-medium">
                    Assign weights to each metric (must sum to 1.0)
                  </p>
                  {selectedMetrics.map((metricCode) => (
                    <div key={metricCode} className="flex items-center gap-2">
                      <Label className="flex-1">{metricCode}</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        className="w-24"
                        placeholder="0.0"
                        onChange={(e) => {
                          const weights = watch("compositeWeights") || {};
                          setValue("compositeWeights", {
                            ...weights,
                            [metricCode]: parseFloat(e.target.value) || 0,
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {!enableCompositeIndex && (
                <p className="text-sm text-muted-foreground">
                  Skip composite index to create a report without athlete rankings. Click "Create Report" to continue.
                </p>
              )}

              <Separator />
              <div className="border rounded-lg p-4 bg-muted/30 grid gap-y-4">
                <Label className="font-medium">Charts to include</Label>
                {renderChartCheckboxes(teamChartItems)}
              </div>
            </div>
          )}

          {/* Step 8 for Individual Reports - Summary */}
          {step === 8 && reportType === "individual" && (
            <div className="grid gap-y-4">
              <Label>Review</Label>
              <div className="border rounded-lg p-4 space-y-2">
                <p className="text-sm">
                  <strong>Type:</strong> Individual Report
                </p>
                <p className="text-sm">
                  <strong>Metrics:</strong> {selectedMetrics.length} selected
                </p>
                <p className="text-sm">
                  <strong>Audience:</strong>{" "}
                  {watch("audience") === "coach"
                    ? "Coach"
                    : watch("audience") === "athlete"
                    ? "Athlete"
                    : "Parent"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Click "Create Report" to finish
                </p>
              </div>
              <div className="border rounded-lg p-4 bg-muted/30 grid gap-y-4">
                <Label className="font-medium">Charts to include</Label>
                {renderChartCheckboxes(individualChartItems)}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={step === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>

            {step < totalSteps ? (
              <Button type="button" onClick={handleNext} disabled={isNextDisabled}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <div className="flex gap-x-2">
                <Button type="button" variant="outline" onClick={() => setSaveTemplateOpen(true)} disabled={!setsReady || setsFailed || selectedMetrics.length === 0}>
                  Save as template
                </Button>
                <Button type="submit" disabled={createReport.isPending || !setsReady || setsFailed}>
                  {createReport.isPending ? <LoadingSpinner /> : "Create Report"}
                </Button>
              </div>
            )}
          </div>
        </form>
      </DialogContent>
      <SaveReportTemplateDialog
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        organizationId={organizationContext || ""}
        payload={formToTemplate(
          { ...getValues(), benchmarkSetIds: selectedBenchmarkSetIds },
          reportType,
          loadedTemplate ?? undefined,
        )}
        loadedTemplate={loadedTemplate ?? undefined}
        onSaved={setLoadedTemplate}
      />
    </Dialog>
  );
}
