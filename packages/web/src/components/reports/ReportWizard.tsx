import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useCreateReport } from "@/hooks/use-reports";
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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TeamAthleteSelector } from "@/components/ui/team-athlete-selector";
import type { OrganizationBenchmarkWithDetails } from "@shared/schema";
import { useSiteBenchmarkGroups, useCustomBenchmarkGroups } from "@/lib/benchmark-groups-api";

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
  siteGroups: z.array(z.string()).optional(),
  customGroups: z.array(z.string()).optional(),
  teamIds: z.array(z.string()).optional(),
  gender: z.string().optional(),
  positions: z.array(z.string()).optional(),
  enableCompositeIndex: z.boolean().default(false),
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
  const { organizationContext } = useAuth();
  const [step, setStep] = useState(1);
  const totalSteps = 8;

  const {
    register,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<ReportFormData>({
    resolver: zodResolver(reportConfigSchema),
    defaultValues: {
      reportType: "team",
      athleteIds: [],
      timeframeType: "preset",
      timeframePreset: "all_time",
      metrics: [],
      siteBenchmarks: [],
      customBenchmarks: [],
      siteGroups: [],
      customGroups: [],
      teamIds: [],
      positions: [],
      enableCompositeIndex: false,
    },
  });

  const createReport = useCreateReport();

  // Watch form values
  const reportType = watch("reportType");

  // Debug logging
  useEffect(() => {
    console.log('[ReportWizard] State changed - step:', step, 'reportType:', reportType);
  }, [step, reportType]);
  const timeframeType = watch("timeframeType");
  const selectedMetrics = watch("metrics");
  const enableCompositeIndex = watch("enableCompositeIndex");

  // Fetch organization's enabled metrics
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ["/api/metrics", organizationContext],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${organizationContext}/metrics?enabledOnly=true`);
      return res.json();
    },
    enabled: !!organizationContext,
  });

  // Fetch teams
  const { data: teams, isLoading: teamsLoading, error: teamsError } = useQuery({
    queryKey: ["/api/teams", organizationContext],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/teams?organizationId=${organizationContext}`);
      return res.json();
    },
    enabled: !!organizationContext,
  });

  // Fetch enabled benchmarks for the organization (includes both site and custom benchmarks)
  const { data: enabledBenchmarks, isLoading: benchmarksLoading, error: benchmarksError } = useQuery<OrganizationBenchmarkWithDetails[]>({
    queryKey: ["/api/benchmarks", organizationContext],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${organizationContext}/benchmarks`);
      return res.json();
    },
    enabled: !!organizationContext,
  });

  // Separate site and custom benchmarks from the enabled benchmarks (memoized for performance)
  const siteBenchmarks = useMemo(
    () => enabledBenchmarks?.filter((b) => b.benchmarkType === 'site') || [],
    [enabledBenchmarks]
  );

  const customBenchmarks = useMemo(
    () => enabledBenchmarks?.filter((b) => b.benchmarkType === 'custom') || [],
    [enabledBenchmarks]
  );

  // Fetch benchmark groups (site-wide and organization-specific)
  const { data: siteBenchmarkGroups, isLoading: siteGroupsLoading } = useSiteBenchmarkGroups(false, true);
  const { data: customBenchmarkGroups, isLoading: customGroupsLoadingRaw } = useCustomBenchmarkGroups(
    organizationContext || "",
    false,
    true
  );

  // When organizationContext is not set, the custom groups query is disabled
  // React Query sets isLoading=true for disabled queries, so we need to handle this
  const customGroupsLoading = organizationContext ? customGroupsLoadingRaw : false;

  const handleNext = (e?: React.MouseEvent) => {
    e?.preventDefault();
    console.log('[ReportWizard] handleNext - current step:', step, 'reportType:', reportType);

    if (step < totalSteps) {
      // Skip athlete selection step for team reports
      if (step === 1 && reportType === "team") {
        setStep(3); // Skip step 2 (athlete selection)
      } else {
        setStep(step + 1);
      }
      console.log('[ReportWizard] Moving to step:', step + 1);
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
    console.log('[ReportWizard] onSubmit called - step:', step, 'reportType:', reportType);
    console.log('[ReportWizard] Form data:', JSON.stringify(data, null, 2));
    console.log('[ReportWizard] athleteIds:', data.athleteIds);
    console.log('[ReportWizard] athleteIds length:', data.athleteIds?.length);

    // Prevent submission if not on final step
    if (step !== totalSteps) {
      console.error('[ReportWizard] Form submitted prematurely on step', step, '- blocking submission');
      return;
    }

    if (!organizationContext) {
      console.log('[ReportWizard] No organizationContext - aborting');
      return;
    }

    // Extra validation for individual reports
    if (data.reportType === "individual") {
      if (!data.athleteIds || data.athleteIds.length === 0) {
        console.error('[ReportWizard] Individual report submitted with no athletes!');
        console.error('[ReportWizard] This should have been caught by Zod validation');
        // The Zod schema should have prevented this, but double-check
        return;
      }
      console.log('[ReportWizard] Individual report has', data.athleteIds.length, 'athletes');
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
    };

    if (data.siteBenchmarks?.length || data.customBenchmarks?.length || data.siteGroups?.length || data.customGroups?.length) {
      config.benchmarks = {
        site: data.siteBenchmarks,
        custom: data.customBenchmarks,
        siteGroups: data.siteGroups,
        customGroups: data.customGroups,
      };
    }

    if (data.enableCompositeIndex && data.reportType === "team") {
      config.compositeIndex = {
        enabled: true,
        weights: data.compositeWeights,
      };
    }

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
                    <div className="font-semibold">Team Report</div>
                    <div className="text-sm text-muted-foreground">
                      Team-wide performance analysis with rankings and composite index
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="individual" id="individual" />
                  <Label htmlFor="individual" className="cursor-pointer flex-1">
                    <div className="font-semibold">Individual Report</div>
                    <div className="text-sm text-muted-foreground">
                      Individual athlete performance with team rank and percentiles
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
              <Label>Select Athletes</Label>
              <p className="text-sm text-muted-foreground">
                Choose individual athletes or select entire teams. One report will be created for each athlete.
              </p>

              <TeamAthleteSelector
                organizationId={organizationContext!}
                selectedAthleteIds={watch("athleteIds") || []}
                onSelectionChange={(ids) => {
                  console.log('[ReportWizard] Athlete selection changed:', ids);
                  console.log('[ReportWizard] Setting athleteIds to:', ids);
                  setValue("athleteIds", ids);
                  console.log('[ReportWizard] Current form value:', watch("athleteIds"));
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
                  placeholder="e.g., Spring 2025 Team Performance"
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
                  {metrics.map((metric: any) => {
                    const metricCode = metric.metricCode || metric.code;
                    return (
                      <div key={metricCode} className="flex items-center space-x-2">
                        <Checkbox
                          id={metricCode}
                          checked={selectedMetrics?.includes(metricCode)}
                          onCheckedChange={() => toggleMetric(metricCode)}
                        />
                        <Label htmlFor={metricCode} className="cursor-pointer flex-1">
                          <div className="font-medium">{metric.siteMetric?.name || metricCode}</div>
                          <div className="text-sm text-muted-foreground">
                            {metric.siteMetric?.unit} • {metric.siteMetric?.category}
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
            <div className="space-y-6">
              <div>
                <Label>Benchmarks (Optional)</Label>
                <p className="text-sm text-muted-foreground">
                  Select benchmark groups or individual benchmarks to compare against in the report
                </p>
              </div>

              {(benchmarksLoading || siteGroupsLoading || customGroupsLoading) ? (
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

                  {/* Benchmark Groups Section */}
                  {(siteBenchmarkGroups && siteBenchmarkGroups.length > 0) ||
                   (customBenchmarkGroups && customBenchmarkGroups.length > 0) ? (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-1">Benchmark Groups</h4>
                        <p className="text-xs text-muted-foreground mb-2">
                          Select entire groups of benchmarks at once
                        </p>
                      </div>

                      {siteBenchmarkGroups && siteBenchmarkGroups.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium mb-2 text-muted-foreground">Site Groups</h5>
                          <div className="space-y-2 border rounded-lg p-3 max-h-40 overflow-y-auto bg-accent/20">
                            {siteBenchmarkGroups.map((group: any) => (
                              <div key={group.id} className="flex items-start space-x-2">
                                <Checkbox
                                  id={`site-group-${group.id}`}
                                  checked={watch("siteGroups")?.includes(group.id)}
                                  onCheckedChange={(checked) => {
                                    const current = watch("siteGroups") || [];
                                    setValue(
                                      "siteGroups",
                                      checked
                                        ? [...current, group.id]
                                        : current.filter((id) => id !== group.id)
                                    );
                                  }}
                                />
                                <div className="flex-1">
                                  <Label
                                    htmlFor={`site-group-${group.id}`}
                                    className="cursor-pointer font-medium"
                                  >
                                    {group.name}
                                  </Label>
                                  {group.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {group.description}
                                    </p>
                                  )}
                                  {'benchmarks' in group && Array.isArray(group.benchmarks) && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {group.benchmarks.length} benchmark{group.benchmarks.length !== 1 ? 's' : ''}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {customBenchmarkGroups && customBenchmarkGroups.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium mb-2 text-muted-foreground">Custom Groups</h5>
                          <div className="space-y-2 border rounded-lg p-3 max-h-40 overflow-y-auto bg-accent/20">
                            {customBenchmarkGroups.map((group: any) => (
                              <div key={group.id} className="flex items-start space-x-2">
                                <Checkbox
                                  id={`custom-group-${group.id}`}
                                  checked={watch("customGroups")?.includes(group.id)}
                                  onCheckedChange={(checked) => {
                                    const current = watch("customGroups") || [];
                                    setValue(
                                      "customGroups",
                                      checked
                                        ? [...current, group.id]
                                        : current.filter((id) => id !== group.id)
                                    );
                                  }}
                                />
                                <div className="flex-1">
                                  <Label
                                    htmlFor={`custom-group-${group.id}`}
                                    className="cursor-pointer font-medium"
                                  >
                                    {group.name}
                                  </Label>
                                  {group.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {group.description}
                                    </p>
                                  )}
                                  {'benchmarks' in group && Array.isArray(group.benchmarks) && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {group.benchmarks.length} benchmark{group.benchmarks.length !== 1 ? 's' : ''}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Individual Benchmarks Section */}
                  {siteBenchmarks && siteBenchmarks.length > 0 && (
                    <div>
                      <div>
                        <h4 className="font-medium mb-1">Individual Benchmarks</h4>
                        <p className="text-xs text-muted-foreground mb-2">
                          Or select specific benchmarks
                        </p>
                      </div>
                      <h5 className="text-sm font-medium mb-2 text-muted-foreground">Site Benchmarks</h5>
                      <div className="space-y-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                        {siteBenchmarks.map((benchmark: any) => (
                          <div key={benchmark.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`site-${benchmark.id}`}
                              checked={watch("siteBenchmarks")?.includes(benchmark.benchmarkId)}
                              onCheckedChange={(checked) => {
                                const current = watch("siteBenchmarks") || [];
                                setValue(
                                  "siteBenchmarks",
                                  checked
                                    ? [...current, benchmark.benchmarkId]
                                    : current.filter((id) => id !== benchmark.benchmarkId)
                                );
                              }}
                            />
                            <Label
                              htmlFor={`site-${benchmark.id}`}
                              className="cursor-pointer text-sm"
                            >
                              {benchmark.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {customBenchmarks && customBenchmarks.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium mb-2 text-muted-foreground">Custom Benchmarks</h5>
                      <div className="space-y-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                        {customBenchmarks.map((benchmark: any) => (
                          <div key={benchmark.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`custom-${benchmark.id}`}
                              checked={watch("customBenchmarks")?.includes(benchmark.benchmarkId)}
                              onCheckedChange={(checked) => {
                                const current = watch("customBenchmarks") || [];
                                setValue(
                                  "customBenchmarks",
                                  checked
                                    ? [...current, benchmark.benchmarkId]
                                    : current.filter((id) => id !== benchmark.benchmarkId)
                                );
                              }}
                            />
                            <Label
                              htmlFor={`custom-${benchmark.id}`}
                              className="cursor-pointer text-sm"
                            >
                              {benchmark.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!benchmarksError &&
                   (!siteBenchmarkGroups || siteBenchmarkGroups.length === 0) &&
                   (!customBenchmarkGroups || customBenchmarkGroups.length === 0) &&
                   (!siteBenchmarks || siteBenchmarks.length === 0) &&
                   (!customBenchmarks || customBenchmarks.length === 0) && (
                    <div className="border rounded-lg p-4 text-center text-muted-foreground">
                      <p>No enabled benchmarks or groups available</p>
                      <p className="text-sm mt-1">You can skip this step or enable benchmarks in Settings</p>
                    </div>
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
                <Label>Teams</Label>
                {teamsLoading ? (
                  <div className="flex justify-center py-4">
                    <LoadingSpinner />
                  </div>
                ) : teamsError ? (
                  <div className="border border-destructive rounded-lg p-4 text-center">
                    <p className="text-sm text-destructive">Failed to load teams</p>
                  </div>
                ) : !teams || teams.length === 0 ? (
                  <div className="border rounded-lg p-4 text-center text-muted-foreground">
                    <p className="text-sm">No teams available</p>
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

          {/* Step 8: Composite Index (Team Reports Only) */}
          {step === 8 && reportType === "team" && (
            <div className="space-y-4">
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
                <p className="text-sm text-muted-foreground">
                  Click "Create Report" to finish
                </p>
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
              <Button type="button" onClick={handleNext}>
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
