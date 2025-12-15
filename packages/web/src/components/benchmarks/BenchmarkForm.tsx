import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateSiteBenchmark,
  useUpdateSiteBenchmark,
} from "@/lib/benchmarks-api";
import {
  insertSiteBenchmarkSchema,
  updateSiteBenchmarkSchema,
  type InsertSiteBenchmark,
  type SiteBenchmark,
} from "@shared/schema";
import { z } from "zod";
import { OrganizationTypeMultiSelect } from "@/components/organization-type-multi-select";

// Tier color options
const TIER_COLORS = [
  { value: "gold", label: "Gold", className: "bg-amber-500" },
  { value: "emerald", label: "Emerald", className: "bg-emerald-500" },
  { value: "silver", label: "Silver", className: "bg-slate-400" },
  { value: "blue", label: "Blue", className: "bg-blue-500" },
  { value: "bronze", label: "Bronze", className: "bg-orange-600" },
  { value: "amber", label: "Amber", className: "bg-amber-600" },
  { value: "slate", label: "Slate", className: "bg-slate-500" },
];

interface BenchmarkFormProps {
  open: boolean;
  onClose: () => void;
  benchmark: SiteBenchmark | null;
}

export function BenchmarkForm({ open, onClose, benchmark }: BenchmarkFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!benchmark;

  // Fetch available metrics (site admin context)
  const { data: metrics = [] } = useQuery({
    queryKey: ["/api/site-metrics"],
    queryFn: async () => {
      const response = await fetch("/api/site-metrics?includeInactive=false");
      if (!response.ok) throw new Error("Failed to fetch metrics");
      return response.json();
    },
    enabled: open,
  });

  const createMutation = useCreateSiteBenchmark();
  const updateMutation = useUpdateSiteBenchmark();

  // State for tier mode toggle
  const [isTierMode, setIsTierMode] = useState(false);

  const form = useForm<InsertSiteBenchmark>({
    resolver: zodResolver(insertSiteBenchmarkSchema),
    defaultValues: {
      metricCode: "",
      name: "",
      description: "",
      benchmarkValue: undefined,
      comparisonOperator: "lte",
      minValue: undefined,
      maxValue: undefined,
      tierGroupId: undefined,
      tierOrder: undefined,
      tierName: undefined,
      tierColor: undefined,
      gender: undefined,
      ageMin: undefined,
      ageMax: undefined,
      position: undefined,
      level: undefined,
      applicableOrgTypes: undefined,
      isActive: true,
      displayOrder: undefined,
      color: undefined,
      icon: undefined,
    },
  });

  // Watch comparison operator to conditionally show range fields
  const comparisonOperator = form.watch("comparisonOperator");
  const selectedMetricCode = form.watch("metricCode");

  // Clear tier fields when tier mode is disabled or when switching away from range
  useEffect(() => {
    if (!isTierMode || comparisonOperator !== 'range') {
      form.setValue("tierGroupId", undefined);
      form.setValue("tierOrder", undefined);
      form.setValue("tierName", undefined);
      form.setValue("tierColor", undefined);
    }
  }, [isTierMode, comparisonOperator, form]);

  // Fetch existing tier groups for the selected metric
  const { data: tierGroups = [] } = useQuery({
    queryKey: ["/api/site-benchmarks/tier-groups", selectedMetricCode],
    queryFn: async () => {
      const url = selectedMetricCode
        ? `/api/site-benchmarks/tier-groups?metricCode=${selectedMetricCode}`
        : `/api/site-benchmarks/tier-groups`;
      const response = await fetch(url);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: open && isTierMode,
  });

  useEffect(() => {
    if (benchmark) {
      // Set tier mode if benchmark has tier fields
      setIsTierMode(!!benchmark.tierGroupId);

      form.reset({
        metricCode: benchmark.metricCode,
        name: benchmark.name,
        description: benchmark.description || "",
        benchmarkValue: benchmark.benchmarkValue ? parseFloat(benchmark.benchmarkValue) : undefined,
        comparisonOperator: benchmark.comparisonOperator as 'lte' | 'gte' | 'eq' | 'range',
        minValue: benchmark.minValue ? parseFloat(benchmark.minValue) : undefined,
        maxValue: benchmark.maxValue ? parseFloat(benchmark.maxValue) : undefined,
        tierGroupId: benchmark.tierGroupId || undefined,
        tierOrder: benchmark.tierOrder || undefined,
        tierName: benchmark.tierName || undefined,
        tierColor: benchmark.tierColor || undefined,
        gender: benchmark.gender as 'Male' | 'Female' | 'Not Specified' | undefined,
        ageMin: benchmark.ageMin || undefined,
        ageMax: benchmark.ageMax || undefined,
        position: benchmark.position || undefined,
        level: benchmark.level || undefined,
        applicableOrgTypes: benchmark.applicableOrgTypes || undefined,
        isActive: benchmark.isActive,
        displayOrder: benchmark.displayOrder || undefined,
        color: benchmark.color || undefined,
        icon: benchmark.icon || undefined,
      });
    } else {
      setIsTierMode(false);
      form.reset({
        metricCode: "",
        name: "",
        description: "",
        benchmarkValue: undefined,
        comparisonOperator: "lte",
        minValue: undefined,
        maxValue: undefined,
        tierGroupId: undefined,
        tierOrder: undefined,
        tierName: undefined,
        tierColor: undefined,
        gender: undefined,
        ageMin: undefined,
        ageMax: undefined,
        position: undefined,
        level: undefined,
        applicableOrgTypes: undefined,
        isActive: true,
        displayOrder: undefined,
        color: undefined,
        icon: undefined,
      });
    }
  }, [benchmark, form]);

  const onSubmit = async (data: InsertSiteBenchmark) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: benchmark.id,
          data: data as Partial<z.infer<typeof updateSiteBenchmarkSchema>>,
        });
        toast({
          title: "Benchmark Updated",
          description: "Benchmark has been updated successfully.",
        });
      } else {
        await createMutation.mutateAsync(data);
        toast({
          title: "Benchmark Created",
          description: "New benchmark has been created successfully.",
        });
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save benchmark.",
        variant: "destructive",
      });
    }
  };

  // Debug: Show validation errors when form submission fails
  const onFormError = (errors: any) => {
    console.log("Form validation errors:", errors);
    // Show toast with first error
    const firstError = Object.values(errors)[0] as any;
    if (firstError?.message) {
      toast({
        title: "Validation Error",
        description: firstError.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Benchmark" : "Create New Benchmark"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the benchmark details below."
              : "Create a new benchmark that can be enabled by organizations."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onFormError)} className="space-y-4">
            {/* Form Error Summary */}
            {Object.keys(form.formState.errors).length > 0 && (
              <div className="bg-destructive/15 border border-destructive text-destructive px-4 py-3 rounded-md">
                <p className="font-medium">Please fix the following errors:</p>
                <ul className="list-disc list-inside text-sm mt-1">
                  {Object.entries(form.formState.errors).map(([key, error]) => (
                    <li key={key}>{(error as any)?.message || `Invalid ${key}`}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="max-h-[60vh] overflow-y-auto pr-4">
              <div className="space-y-4">
                {/* Metric Code */}
                <FormField
                  control={form.control}
                  name="metricCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Metric *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isEditing} // Cannot change metric after creation
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a metric" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {metrics.map((metric: any) => (
                            <SelectItem key={metric.code} value={metric.code}>
                              {metric.label} ({metric.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Benchmark Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Elite Performance Benchmark" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          placeholder="Describe what this benchmark represents..."
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Comparison Operator */}
                <FormField
                  control={form.control}
                  name="comparisonOperator"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Benchmark Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="comparison-operator-select">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="lte">≤ Lower is better (single value)</SelectItem>
                          <SelectItem value="gte">≥ Higher is better (single value)</SelectItem>
                          <SelectItem value="eq">= Exact match (single value)</SelectItem>
                          <SelectItem value="range">↔ Target Range (min-max)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {comparisonOperator === 'range'
                          ? "Athlete must fall within the specified range"
                          : "Single threshold comparison"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Single Value (for non-range benchmarks) */}
                {comparisonOperator !== 'range' && (
                  <FormField
                    control={form.control}
                    name="benchmarkValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Value *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.001"
                            placeholder="1.00"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Range Values (for range benchmarks) */}
                {comparisonOperator === 'range' && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="minValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum Value *</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              step="0.01"
                              placeholder="4.20"
                              value={field.value ?? ''}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormDescription>Lower bound of acceptable range</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum Value *</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              step="0.01"
                              placeholder="4.50"
                              value={field.value ?? ''}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormDescription>Upper bound of acceptable range</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* Tier Group Section (only for range benchmarks) */}
                {comparisonOperator === 'range' && (
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-semibold">Performance Tier</h3>
                        <p className="text-sm text-muted-foreground">
                          Group related benchmarks into tiers (e.g., Elite, Excellent, Good)
                        </p>
                      </div>
                      <Switch
                        checked={isTierMode}
                        onCheckedChange={(checked) => {
                          setIsTierMode(checked);
                          if (!checked) {
                            // Clear tier fields when disabling tier mode
                            form.setValue("tierGroupId", undefined);
                            form.setValue("tierOrder", undefined);
                            form.setValue("tierName", undefined);
                            form.setValue("tierColor", undefined);
                          } else {
                            // Generate new tier group ID when enabling
                            form.setValue("tierGroupId", crypto.randomUUID());
                          }
                        }}
                      />
                    </div>

                    {isTierMode && (
                      <div className="space-y-4 pl-4 border-l-2 border-muted">
                        {/* Tier Group Selection */}
                        {tierGroups.length > 0 && (
                          <FormField
                            control={form.control}
                            name="tierGroupId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Tier Group</FormLabel>
                                <Select
                                  onValueChange={(value) => {
                                    if (value === "new") {
                                      field.onChange(crypto.randomUUID());
                                    } else {
                                      field.onChange(value);
                                    }
                                  }}
                                  value={field.value || "new"}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select or create tier group" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="new">+ Create New Tier Group</SelectItem>
                                    {tierGroups.map((group: { tierGroupId: string; metricCode: string; tierCount: number }) => (
                                      <SelectItem key={group.tierGroupId} value={group.tierGroupId}>
                                        Existing Group ({group.tierCount} tiers)
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Add to an existing tier group or create a new one
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {/* Tier Name */}
                        <FormField
                          control={form.control}
                          name="tierName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tier Name *</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  value={field.value || ""}
                                  placeholder="e.g., Elite, Excellent, Good"
                                />
                              </FormControl>
                              <FormDescription>
                                Display name for this tier level
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Tier Order */}
                        <FormField
                          control={form.control}
                          name="tierOrder"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tier Rank *</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="number"
                                  min="1"
                                  step="1"
                                  placeholder="1"
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                />
                              </FormControl>
                              <FormDescription>
                                1 = best tier, 2 = second best, etc.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Tier Color */}
                        <FormField
                          control={form.control}
                          name="tierColor"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tier Color</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ""}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a color" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {TIER_COLORS.map((color) => (
                                    <SelectItem key={color.value} value={color.value}>
                                      <div className="flex items-center gap-2">
                                        <div className={`w-4 h-4 rounded ${color.className}`} />
                                        {color.label}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Color for the tier badge display
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Athlete Filters Section */}
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold mb-3">Athlete Filters (Optional)</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Leave blank to apply to all athletes. Specify filters to target specific athlete
                    groups.
                  </p>

                  {/* Gender */}
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem className="mb-4">
                        <FormLabel>Gender</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(value === "all" ? undefined : value)
                          }
                          value={field.value || "all"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="All genders" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all">All Genders</SelectItem>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Age Range */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <FormField
                      control={form.control}
                      name="ageMin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Age</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              placeholder="e.g., 18"
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(e.target.value ? parseInt(e.target.value) : undefined)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="ageMax"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Age</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              placeholder="e.g., 22"
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(e.target.value ? parseInt(e.target.value) : undefined)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Position */}
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem className="mb-4">
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="e.g., Forward, Defense"
                          />
                        </FormControl>
                        <FormDescription>Specific position or role</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Level */}
                  <FormField
                    control={form.control}
                    name="level"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Level</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="e.g., College, High School, Club"
                          />
                        </FormControl>
                        <FormDescription>Skill or competitive level</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Organization Types */}
                  <FormField
                    control={form.control}
                    name="applicableOrgTypes"
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormLabel>Applicable to Organization Types</FormLabel>
                        <FormControl>
                          <OrganizationTypeMultiSelect
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="All organizations (default)"
                          />
                        </FormControl>
                        <FormDescription>
                          Leave empty to apply this benchmark to all organization types.
                          Select specific types to restrict applicability.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : isEditing
                    ? "Update Benchmark"
                    : "Create Benchmark"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
