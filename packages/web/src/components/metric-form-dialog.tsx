import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreateSiteMetric, useUpdateSiteMetric } from "@/lib/metrics-api";
import type { SiteMetric } from "@shared/schema";
import { OrganizationTypeMultiSelect } from "@/components/organization-type-multi-select";
import { SportMultiSelect } from "@/components/sport-multi-select";
import { organizationTypeEnum, metricTypeEnum } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";

// CODE QUALITY FIX: Extract magic number to named constant
const DEFAULT_DECIMAL_PRECISION = 3; // Standard precision for athletic measurements

// Zod schema for metric form validation
const metricFormSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(50, "Code must be 50 characters or less")
    .regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, numbers, and underscores only"),
  label: z
    .string()
    .min(1, "Label is required")
    .max(100, "Label must be 100 characters or less"),
  category: z.string().max(50, "Category must be 50 characters or less").optional(),
  unit: z.string().max(20, "Unit must be 20 characters or less").optional(),
  description: z.string().max(5000).optional(),
  shortDescription: z.string().max(5000).optional(),
  whatItMeasures: z.string().max(5000).optional(),
  whyItMatters: z.string().max(5000).optional(),
  metricType: z.enum(metricTypeEnum).default('lower_is_better'),
  availableOrgTypes: z.array(z.enum(organizationTypeEnum)).optional(),
  sportAssociations: z.array(z.string()).optional(),
  isDerived: z.boolean().default(false),
  formula: z.string().max(500).optional(),
  calculationConfig: z.object({
    dateMatchStrategy: z.enum(['same_date', 'latest_before', 'closest']).default('same_date'),
    maxDateDifference: z.number().int().min(1).max(365).optional(),
    missingSourceBehavior: z.enum(['skip', 'error']).default('skip'),
  }).optional(),
}).refine(data => !data.isDerived || data.formula, {
  message: "Formula is required for derived metrics",
  path: ["formula"],
});

type MetricFormValues = z.infer<typeof metricFormSchema>;

interface MetricFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metric?: SiteMetric | null; // If provided, edit mode; otherwise create mode
}

// Formula validation debounce delay in milliseconds
// Prevents excessive API calls while user is typing
const FORMULA_VALIDATION_DEBOUNCE_MS = 500;

// Hook for formula validation with debounce
function useValidateFormula(formula: string, excludeCode?: string) {
  const debouncedFormula = useDebounce(formula, FORMULA_VALIDATION_DEBOUNCE_MS);

  return useQuery({
    queryKey: ['validate-formula', debouncedFormula, excludeCode],
    queryFn: async () => {
      const res = await fetch('/api/metrics/validate-formula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula: debouncedFormula, excludeMetricCode: excludeCode }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Validation failed');
      }
      return res.json() as Promise<{ valid: boolean; dependentMetrics?: string[]; error?: string }>;
    },
    enabled: debouncedFormula.length > 0,
    staleTime: 30000,
    retry: false,
  });
}

