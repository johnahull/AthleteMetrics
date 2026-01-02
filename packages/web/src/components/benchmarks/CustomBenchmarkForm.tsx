import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
import { useContextualLabels } from "@/hooks/useContextualLabels";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateCustomBenchmark,
  useUpdateCustomBenchmark,
} from "@/lib/benchmarks-api";
import {
  insertCustomBenchmarkSchema,
  updateCustomBenchmarkSchema,
  type InsertCustomBenchmark,
  type CustomBenchmark,
  type SiteSport,
  type SitePosition,
} from "@shared/schema";
import { z } from "zod";
import { useSports, usePositions } from "@/lib/sports-api";

interface CustomBenchmarkFormProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  benchmark: CustomBenchmark | null;
}

export function CustomBenchmarkForm({
  open,
  onClose,
  organizationId,
  benchmark,
}: CustomBenchmarkFormProps) {
  const labels = useContextualLabels();
  const { toast } = useToast();
  const isEditing = !!benchmark;

  // Fetch available metrics filtered by organization type
  const { data: metrics = [] } = useQuery({
    queryKey: ["/api/metrics", organizationId],
    queryFn: async () => {
      const response = await fetch("/api/metrics?includeInactive=false", {
        headers: {
          'x-organization-id': organizationId,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch metrics");
      return response.json();
    },
    enabled: open && !!organizationId,
  });

  const createMutation = useCreateCustomBenchmark();
  const updateMutation = useUpdateCustomBenchmark();

  // Create form type without organizationId (it's passed separately)
  // insertCustomBenchmarkSchema is a ZodEffects, so we manually create the form schema
  const formSchema = z.object({
    metricCode: z.string().min(1, "Metric code is required").max(50),
    name: z.string().min(1, "Benchmark name is required").max(100),
    description: z.string().optional(),
    benchmarkValue: z.number().positive("Benchmark value must be positive").optional(),
    comparisonOperator: z.enum(['lte', 'gte', 'eq', 'range']).default('lte'),
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
    gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
    ageMin: z.number().int().min(0).optional(),
    ageMax: z.number().int().min(0).optional(),
    sport: z.string().min(1).max(50).optional().nullable(),
    position: z.string().min(1).max(50).optional().nullable(),
    level: z.string().max(50).optional(),
    isActive: z.boolean().default(true),
    displayOrder: z.number().int().optional(),
    color: z.string().max(20).optional(),
    icon: z.string().max(50).optional(),
  }).refine(
    (data) => {
      if (data.ageMin !== undefined && data.ageMax !== undefined) {
        return data.ageMin <= data.ageMax;
      }
      return true;
    },
    { message: "Age minimum must be less than or equal to age maximum", path: ["ageMin"] }
  ).refine(
    (data) => {
      if (data.comparisonOperator === 'range') {
        return data.minValue !== undefined && data.maxValue !== undefined;
      }
      return true;
    },
    { message: "Range benchmarks require both minValue and maxValue", path: ["minValue"] }
  ).refine(
    (data) => {
      if (data.comparisonOperator === 'range' && data.minValue !== undefined && data.maxValue !== undefined) {
        return data.minValue < data.maxValue;
      }
      return true;
    },
    { message: "minValue must be less than maxValue", path: ["minValue"] }
  ).refine(
    (data) => {
      if (data.comparisonOperator !== 'range') {
        return data.benchmarkValue !== undefined;
      }
      return true;
    },
    { message: "Non-range benchmarks require a benchmarkValue", path: ["benchmarkValue"] }
  ).refine(
    (data) => {
      // Position requires sport (validation constraint)
      if (data.position && !data.sport) {
        return false;
      }
      return true;
    },
    { message: "Position requires sport to be set", path: ["position"] }
  );

  type FormData = z.infer<typeof formSchema>;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      metricCode: "",
      name: "",
      description: "",
      benchmarkValue: 0,
      comparisonOperator: "lte",
      minValue: undefined,
      maxValue: undefined,
      gender: undefined,
      ageMin: undefined,
      ageMax: undefined,
      sport: undefined,
      position: undefined,
      level: undefined,
      isActive: true,
      displayOrder: undefined,
      color: undefined,
      icon: undefined,
    },
  });

  // Watch comparison operator to conditionally show range fields
  const comparisonOperator = form.watch("comparisonOperator");
  const selectedSport = form.watch("sport");

  // Fetch available sports
  const { data: sports = [] } = useSports();

  // Fetch positions for selected sport
  const { data: positions = [] } = usePositions(selectedSport || "");

  // Clear position when sport changes
  useEffect(() => {
    if (!selectedSport) {
      form.setValue("position", undefined);
    }
  }, [selectedSport, form]);

  useEffect(() => {
    if (benchmark) {
      form.reset({
        metricCode: benchmark.metricCode,
        name: benchmark.name,
        description: benchmark.description || "",
        benchmarkValue: benchmark.benchmarkValue ? parseFloat(benchmark.benchmarkValue) : undefined,
        comparisonOperator: benchmark.comparisonOperator as 'lte' | 'gte' | 'eq' | 'range',
        minValue: benchmark.minValue ? parseFloat(benchmark.minValue) : undefined,
        maxValue: benchmark.maxValue ? parseFloat(benchmark.maxValue) : undefined,
        gender: benchmark.gender as 'Male' | 'Female' | 'Not Specified' | undefined,
        ageMin: benchmark.ageMin || undefined,
        ageMax: benchmark.ageMax || undefined,
        sport: benchmark.sport || undefined,
        position: benchmark.position || undefined,
        level: benchmark.level || undefined,
        isActive: benchmark.isActive,
        displayOrder: benchmark.displayOrder || undefined,
        color: benchmark.color || undefined,
        icon: benchmark.icon || undefined,
      });
    } else {
      form.reset({
        metricCode: "",
        name: "",
        description: "",
        benchmarkValue: 0,
        comparisonOperator: "lte",
        minValue: undefined,
        maxValue: undefined,
        gender: undefined,
        ageMin: undefined,
        ageMax: undefined,
        sport: undefined,
        position: undefined,
        level: undefined,
        isActive: true,
        displayOrder: undefined,
        color: undefined,
        icon: undefined,
      });
    }
  }, [benchmark, form]);

  const onSubmit = async (data: FormData) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          organizationId,
          benchmarkId: benchmark.id,
          data: data as Partial<z.infer<typeof updateCustomBenchmarkSchema>>,
        });
        toast({
          title: "Custom Benchmark Updated",
          description: "Custom benchmark has been updated successfully.",
        });
      } else {
        await createMutation.mutateAsync({
          organizationId,
          data: data as Omit<InsertCustomBenchmark, 'organizationId'>,
        });
        toast({
          title: "Custom Benchmark Created",
          description: "New custom benchmark has been created successfully.",
        });
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save custom benchmark.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Custom Benchmark" : "Create Custom Benchmark"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the custom benchmark details below."
              : "Create a custom benchmark specific to your organization."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ScrollArea className="max-h-[60vh] pr-4">
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
                        disabled={isEditing}
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
                        <Input {...field} placeholder={`Custom ${labels.team} Benchmark`} />
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
                          placeholder="Describe what this custom benchmark represents..."
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
                          <SelectTrigger>
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

                {/* Athlete Filters Section */}
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold mb-3">Athlete Filters (Optional)</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Target specific athlete groups within your organization.
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

                  {/* Sport */}
                  <FormField
                    control={form.control}
                    name="sport"
                    render={({ field }) => (
                      <FormItem className="mb-4">
                        <FormLabel>Sport</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(value === "all" ? undefined : value)
                          }
                          value={field.value || "all"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="All sports" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all">All Sports</SelectItem>
                            {sports.map((sport: SiteSport) => (
                              <SelectItem key={sport.code} value={sport.code}>
                                {sport.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Leave as "All Sports" to apply to athletes in any sport
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Position */}
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem className="mb-4">
                        <FormLabel>Position</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(value === "all" ? undefined : value)
                          }
                          value={field.value || "all"}
                          disabled={!selectedSport}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={selectedSport ? "All positions" : "Select sport first"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all">All Positions</SelectItem>
                            {positions.map((position: SitePosition) => (
                              <SelectItem key={position.id} value={position.name}>
                                {position.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {selectedSport
                            ? "Leave as \"All Positions\" to apply to athletes in any position"
                            : "Select a sport first to filter by position"}
                        </FormDescription>
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
                            placeholder="e.g., Varsity, JV"
                          />
                        </FormControl>
                        <FormDescription>Skill or competitive level</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </ScrollArea>

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
