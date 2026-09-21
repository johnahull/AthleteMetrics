import { useState, useEffect } from "react";
import { useForm, FormProvider, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertMeasurementSchema, insertAthleteSchema, Gender, type InsertMeasurement, type InsertAthlete, type Team } from "@shared/schema";
import { Save, Calculator, AlertCircle } from "lucide-react";
import { useMeasurementForm, type Athlete, type ActiveTeam } from "@/hooks/use-measurement-form";
import { AthleteSelector } from "@/components/ui/athlete-selector";
import { useAuth } from "@/lib/auth";
import { useAvailableMetrics } from "@/hooks/use-available-metrics";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { useFormErrors } from "@/hooks/useFormErrors";
import { z } from "zod";
import { useContextualLabels } from "@/hooks/useContextualLabels";
import { PairedInputFields } from "@/components/measurement/PairedInputFields";
import { LastSetContextLine } from "@/components/measurement/LastSetContextLine";

// Create dynamic measurement schema that accepts any metric string
// Backend will validate against org-enabled metrics
const dynamicMeasurementSchema = insertMeasurementSchema.omit({ metric: true }).extend({
  metric: z.string().min(1, "Metric is required"),
});

/**
 * Extract a structured `{message, field}` from an apiRequest error.
 * apiRequest throws `Error("<status>: <raw body>")`. The body for
 * PairedInputValidationError is `{"message":"...","field":"..."}`. Returns
 * null if the body isn't a recognizable structured error.
 */
