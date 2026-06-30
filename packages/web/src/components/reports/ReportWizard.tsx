import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useCreateReport } from "@/hooks/use-reports";
import { useOrganizationMetrics } from "@/lib/metrics-api";
import { useOrganizationBenchmarks } from "@/lib/benchmarks-api";
import { useBenchmarkSets, useBenchmarkSet } from "@/lib/benchmark-sets-api";
import { BenchmarkSetPreview } from "@/components/benchmark-sets";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ChevronLeft, ChevronRight, Layers, List, Users } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { TeamAthleteSelector } from "@/components/ui/team-athlete-selector";
import type { OrganizationBenchmarkWithDetails } from "@shared/schema";
import { deriveTierGroupName } from "./report-utils";
import { useContextualLabels } from "@/hooks/useContextualLabels";

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
  charts: z.object({
    radar: z.boolean().default(true),
    benchmarkStanding: z.boolean().default(true),
    trends: z.boolean().default(true),
    distribution: z.boolean().default(true),
  }).default({ radar: true, benchmarkStanding: true, trends: true, distribution: true }),
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

  // Benchmark selection mode: 'individual' for checkboxes, 'set' for selecting from a benchmark set
  const [benchmarkSelectionMode, setBenchmarkSelectionMode] = useState<'individual' | 'set'>('individual');
  const [selectedBenchmarkSetId, setSelectedBenchmarkSetId] = useState<string | null>(null);

  const {
    register,
    watch,
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
      charts: { radar: true, benchmarkStanding: true, trends: true, distribution: true },
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

  // Fetch enabled benchmarks for the organization using standardized hook
  const { data: enabledBenchmarks, isLoading: benchmarksLoading, error: benchmarksError } = useOrganizationBenchmarks(
    organizationContext || "",
    false // includeInactive - only get active benchmarks
  );

  // Fetch benchmark sets for the organization
  const { data: benchmarkSets, isLoading: benchmarkSetsLoading } = useBenchmarkSets(
    organizationContext || ""
  );

  // Fetch selected benchmark set details
  const { data: selectedBenchmarkSet } = useBenchmarkSet(
    organizationContext || "",
    selectedBenchmarkSetId || ""
  );

  // Separate site and custom benchmarks from the enabled benchmarks (memoized for performance)
  const siteBenchmarks = useMemo(
    () => enabledBenchmarks?.filter((b) => b.benchmarkType === 'site') || [],
    [enabledBenchmarks]
  );

  const customBenchmarks = useMemo(
    () => enabledBenchmarks?.filter((b) => b.benchmarkType === 'custom') || [],
    [enabledBenchmarks]
  );

  // Helper to render grouped benchmark checkboxes (used for both site and custom)
  const renderBenchmarkCheckboxes = (benchmarks: any[], fieldName: "siteBenchmarks" | "customBenchmarks", idPrefix: string) => {
    const tierGroups = new Map<string, any[]>();
    const individualBenchmarks: any[] = [];
    for (const benchmark of benchmarks) {
      if (benchmark.tierGroupId) {
        const group = tierGroups.get(benchmark.tierGroupId) || [];
        group.push(benchmark);
        tierGroups.set(benchmark.tierGroupId, group);
      } else {
        individualBenchmarks.push(benchmark);
      }
    }
    return (
      <>
        {Array.from(tierGroups.entries()).map(([groupId, tiers]) => {
          const groupName = tiers[0]?.name ? deriveTierGroupName(tiers[0].name) : groupId;
          const tierIds = tiers.map(t => t.benchmarkId);
          const selectedIds = watch(fieldName) || [];
          const allSelected = tierIds.every(id => selectedIds.includes(id));
          const someSelected = !allSelected && tierIds.some(id => selectedIds.includes(id));
          return (
            <div key={groupId} className="flex items-center space-x-2">
              <Checkbox
                id={`${idPrefix}-group-${groupId}`}
                checked={someSelected ? 'indeterminate' : allSelected}
                onCheckedChange={(checked) => {
                  const current = watch(fieldName) || [];
                  if (checked) {
                    setValue(fieldName, [...new Set([...current, ...tierIds])]);
                  } else {
                    setValue(fieldName, current.filter((id: string) => !tierIds.includes(id)));
                  }
                }}
              />
              <Label htmlFor={`${idPrefix}-group-${groupId}`} className="cursor-pointer">
                {groupName} <span className="text-muted-foreground text-xs">({tiers.length} tiers)</span>
              </Label>
            </div>
          );
        })}
        {individualBenchmarks.map((benchmark: any) => (
          <div key={benchmark.id} className="flex items-center space-x-2">
            <Checkbox
              id={`${idPrefix}-${benchmark.id}`}
              checked={watch(fieldName)?.includes(benchmark.benchmarkId)}
              onCheckedChange={(checked) => {
                const current = watch(fieldName) || [];
                setValue(
                  fieldName,
                  checked
                    ? [...current, benchmark.benchmarkId]
                    : current.filter((id: string) => id !== benchmark.benchmarkId)
                );
              }}
            />
            <Label htmlFor={`${idPrefix}-${benchmark.id}`} className="cursor-pointer">
              {benchmark.name}
            </Label>
          </div>
        ))}
      </>
    );
  };

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

    if (!organizationContext) {
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
    };

    // Handle benchmarks - either from set or individual selection
    if (benchmarkSelectionMode === 'set' && selectedBenchmarkSet?.items?.length) {
      // Using a benchmark set - extract benchmark IDs from set items
      const siteBenchmarkIds = selectedBenchmarkSet.items
        .filter(item => item.benchmarkType === 'site')
        .map(item => item.benchmarkId);
      const customBenchmarkIds = selectedBenchmarkSet.items
        .filter(item => item.benchmarkType === 'custom')
        .map(item => item.benchmarkId);

      config.benchmarks = {
        site: siteBenchmarkIds,
        custom: customBenchmarkIds,
        // Store set reference for traceability
        setId: selectedBenchmarkSet.id,
        setName: selectedBenchmarkSet.name,
      };
    } else if (data.siteBenchmarks?.length || data.customBenchmarks?.length) {
      config.benchmarks = {
        site: data.siteBenchmarks,
        custom: data.customBenchmarks,
      };
    }

    if (data.enableCompositeIndex && data.reportType === "team") {
      config.compositeIndex = {
        enabled: true,
        weights: data.compositeWeights,
      };
    }

    config.charts = data.charts;

    if (data.teamIds?.length || data.gender || data.positions?.length) {
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
            <div className="space-y-4">
              <Label>Report Type</Label>
              <RadioGroup
                value={reportType}
                onValueChange={(value) => setValue("reportType", value as any)}
              >
                <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="team" id="team" />
                  <Label htmlFor="team" className="cursor-pointer flex-1">
                    <div className="font-semibold">{labels.team} Report</div>
                    <div className="text-sm text-muted-foreground">
                      {labels.team}-wide performance analysis with rankings and composite index
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
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
            </div>
          )}

          {/* Step 2: Athlete Selection (Individual Reports Only) */}
          {step === 2 && reportType === "individual" && (
            <div className="space-y-4">
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
            <div className="space-y-4">
              <Label>Timeframe</Label>
              <RadioGroup
                value={timeframeType}
                onValueChange={(value) => setValue("timeframeType", value as any)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="preset" id="preset" />
                  <Label htmlFor="preset">Preset</Label>
                </div>
                <div className="flex items-center space-x-2">
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
            <div className="space-y-4">
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
                      <div key={metricCode} className="flex items-center space-x-2">
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
            <div className="space-y-4">
              <Label>Benchmarks (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Select benchmarks to compare against in the report
              </p>

              {/* Selection Mode Toggle */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={benchmarkSelectionMode === 'individual' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setBenchmarkSelectionMode('individual');
                    setSelectedBenchmarkSetId(null);
                  }}
                >
                  <List className="h-4 w-4 mr-2" />
                  Select Individual
                </Button>
                <Button
                  type="button"
                  variant={benchmarkSelectionMode === 'set' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setBenchmarkSelectionMode('set');
                    // Clear individual selections when switching to set mode
                    setValue("siteBenchmarks", []);
                    setValue("customBenchmarks", []);
                  }}
                  disabled={!benchmarkSets || benchmarkSets.length === 0}
                >
                  <Layers className="h-4 w-4 mr-2" />
                  Select from Set
                </Button>
              </div>

              {/* Set Selection Mode */}
              {benchmarkSelectionMode === 'set' && (
                <div className="space-y-4">
                  {benchmarkSetsLoading ? (
                    <div className="flex justify-center py-8">
                      <LoadingSpinner />
                    </div>
                  ) : !benchmarkSets || benchmarkSets.length === 0 ? (
                    <div className="border rounded-lg p-4 text-center text-muted-foreground">
                      <p>No benchmark sets available</p>
                      <p className="text-sm mt-1">Create benchmark sets in Benchmark Sets management</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label className="mb-2 block">Select a Benchmark Set</Label>
                        <Select
                          value={selectedBenchmarkSetId || ""}
                          onValueChange={(value) => {
                            setSelectedBenchmarkSetId(value || null);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a benchmark set" />
                          </SelectTrigger>
                          <SelectContent>
                            {benchmarkSets.map((set) => (
                              <SelectItem key={set.id} value={set.id}>
                                <div className="flex items-center gap-2">
                                  <Layers className="h-4 w-4 text-muted-foreground" />
                                  <span>{set.name}</span>
                                  {set.sport && (
                                    <span className="text-xs text-muted-foreground">({set.sport})</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Preview of selected set */}
                      {selectedBenchmarkSet && (
                        <BenchmarkSetPreview set={selectedBenchmarkSet} />
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Individual Selection Mode */}
              {benchmarkSelectionMode === 'individual' && (
                <>
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

                      {siteBenchmarks && siteBenchmarks.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Site Benchmarks</h4>
                          <div className="space-y-2 border rounded-lg p-4 max-h-48 overflow-y-auto">
                            {renderBenchmarkCheckboxes(siteBenchmarks, "siteBenchmarks", "site")}
                          </div>
                        </div>
                      )}

                      {customBenchmarks && customBenchmarks.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Custom Benchmarks</h4>
                          <div className="space-y-2 border rounded-lg p-4 max-h-48 overflow-y-auto">
                            {renderBenchmarkCheckboxes(customBenchmarks, "customBenchmarks", "custom")}
                          </div>
                        </div>
                      )}

                      {!benchmarksError &&
                       (!siteBenchmarks || siteBenchmarks.length === 0) &&
                       (!customBenchmarks || customBenchmarks.length === 0) && (
                        <div className="border rounded-lg p-4 text-center text-muted-foreground">
                          <p>No enabled benchmarks available</p>
                          <p className="text-sm mt-1">You can skip this step or enable benchmarks in Settings</p>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 7: Filters (Optional) */}
          {step === 7 && (
            <div className="space-y-4">
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
                      <div key={team.id} className="flex items-center space-x-2">
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
            </div>
          )}

          {/* Step 8: Audience + Composite Index (Team Reports) / Audience + Review (Individual) */}
          {step === 8 && (
            <div className="space-y-4 mb-4">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Who will read this report?
              </Label>
              <RadioGroup
                value={watch("audience")}
                onValueChange={(value) => setValue("audience", value as "coach" | "athlete" | "parent", { shouldDirty: true })}
              >
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent">
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
                    <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent">
                      <RadioGroupItem value="athlete" id="audience-athlete" />
                      <Label htmlFor="audience-athlete" className="cursor-pointer flex-1">
                        <div className="font-semibold">Athlete</div>
                        <div className="text-sm text-muted-foreground">
                          Motivating "you" language — honest, specific, and to the point
                        </div>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent">
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
              <Label>Composite Index (Optional)</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Create a weighted composite score across multiple metrics to rank athletes
              </p>
              <div className="flex items-center space-x-2">
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
            </div>
          )}

          {/* Step 8 for Individual Reports - Summary */}
          {step === 8 && reportType === "individual" && (
            <div className="space-y-4">
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
              <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
                <Label className="font-medium">Charts to include</Label>
                {([
                  ['radar', 'All-around profile (radar)', 'Percentile shape across all metrics (needs ≥3 metrics)'],
                  ['benchmarkStanding', 'Benchmark standing', 'Where the athlete sits vs each benchmark'],
                  ['trends', 'Progress over time', 'Trend line per metric (needs ≥2 measurements)'],
                  ['distribution', 'Where you stand (distribution)', 'The group spread with the athlete marked'],
                ] as const).map(([key, title, desc]) => (
                  <div key={key} className="flex items-start space-x-2">
                    <Checkbox id={`chart-${key}`} checked={charts?.[key] ?? true}
                      onCheckedChange={(v) => setValue(`charts.${key}` as const, v as boolean)} className="mt-1" />
                    <div>
                      <Label htmlFor={`chart-${key}`} className="cursor-pointer font-medium">{title}</Label>
                      <p className="text-sm text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
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
              <Button type="submit" disabled={createReport.isPending}>
                {createReport.isPending ? <LoadingSpinner /> : "Create Report"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
