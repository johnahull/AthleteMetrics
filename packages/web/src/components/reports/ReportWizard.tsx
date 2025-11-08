import { useState } from "react";
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

const reportConfigSchema = z.object({
  reportType: z.enum(["coach", "individual"]),
  name: z.string().min(1, "Report name is required"),
  description: z.string().optional(),
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
  enableCompositeIndex: z.boolean().default(false),
  compositeWeights: z.record(z.string(), z.number()).optional(),
});

type ReportFormData = z.infer<typeof reportConfigSchema>;

interface ReportWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (reportId: string) => void;
}

export function ReportWizard({ open, onClose, onSuccess }: ReportWizardProps) {
  const { organizationContext } = useAuth();
  const [step, setStep] = useState(1);
  const totalSteps = 7;

  const {
    register,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<ReportFormData>({
    resolver: zodResolver(reportConfigSchema),
    defaultValues: {
      reportType: "coach",
      timeframeType: "preset",
      timeframePreset: "all_time",
      metrics: [],
      siteBenchmarks: [],
      customBenchmarks: [],
      teamIds: [],
      positions: [],
      enableCompositeIndex: false,
    },
  });

  const createReport = useCreateReport();

  // Watch form values
  const reportType = watch("reportType");
  const timeframeType = watch("timeframeType");
  const selectedMetrics = watch("metrics");
  const enableCompositeIndex = watch("enableCompositeIndex");

  // Fetch organization's enabled metrics
  const { data: metrics } = useQuery({
    queryKey: ["/api/metrics", organizationContext],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${organizationContext}/metrics`);
      return res.json();
    },
    enabled: !!organizationContext,
  });

  // Fetch teams
  const { data: teams } = useQuery({
    queryKey: ["/api/teams", organizationContext],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${organizationContext}/teams`);
      return res.json();
    },
    enabled: !!organizationContext,
  });

  // Fetch site benchmarks
  const { data: siteBenchmarks } = useQuery({
    queryKey: ["/api/benchmarks/site"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/benchmarks/site");
      return res.json();
    },
  });

  // Fetch custom benchmarks
  const { data: customBenchmarks } = useQuery({
    queryKey: ["/api/benchmarks/custom", organizationContext],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${organizationContext}/custom-benchmarks`);
      return res.json();
    },
    enabled: !!organizationContext,
  });

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const onSubmit = async (data: ReportFormData) => {
    const config: any = {
      timeframe: {
        type: data.timeframeType,
        ...(data.timeframeType === "preset"
          ? { preset: data.timeframePreset }
          : { customStart: data.timeframeStart, customEnd: data.timeframeEnd }),
      },
      metrics: data.metrics,
    };

    if (data.siteBenchmarks?.length || data.customBenchmarks?.length) {
      config.benchmarks = {
        site: data.siteBenchmarks,
        custom: data.customBenchmarks,
      };
    }

    if (data.enableCompositeIndex && data.reportType === "coach") {
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
    });

    onSuccess(result.id);
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Step 1: Report Type */}
          {step === 1 && (
            <div className="space-y-4">
              <Label>Report Type</Label>
              <RadioGroup
                value={reportType}
                onValueChange={(value) => setValue("reportType", value as any)}
              >
                <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="coach" id="coach" />
                  <Label htmlFor="coach" className="cursor-pointer flex-1">
                    <div className="font-semibold">Coach Report</div>
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

          {/* Step 2: Basic Details */}
          {step === 2 && (
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

          {/* Step 3: Timeframe */}
          {step === 3 && (
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

          {/* Step 4: Metrics Selection */}
          {step === 4 && (
            <div className="space-y-4">
              <Label>Select Metrics *</Label>
              {!metrics ? (
                <LoadingSpinner />
              ) : (
                <div className="space-y-2 border rounded-lg p-4 max-h-96 overflow-y-auto">
                  {metrics.map((metric: any) => (
                    <div key={metric.code} className="flex items-center space-x-2">
                      <Checkbox
                        id={metric.code}
                        checked={selectedMetrics?.includes(metric.code)}
                        onCheckedChange={() => toggleMetric(metric.code)}
                      />
                      <Label htmlFor={metric.code} className="cursor-pointer flex-1">
                        <div className="font-medium">{metric.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {metric.unit} • {metric.category}
                        </div>
                      </Label>
                    </div>
                  ))}
                </div>
              )}
              {errors.metrics && (
                <p className="text-sm text-destructive">{errors.metrics.message}</p>
              )}
            </div>
          )}

          {/* Step 5: Benchmarks (Optional) */}
          {step === 5 && (
            <div className="space-y-4">
              <Label>Benchmarks (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Select benchmarks to compare against in the report
              </p>

              {siteBenchmarks && siteBenchmarks.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Site Benchmarks</h4>
                  <div className="space-y-2 border rounded-lg p-4 max-h-48 overflow-y-auto">
                    {siteBenchmarks.map((benchmark: any) => (
                      <div key={benchmark.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`site-${benchmark.id}`}
                          checked={watch("siteBenchmarks")?.includes(benchmark.id)}
                          onCheckedChange={(checked) => {
                            const current = watch("siteBenchmarks") || [];
                            setValue(
                              "siteBenchmarks",
                              checked
                                ? [...current, benchmark.id]
                                : current.filter((id) => id !== benchmark.id)
                            );
                          }}
                        />
                        <Label
                          htmlFor={`site-${benchmark.id}`}
                          className="cursor-pointer"
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
                  <h4 className="font-medium mb-2">Custom Benchmarks</h4>
                  <div className="space-y-2 border rounded-lg p-4 max-h-48 overflow-y-auto">
                    {customBenchmarks.map((benchmark: any) => (
                      <div key={benchmark.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`custom-${benchmark.id}`}
                          checked={watch("customBenchmarks")?.includes(benchmark.id)}
                          onCheckedChange={(checked) => {
                            const current = watch("customBenchmarks") || [];
                            setValue(
                              "customBenchmarks",
                              checked
                                ? [...current, benchmark.id]
                                : current.filter((id) => id !== benchmark.id)
                            );
                          }}
                        />
                        <Label
                          htmlFor={`custom-${benchmark.id}`}
                          className="cursor-pointer"
                        >
                          {benchmark.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Filters (Optional) */}
          {step === 6 && (
            <div className="space-y-4">
              <Label>Filters (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Filter athletes included in the report
              </p>

              <div>
                <Label>Teams</Label>
                {!teams ? (
                  <LoadingSpinner />
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

          {/* Step 7: Composite Index (Coach Reports Only) */}
          {step === 7 && reportType === "coach" && (
            <div className="space-y-4">
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
              <p className="text-sm text-muted-foreground">
                Create a weighted composite score across multiple metrics
              </p>

              {enableCompositeIndex && selectedMetrics.length > 0 && (
                <div className="space-y-3 border rounded-lg p-4">
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
            </div>
          )}

          {/* Step 7 for Individual Reports - Summary */}
          {step === 7 && reportType === "individual" && (
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
