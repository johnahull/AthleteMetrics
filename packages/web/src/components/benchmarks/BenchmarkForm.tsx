import { useEffect } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface BenchmarkFormProps {
  open: boolean;
  onClose: () => void;
  benchmark: SiteBenchmark | null;
}

export function BenchmarkForm({ open, onClose, benchmark }: BenchmarkFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!benchmark;

  // Fetch available metrics
  const { data: metrics = [] } = useQuery({
    queryKey: ["/api/metrics"],
    queryFn: async () => {
      const response = await fetch("/api/metrics?includeInactive=false");
      if (!response.ok) throw new Error("Failed to fetch metrics");
      return response.json();
    },
    enabled: open,
  });

  const createMutation = useCreateSiteBenchmark();
  const updateMutation = useUpdateSiteBenchmark();

  const form = useForm<InsertSiteBenchmark>({
    resolver: zodResolver(insertSiteBenchmarkSchema),
    defaultValues: {
      metricCode: "",
      name: "",
      description: "",
      benchmarkValue: 0,
      comparisonOperator: "lte",
      gender: undefined,
      ageMin: undefined,
      ageMax: undefined,
      position: undefined,
      level: undefined,
      isActive: true,
      displayOrder: undefined,
      color: undefined,
      icon: undefined,
    },
  });

  useEffect(() => {
    if (benchmark) {
      form.reset({
        metricCode: benchmark.metricCode,
        name: benchmark.name,
        description: benchmark.description || "",
        benchmarkValue: parseFloat(benchmark.benchmarkValue),
        comparisonOperator: benchmark.comparisonOperator as 'lte' | 'gte' | 'eq',
        gender: benchmark.gender as 'Male' | 'Female' | 'Not Specified' | undefined,
        ageMin: benchmark.ageMin || undefined,
        ageMax: benchmark.ageMax || undefined,
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
        gender: undefined,
        ageMin: undefined,
        ageMax: undefined,
        position: undefined,
        level: undefined,
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

                {/* Benchmark Value & Operator */}
                <div className="grid grid-cols-2 gap-4">
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
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="comparisonOperator"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Comparison</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="comparison-operator-select">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="lte">≤ Lower is better</SelectItem>
                            <SelectItem value="gte">≥ Higher is better</SelectItem>
                            <SelectItem value="eq">= Exact match</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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