function parseFieldError(
  error: Error,
): { message: string; field: 'primaryValue' | 'auxiliaryValue' | 'formula' } | null {
  if (!error?.message) return null;
  const stripped = error.message.replace(/^\d+:\s*/, '');
  try {
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed.message === 'string' && typeof parsed.field === 'string') {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

type DynamicInsertMeasurement = z.infer<typeof dynamicMeasurementSchema>;

// Type guards for safer runtime checking
function hasTeamsProperty(athlete: any): athlete is Athlete & { teams: Array<{ id: string; name: string }> } {
  return athlete && Array.isArray(athlete.teams);
}

function hasBirthYearProperty(athlete: any): athlete is Athlete & { birthYear: number } {
  return athlete && typeof athlete.birthYear === 'number';
}

export default function MeasurementForm() {
  const labels = useContextualLabels();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [overrideCalculated, setOverrideCalculated] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, organizationContext, userOrganizations } = useAuth();

  const { data: athletes } = useQuery({
    queryKey: ["/api/athletes"],
  });

  const { data: teams } = useQuery({
    queryKey: ["/api/teams"],
  });

  // Get available metrics using centralized hook (filters by active+enabled)
  const { metrics: availableMetrics } = useAvailableMetrics();

  const firstMetricCode = "FLY10_TIME";

  const form = useForm<DynamicInsertMeasurement>({
    resolver: zodResolver(dynamicMeasurementSchema),
    defaultValues: {
      userId: "",
      date: new Date().toISOString().split('T')[0],
      metric: firstMetricCode,
      value: 0,
      flyInDistance: undefined,
      auxiliaryValue: undefined,
      notes: "",
      teamId: "",
      season: "",
    },
  });

  const quickAddForm = useForm<InsertAthlete>({
    resolver: zodResolver(insertAthleteSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      birthDate: "",
      teamIds: [],
      school: "",
      gender: undefined,
    },
  });

  // Use consolidated state management hook
  // Note: Type assertion is required because DynamicInsertMeasurement extends InsertMeasurement
  // with additional optional fields. The hook only uses teamId and season fields which exist
  // in both types, making this assertion safe.
  const {
    selectedAthlete,
    activeTeams,
    showTeamOverride,
    isLoadingTeams,
    setSelectedAthlete,
    setShowTeamOverride,
    fetchActiveTeams,
    resetTeamState,
    cleanup
  } = useMeasurementForm(form as UseFormReturn<InsertMeasurement>);

  const createMeasurementMutation = useMutation({
    mutationFn: async (data: DynamicInsertMeasurement) => {
      // Backend will set submittedBy automatically based on session
      const response = await apiRequest("POST", "/api/measurements", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/measurements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/search/global"] });
      // Invalidate the last-set context too — the measurement we just created
      // may now be the "last set" the next entry should reference.
      queryClient.invalidateQueries({ queryKey: ["last-set-context"] });
      toast({
        title: "Success",
        description: "Measurement added successfully",
      });
      // Batch-entry preservation per plan §6: keep athlete + metric + date +
      // team + season after a successful submit so a coach can log the next
      // working set without re-picking everything. Clear only the inputs that
      // belong to "this set" (value / auxiliary / fly-in / notes), and return
      // focus to the primary value input. To start a totally fresh entry,
      // coach changes the athlete/metric explicitly.
      form.resetField("value", { defaultValue: 0 });
      form.resetField("auxiliaryValue", { defaultValue: undefined });
      form.resetField("flyInDistance", { defaultValue: undefined });
      form.resetField("notes", { defaultValue: "" });
      form.clearErrors();
      setOverrideCalculated(false);
      // Defer focus until after the reset has propagated through React state.
      setTimeout(() => form.setFocus("value"), 0);
    },
    onError: (error) => {
      console.error("Measurement creation error:", error);
      // Backend PairedInputValidationError responses include {message, field}
      // — surface the message inline on the offending input rather than as a
      // generic toast. apiRequest throws Error("<status>: <raw body>"), so we
      // strip the status prefix and try to JSON-parse what's left.
      const fieldErr = parseFieldError(error);
      if (fieldErr && fieldErr.field === 'auxiliaryValue') {
        form.setError('auxiliaryValue', { type: 'server', message: fieldErr.message });
      } else if (fieldErr && fieldErr.field === 'primaryValue') {
        form.setError('value', { type: 'server', message: fieldErr.message });
      }
      toast({
        title: "Error",
        description: fieldErr?.message ?? `Failed to add measurement: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const createAthleteMutation = useMutation({
    mutationFn: async (data: InsertAthlete) => {
      const response = await apiRequest("POST", "/api/athletes", data);
      return response.json();
    },
    onSuccess: (newAthlete) => {
      queryClient.invalidateQueries({ queryKey: ["/api/athletes"] });
      setSelectedAthlete(newAthlete);
      form.setValue("userId", newAthlete.id);
      setShowQuickAdd(false);
      quickAddForm.reset();
      toast({
        title: "Success",
        description: "Athlete created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create athlete",
        variant: "destructive",
      });
    },
  });

  // Prepare athletes array for AthleteSelector component with proper fullName
  const athletesForSelector = Array.isArray(athletes) ? (athletes as Athlete[]).map(athlete => ({
    ...athlete,
    fullName: athlete.fullName || 'Unknown'
  })) : [];

  const metric = form.watch("metric");
  const date = form.watch("date");
  // Get unit from metric config dynamically
  const units = availableMetrics.find(m => m.code === metric)?.unit || "";
  const selectedMetric = availableMetrics.find(m => m.code === metric);

  // Query for calculation preview for derived metrics
  const { data: calculationPreview } = useQuery({
    queryKey: ['calculation-preview', selectedAthlete?.id, metric, date],
    queryFn: async () => {
      const params = new URLSearchParams({
        athleteId: selectedAthlete!.id,
        metricCode: metric,
        date: date,
      });
      const res = await fetch(`/api/measurements/calculate-preview?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch calculation preview');
      }
      return res.json() as Promise<{
        calculatedValue: number | null;
        sourceMetrics: Array<{ code: string; label: string; value: number; unit: string; measurementId: string }>;
        sourceMeasurementIds?: string[];
        missingMetrics?: string[];
        formula: string | null;
      }>;
    },
    enabled: !!selectedAthlete?.id && !!selectedMetric?.isDerived && !!date,
    staleTime: 0, // Always refetch for real-time preview
  });

  // Watch for date changes and refetch active teams
  useEffect(() => {
    if (selectedAthlete && date) {
      fetchActiveTeams(selectedAthlete.id, date);
    }
  }, [date, selectedAthlete, fetchActiveTeams]);

  // Reset override when metric changes
  useEffect(() => {
    setOverrideCalculated(false);
  }, [metric]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const onSubmit = (data: DynamicInsertMeasurement) => {
    if (!selectedAthlete) {
      toast({
        title: "Error",
        description: "Please select an athlete",
        variant: "destructive",
      });
      return;
    }

    // Prepare measurement data
    let measurementData: any = {
      ...data,
      userId: selectedAthlete.id,
    };

    // For derived metrics without override, use calculated value and add metadata
    if (selectedMetric?.isDerived && !overrideCalculated && calculationPreview?.calculatedValue !== null && calculationPreview !== undefined) {
      measurementData = {
        ...measurementData,
        value: calculationPreview.calculatedValue,
        isCalculated: true,
        calculatedFromMeasurementIds: calculationPreview.sourceMeasurementIds || [],
        calculationMetadata: {
          formula: calculationPreview.formula || '',
          sourceValues: (calculationPreview.sourceMetrics || []).reduce((acc, sm) => {
            acc[sm.code.toLowerCase()] = sm.value;
            return acc;
          }, {} as Record<string, number>),
          calculatedAt: new Date().toISOString(),
        },
      };
    }

    // CODE QUALITY FIX: Remove production console.log
    // console.log("Submitting measurement data:", measurementData);
    createMeasurementMutation.mutate(measurementData);
  };

  const onQuickAddSubmit = (data: InsertAthlete) => {
    createAthleteMutation.mutate(data);
  };

  const clearForm = () => {
    form.reset({
      userId: "",
      date: new Date().toISOString().split('T')[0],
      metric: firstMetricCode,
      value: 0,
      flyInDistance: undefined,
      notes: "",
      teamId: "",
      season: "",
    });
    setSelectedAthlete(null);
    resetTeamState();
    setOverrideCalculated(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Athlete Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Athlete <span className="text-red-500">*</span>
            </label>
            <AthleteSelector
              athletes={athletesForSelector}
              selectedAthlete={selectedAthlete}
              onSelect={(athlete) => {
                // Convert AthleteSelector.Athlete to the expected hook interface
                const hookAthlete = athlete ? {
                  id: athlete.id,
                  fullName: athlete.fullName,
                  birthYear: athlete.birthYear || 0, // Provide default value for required field
                  teams: athlete.teams
                } : null;

                setSelectedAthlete(hookAthlete);
                form.setValue("userId", athlete?.id || "");
                if (athlete) {
                  // Fetch active teams for the selected athlete
                  const currentDate = form.getValues("date");
                  if (currentDate) {
                    fetchActiveTeams(athlete.id, currentDate);
                  }
                } else {
                  resetTeamState();
                }
              }}
              placeholder="Select athlete..."
              searchPlaceholder="Search athletes by name or team..."
              showTeamInfo={true}
              disabled={createMeasurementMutation.isPending}
              data-testid="athlete-select"
            />
            <p className="text-xs text-gray-500 mt-1">Click to browse or type to search athletes</p>
          </div>

          {/* Date */}
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Test Date <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="date"
                    min="1970-01-01"
                    disabled={createMeasurementMutation.isPending}
                    data-testid="input-measurement-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Metric Type */}
          <FormField
            control={form.control}
            name="metric"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Metric <span className="text-red-500">*</span>
                </FormLabel>
                <Select 
                  value={field.value} 
                  onValueChange={field.onChange}
                  disabled={createMeasurementMutation.isPending}
                >
                  <FormControl>
                    <SelectTrigger data-testid="metric-select">
                      <SelectValue placeholder="Select metric..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {availableMetrics.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No metrics available
                      </div>
                    ) : (
                      availableMetrics.map((m) => (
                        <SelectItem key={m.code} value={m.code}>
                          {m.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Derived Metric Calculation Preview */}
        {selectedMetric?.isDerived && selectedAthlete && date && (
          <div className="grid grid-cols-1">
            {calculationPreview?.calculatedValue !== null && calculationPreview?.calculatedValue !== undefined ? (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    This is a derived metric
                  </span>
                </div>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Calculated value: <strong>{calculationPreview.calculatedValue.toFixed(3)} {selectedMetric.unit}</strong>
                </p>
                {calculationPreview.sourceMetrics && calculationPreview.sourceMetrics.length > 0 && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Based on: {calculationPreview.sourceMetrics.map(m => `${m.label}: ${m.value} ${m.unit}`).join(', ')}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <Checkbox
                    id="override-calculated"
                    checked={overrideCalculated}
                    onCheckedChange={(checked) => setOverrideCalculated(checked === true)}
                  />
                  <label htmlFor="override-calculated" className="text-sm text-blue-700 dark:text-blue-300 cursor-pointer">
                    Override with direct measurement
                  </label>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    Cannot calculate - missing source data
                  </span>
                </div>
                {calculationPreview?.missingMetrics && calculationPreview.missingMetrics.length > 0 && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    This metric requires: {calculationPreview.missingMetrics.join(', ')}
                  </p>
                )}
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                  You can enter a directly measured value instead.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Checkbox
                    id="enter-direct"
                    checked={overrideCalculated}
                    onCheckedChange={(checked) => setOverrideCalculated(checked === true)}
                  />
                  <label htmlFor="enter-direct" className="text-sm text-yellow-700 dark:text-yellow-300 cursor-pointer">
                    Enter direct measurement
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Last-set context: shown when an athlete + metric is selected and
            the athlete has prior measurements. Click-to-copy pulls the source
            values back into the form (the original load/reps for paired-input,
            or the raw value for single-value metrics). Helps batch entry and
            quick "did they beat last time?" comparisons. */}
        {selectedAthlete && selectedMetric && (
          <LastSetContextLine
            athleteId={selectedAthlete.id}
            metric={selectedMetric}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Paired-input metrics (e.g., 1RM-est) get a dedicated component with
              relabeled primary input, auxiliary stepper, live preview, and
              tiered guardrails. Mutually exclusive with the default Value field
              and with the derived-metric calculation preview. */}
          {selectedMetric?.auxiliaryInputConfig ? (
            <PairedInputFields
              metricCode={selectedMetric.code}
              config={selectedMetric.auxiliaryInputConfig}
              disabled={createMeasurementMutation.isPending}
              onMetricSwitch={(newCode) => {
                form.setValue("metric", newCode, { shouldValidate: true });
                form.setValue("auxiliaryValue", undefined as any, { shouldValidate: false });
              }}
            />
          ) : (
            /* Value - Only show if not a derived metric OR if override is checked */
            (!selectedMetric?.isDerived || overrideCalculated || calculationPreview?.calculatedValue === null) && (
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Value <span className="text-red-500">*</span>
                  </FormLabel>
                  <div className="flex">
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        placeholder="Enter value"
                        disabled={createMeasurementMutation.isPending}
                        className={units ? "rounded-r-none" : ""}
                        data-testid="measurement-value"
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        value={field.value || ''}
                      />
                    </FormControl>
                    {units && (
                      <div className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-600 text-sm">
                        {units}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">Units auto-selected based on metric</p>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}

          {/* Fly-In Distance (only for FLY10_TIME) */}
          {metric === "FLY10_TIME" && (
            <FormField
              control={form.control}
              name="flyInDistance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fly-In Distance (Optional)</FormLabel>
                  <div className="flex">
                    <FormControl>
                      <Input 
                        {...field}
                        type="number"
                        step="0.1"
                        placeholder="Enter distance"
                        disabled={createMeasurementMutation.isPending}
                        className="rounded-r-none"
                        data-testid="input-fly-in-distance"
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <div className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-600 text-sm">
                      yd
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Distance from start of acceleration to timing gate</p>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea 
                  {...field}
                  value={field.value || ""}
                  placeholder="Optional notes about this measurement..."
                  disabled={createMeasurementMutation.isPending}
                  rows={3}
                  data-testid="textarea-measurement-notes"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Team Context */}
        {selectedAthlete && activeTeams.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">{labels.team} Context</h3>
            
            {activeTeams.length === 1 && activeTeams[0] ? (
              <div className="space-y-2">
                <p className="text-sm text-blue-800">
                  Auto-assigned to: <span className="font-medium">{activeTeams[0].teamName}</span>
                  {activeTeams[0].season && <span> • {activeTeams[0].season}</span>}
                </p>
                <button
                  type="button"
                  onClick={() => setShowTeamOverride(!showTeamOverride)}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  {showTeamOverride ? 'Use auto-assignment' : `Override ${labels.team.toLowerCase()} selection`}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-blue-800">
                  {labels.athlete} is on {activeTeams.length} {labels.teams.toLowerCase()} - please select {labels.team.toLowerCase()} context:
                </p>
                <FormField
                  control={form.control}
                  name="teamId"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        const selectedTeam = activeTeams?.find(t => t?.teamId === value);
                        if (selectedTeam) {
                          form.setValue("season", selectedTeam.season || "");
                        }
                      }} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder={`Select ${labels.team.toLowerCase()}...`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeTeams.map((team) => (
                            <SelectItem key={team.teamId} value={team.teamId}>
                              {team.teamName} {team.season && `• ${team.season}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {showTeamOverride && activeTeams.length === 1 && activeTeams[0] && (
              <div className="mt-3 space-y-2">
                <FormField
                  control={form.control}
                  name="teamId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{labels.team} Override</FormLabel>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        const selectedTeam = activeTeams?.find(t => t?.teamId === value);
                        if (selectedTeam) {
                          form.setValue("season", selectedTeam.season || "");
                        }
                      }} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder={`Select ${labels.team.toLowerCase()}...`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeTeams.map((team) => (
                            <SelectItem key={team.teamId} value={team.teamId}>
                              {team.teamName} {team.season && `• ${team.season}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>
        )}

        {selectedAthlete && activeTeams.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              This {labels.athlete.toLowerCase()} is not currently on any active {labels.teams.toLowerCase()}. The measurement will be recorded without {labels.team.toLowerCase()} context.
            </p>
          </div>
        )}

        {/* Quick Add Athlete */}
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center space-x-2 mb-4">
            <Checkbox 
              id="quick-add-athlete" 
              checked={showQuickAdd}
              onCheckedChange={(checked) => setShowQuickAdd(checked === true)}
              data-testid="checkbox-quick-add-athlete"
            />
            <label htmlFor="quick-add-athlete" className="text-sm font-medium text-gray-700">
              Add new athlete
            </label>
          </div>

          {showQuickAdd && (
            <Card className="bg-gray-50">
              <CardContent className="p-4">
                <Form {...quickAddForm}>
                  <form onSubmit={quickAddForm.handleSubmit(onQuickAddSubmit)} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <FormField
                      control={quickAddForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              disabled={createAthleteMutation.isPending}
                              data-testid="input-quick-add-firstname"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quickAddForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              disabled={createAthleteMutation.isPending}
                              data-testid="input-quick-add-lastname"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quickAddForm.control}
                      name="birthDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Birth Date</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="date"
                              min="1970-01-01"
                              disabled={createAthleteMutation.isPending}
                              data-testid="input-quick-add-birthday"
                              max={new Date().toISOString().split('T')[0]} // Prevent future dates
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quickAddForm.control}
                      name="teamIds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{labels.team}</FormLabel>
                          <Select
                            value={Array.isArray(field.value) ? field.value[0] || "" : field.value || ""}
                            onValueChange={(value) => field.onChange([value])}
                            disabled={createAthleteMutation.isPending}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-quick-add-team">
                                <SelectValue placeholder={`Select ${labels.team.toLowerCase()}...`} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Array.isArray(teams) ? teams.filter((team: Team) => team.isArchived !== true).map((team: Team) => (
                                <SelectItem key={team.id} value={team.id}>
                                  {team.name}
                                </SelectItem>
                              )) : null}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quickAddForm.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select 
                            value={field.value || ""} 
                            onValueChange={field.onChange}
                            disabled={createAthleteMutation.isPending}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-quick-add-gender" aria-label="Select athlete gender">
                                <SelectValue placeholder="Select gender..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={Gender.MALE}>{Gender.MALE}</SelectItem>
                              <SelectItem value={Gender.FEMALE}>{Gender.FEMALE}</SelectItem>
                              <SelectItem value={Gender.NOT_SPECIFIED}>{Gender.NOT_SPECIFIED}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="md:col-span-5 flex justify-end">
                      <Button 
                        type="submit"
                        disabled={createAthleteMutation.isPending}
                        data-testid="button-quick-add-athlete"
                      >
                        {createAthleteMutation.isPending ? "Adding..." : "Add Athlete"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end space-x-3">
          <Button 
            type="button" 
            variant="outline"
            onClick={clearForm}
            disabled={createMeasurementMutation.isPending}
            data-testid="button-clear-form"
          >
            Clear Form
          </Button>
          <Button
            type="submit"
            disabled={createMeasurementMutation.isPending || !selectedAthlete}
            data-testid="submit-measurement"
          >
            <Save className="h-4 w-4 mr-2" />
            {createMeasurementMutation.isPending ? "Saving..." : "Save Measurement"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