export default function MetricFormDialog({
  open,
  onOpenChange,
  metric,
}: MetricFormDialogProps) {
  const { toast } = useToast();
  const createMetricMutation = useCreateSiteMetric();
  const updateMetricMutation = useUpdateSiteMetric();

  const isEditMode = !!metric;

  const form = useForm<MetricFormValues>({
    resolver: zodResolver(metricFormSchema),
    defaultValues: {
      code: "",
      label: "",
      category: "",
      unit: "",
      description: "",
      shortDescription: "",
      whatItMeasures: "",
      whyItMatters: "",
      metricType: 'lower_is_better',
      availableOrgTypes: undefined,
      sportAssociations: undefined,
      isDerived: false,
      formula: "",
      calculationConfig: {
        dateMatchStrategy: 'same_date',
        maxDateDifference: 7,
        missingSourceBehavior: 'skip',
      },
    },
  });

  // Watch isDerived to show/hide derived metric fields
  const isDerived = form.watch('isDerived');
  const formula = form.watch('formula');
  const dateMatchStrategy = form.watch('calculationConfig.dateMatchStrategy');

  // Validate formula with debounce
  const formulaValidation = useValidateFormula(
    isDerived && formula ? formula : '',
    isEditMode ? metric?.code : undefined
  );

  // Populate form when editing
  useEffect(() => {
    if (metric && open) {
      form.reset({
        code: metric.code,
        label: metric.label,
        category: metric.category || "",
        unit: metric.unit || "",
        description: metric.description || "",
        shortDescription: metric.shortDescription || "",
        whatItMeasures: metric.whatItMeasures || "",
        whyItMatters: metric.whyItMatters || "",
        metricType: metric.metricType,
        availableOrgTypes: metric.availableOrgTypes || undefined,
        sportAssociations: metric.sportAssociations || undefined,
        isDerived: metric.isDerived || false,
        formula: metric.formula || "",
        calculationConfig: metric.calculationConfig || {
          dateMatchStrategy: 'same_date',
          maxDateDifference: 7,
          missingSourceBehavior: 'skip',
        },
      });
    } else if (!open) {
      // Reset form when dialog closes
      form.reset({
        code: "",
        label: "",
        category: "",
        unit: "",
        description: "",
        shortDescription: "",
        whatItMeasures: "",
        whyItMatters: "",
        metricType: 'lower_is_better',
        availableOrgTypes: undefined,
        sportAssociations: undefined,
        isDerived: false,
        formula: "",
        calculationConfig: {
          dateMatchStrategy: 'same_date',
          maxDateDifference: 7,
          missingSourceBehavior: 'skip',
        },
      });
    }
  }, [metric, open, form]);

  const onSubmit = async (data: MetricFormValues) => {
    try {
      if (isEditMode) {
        // Update existing metric
        // CONSISTENCY FIX: Use undefined for all optional fields (Drizzle convention)
        // undefined = "don't update", null = "clear field"
        await updateMetricMutation.mutateAsync({
          code: metric.code,
          data: {
            label: data.label,
            category: data.category || undefined,
            unit: data.unit || undefined,
            description: data.description || undefined,
            shortDescription: data.shortDescription?.trim() || null,
            whatItMeasures: data.whatItMeasures?.trim() || null,
            whyItMatters: data.whyItMatters?.trim() || null,
            metricType: data.metricType,
            availableOrgTypes: data.availableOrgTypes?.length ? data.availableOrgTypes : undefined,
            sportAssociations: data.sportAssociations?.length ? data.sportAssociations : undefined,
            isDerived: data.isDerived,
            formula: data.isDerived ? data.formula : undefined,
            dependentMetrics: data.isDerived && formulaValidation.data?.dependentMetrics
              ? formulaValidation.data.dependentMetrics
              : undefined,
            calculationConfig: data.isDerived ? data.calculationConfig : undefined,
          },
        });
        toast({
          title: "Metric updated",
          description: `${data.label} has been updated successfully.`,
        });
      } else {
        // Create new metric
        await createMetricMutation.mutateAsync({
          code: data.code,
          label: data.label,
          category: data.category || undefined,
          unit: data.unit || undefined,
          description: data.description || undefined,
          shortDescription: data.shortDescription?.trim() || undefined,
          whatItMeasures: data.whatItMeasures?.trim() || undefined,
          whyItMatters: data.whyItMatters?.trim() || undefined,
          metricType: data.metricType,
          availableOrgTypes: data.availableOrgTypes || undefined,
          sportAssociations: data.sportAssociations || undefined,
          isActive: true,
          decimalPrecision: DEFAULT_DECIMAL_PRECISION,
          isDerived: data.isDerived,
          formula: data.isDerived ? data.formula : undefined,
          dependentMetrics: data.isDerived && formulaValidation.data?.dependentMetrics
            ? formulaValidation.data.dependentMetrics
            : undefined,
          calculationConfig: data.isDerived ? data.calculationConfig : undefined,
        });
        toast({
          title: "Metric created",
          description: `${data.label} has been created successfully.`,
        });
      }
      onOpenChange(false);
    } catch (error) {
      toast({
        title: isEditMode ? "Update failed" : "Create failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="metric-form-dialog">
        <DialogHeader>
          <DialogTitle data-testid="metric-form-title">
            {isEditMode ? "Edit Metric" : "Add New Metric"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the metric details below."
              : "Create a new metric for the platform. The code cannot be changed after creation."}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable form container */}
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <Form {...form}>
            <form id="metric-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Code field */}
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="FLY10_TIME"
                      disabled={isEditMode} // Cannot change code in edit mode
                      data-testid="metric-code-input"
                    />
                  </FormControl>
                  <FormDescription>
                    Unique identifier (uppercase letters, numbers, underscores)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Label field */}
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="10-Yard Fly Time"
                      data-testid="metric-label-input"
                    />
                  </FormControl>
                  <FormDescription>
                    Display name shown in the UI
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category field */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Speed"
                      data-testid="metric-category-input"
                    />
                  </FormControl>
                  <FormDescription>
                    Optional grouping category (e.g., Speed, Strength, Agility)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Unit field */}
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="seconds"
                      data-testid="metric-unit-input"
                    />
                  </FormControl>
                  <FormDescription>
                    Unit of measurement (e.g., seconds, inches, mph)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Metric Type field */}
            <FormField
              control={form.control}
              name="metricType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Performance Direction *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="metric-direction-select">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="higher_is_better">Higher is better</SelectItem>
                      <SelectItem value="lower_is_better">Lower is better</SelectItem>
                      <SelectItem value="tracking">Tracking only (no direction)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Direction of improvement for this metric. Use &quot;Tracking&quot; for metrics like height/weight where neither direction is inherently better.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description field */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Detailed description of the metric..."
                      rows={3}
                      data-testid="metric-description-input"
                    />
                  </FormControl>
                  <FormDescription>
                    Optional detailed description for users
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Report Explanation Fields */}
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-3">Report Explanations</p>
              <p className="text-xs text-muted-foreground mb-4">
                These fields appear in report glossaries and athlete-facing explanations. Supports Markdown.
              </p>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="shortDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short Description</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="One-line summary for card views"
                          data-testid="metric-short-description-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="whatItMeasures"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What It Measures</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Describe what this metric measures and how the test works..."
                          rows={3}
                          data-testid="metric-what-it-measures-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="whyItMatters"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Why It Matters</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Explain why this metric is important for athletic development..."
                          rows={3}
                          data-testid="metric-why-it-matters-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Available Organization Types field */}
            <FormField
              control={form.control}
              name="availableOrgTypes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Available to Organization Types</FormLabel>
                  <FormControl>
                    <OrganizationTypeMultiSelect
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="All organizations (default)"
                    />
                  </FormControl>
                  <FormDescription>
                    Leave empty to make this metric available to all organization types.
                    Select specific types to restrict availability.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sport Associations field */}
            <FormField
              control={form.control}
              name="sportAssociations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Relevant Sports</FormLabel>
                  <FormControl>
                    <SportMultiSelect
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="All sports (default)"
                    />
                  </FormControl>
                  <FormDescription>
                    Tag this metric with relevant sports to help organizations find applicable tests.
                    Leave empty if the metric applies to all sports.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Derived Metric Section */}
            <div className="pt-4 border-t">
              <FormField
                control={form.control}
                name="isDerived"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Derived Metric</FormLabel>
                      <FormDescription>
                        Calculate this metric's value from other metrics
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="is-derived-switch"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Derived metric fields - shown when isDerived is true */}
              {isDerived && (
                <div className="mt-4 space-y-4 rounded-lg bg-muted/50 p-4">
                  {/* Formula field */}
                  <FormField
                    control={form.control}
                    name="formula"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Formula *</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Input
                              {...field}
                              placeholder="10 / fly10_time * 2.045"
                              data-testid="formula-input"
                            />
                            {/* Validation feedback */}
                            {field.value && formulaValidation.data && (
                              <div className="flex items-start gap-2 text-sm">
                                {formulaValidation.data.valid ? (
                                  <>
                                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                                    <div className="text-green-600">
                                      Formula valid - uses: {formulaValidation.data.dependentMetrics?.join(', ')}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-4 w-4 text-destructive mt-0.5" />
                                    <div className="text-destructive">
                                      {formulaValidation.data.error || 'Invalid formula'}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            {field.value && formulaValidation.isLoading && (
                              <div className="text-sm text-muted-foreground">
                                Validating formula...
                              </div>
                            )}
                          </div>
                        </FormControl>
                        <FormDescription>
                          Use metric codes as variables (e.g., fly10_time, vertical_jump). Functions: sqrt(), pow(), abs(), round(), min(), max()
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Date Matching Strategy */}
                  <FormField
                    control={form.control}
                    name="calculationConfig.dateMatchStrategy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date Matching Strategy</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="date-match-strategy-select">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="same_date">Same date only</SelectItem>
                            <SelectItem value="latest_before">Latest available before date</SelectItem>
                            <SelectItem value="closest">Closest within days</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          How to match source metric dates when calculating this metric
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Max Date Difference - shown when closest is selected */}
                  {dateMatchStrategy === 'closest' && (
                    <FormField
                      control={form.control}
                      name="calculationConfig.maxDateDifference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum days difference</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={365}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                              data-testid="max-date-difference-input"
                            />
                          </FormControl>
                          <FormDescription>
                            Maximum number of days between source metric dates (1-365)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Missing Source Behavior */}
                  <FormField
                    control={form.control}
                    name="calculationConfig.missingSourceBehavior"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>When source metrics are missing</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="missing-source-behavior-select">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="skip">Skip calculation</SelectItem>
                            <SelectItem value="error">Show error</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          What to do when required source metrics are not available
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>
            </form>
          </Form>
        </div>

        {/* Form actions - fixed at bottom */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="cancel-metric-button"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="metric-form"
            disabled={
              createMetricMutation.isPending || updateMetricMutation.isPending
            }
            data-testid="save-metric-button"
          >
            {createMetricMutation.isPending || updateMetricMutation.isPending
              ? "Saving..."
              : isEditMode
                ? "Update Metric"
                : "Create Metric"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
