import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateCustomOrgMetric,
  useUpdateCustomOrgMetric,
} from "@/lib/custom-metrics-api";
import { FormulaBuilder } from "./FormulaBuilder";
import { useSports } from "@/lib/sports-api";
import type { CustomOrgMetric, SiteSport } from "@shared/schema";
import { z } from "zod";

interface CustomOrgMetricFormProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  metric: CustomOrgMetric | null;
}

// Form schema
const formSchema = z.object({
  label: z.string().min(1, "Label is required").max(100),
  category: z.string().max(50).optional(),
  unit: z.string().max(20).optional(),
  metricType: z.enum(['lower_is_better', 'higher_is_better', 'tracking']),
  description: z.string().optional(),
  validationMin: z.number().optional(),
  validationMax: z.number().optional(),
  decimalPrecision: z.number().int().min(0).max(10).optional(),
  sportAssociations: z.array(z.string()).optional(),
  isDerived: z.boolean().default(false),
  formula: z.string().max(1000).optional(),
  displayOrder: z.number().int().optional(),
  color: z.string().max(20).optional(),
}).refine(
  (data) => {
    if (data.validationMin !== undefined && data.validationMax !== undefined) {
      return data.validationMin < data.validationMax;
    }
    return true;
  },
  { message: "Minimum must be less than maximum", path: ["validationMin"] }
).refine(
  (data) => {
    if (data.isDerived && (!data.formula || data.formula.trim() === '')) {
      return false;
    }
    return true;
  },
  { message: "Formula is required for derived metrics", path: ["formula"] }
);

type FormData = z.infer<typeof formSchema>;

const METRIC_CATEGORIES = [
  { value: "speed", label: "Speed" },
  { value: "power", label: "Power" },
  { value: "agility", label: "Agility" },
  { value: "endurance", label: "Endurance" },
  { value: "strength", label: "Strength" },
  { value: "flexibility", label: "Flexibility" },
  { value: "body_composition", label: "Body Composition" },
  { value: "sport_specific", label: "Sport Specific" },
  { value: "recovery", label: "Recovery" },
  { value: "custom", label: "Custom" },
];

// Validates hex color format to prevent XSS via style injection
function isValidHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

export function CustomOrgMetricForm({
  open,
  onClose,
  organizationId,
  metric,
}: CustomOrgMetricFormProps) {
  const { toast } = useToast();
  const isEditing = !!metric;
  const [activeTab, setActiveTab] = useState("basic");

  const { data: sports = [] } = useSports();

  const createMutation = useCreateCustomOrgMetric();
  const updateMutation = useUpdateCustomOrgMetric();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      label: "",
      category: undefined,
      unit: "",
      metricType: "higher_is_better",
      description: "",
      validationMin: undefined,
      validationMax: undefined,
      decimalPrecision: 3,
      sportAssociations: [],
      isDerived: false,
      formula: "",
      displayOrder: undefined,
      color: undefined,
    },
  });

  const isDerived = form.watch("isDerived");

  // Reset form when metric changes
  useEffect(() => {
    if (metric) {
      form.reset({
        label: metric.label,
        category: metric.category || undefined,
        unit: metric.unit || "",
        metricType: metric.metricType,
        description: metric.description || "",
        validationMin: metric.validationMin ? parseFloat(metric.validationMin) : undefined,
        validationMax: metric.validationMax ? parseFloat(metric.validationMax) : undefined,
        decimalPrecision: metric.decimalPrecision ?? 3,
        sportAssociations: metric.sportAssociations || [],
        isDerived: metric.isDerived ?? false,
        formula: metric.formula || "",
        displayOrder: metric.displayOrder || undefined,
        color: metric.color || undefined,
      });
    } else {
      form.reset({
        label: "",
        category: undefined,
        unit: "",
        metricType: "higher_is_better",
        description: "",
        validationMin: undefined,
        validationMax: undefined,
        decimalPrecision: 3,
        sportAssociations: [],
        isDerived: false,
        formula: "",
        displayOrder: undefined,
        color: undefined,
      });
    }
    setActiveTab("basic");
  }, [metric, form]);

  const onSubmit = async (data: FormData) => {
    try {
      // Transform form data to API format (numbers to strings for decimal fields)
      const apiData = {
        ...data,
        validationMin: data.validationMin?.toString(),
        validationMax: data.validationMax?.toString(),
      };

      if (isEditing) {
        await updateMutation.mutateAsync({
          organizationId,
          code: metric.code,
          data: apiData,
        });
        toast({
          title: "Metric Updated",
          description: "Custom metric has been updated successfully.",
        });
      } else {
        await createMutation.mutateAsync({
          organizationId,
          data: apiData,
        });
        toast({
          title: "Metric Created",
          description: "New custom metric has been created successfully.",
        });
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save custom metric.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Custom Metric" : "Create Custom Metric"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the custom metric details below."
              : "Create a custom metric specific to your organization."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="validation">Validation</TabsTrigger>
                <TabsTrigger value="derived">Derived</TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[400px] pr-4">
                {/* Basic Info Tab */}
                <TabsContent value="basic" className="space-y-4 mt-4">
                  {/* Label */}
                  <FormField
                    control={form.control}
                    name="label"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Metric Name *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., 15m Sprint Time" />
                        </FormControl>
                        <FormDescription>
                          A human-readable name for this metric
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Metric Type */}
                  <FormField
                    control={form.control}
                    name="metricType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Metric Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="lower_is_better">
                              Lower is Better (e.g., sprint times)
                            </SelectItem>
                            <SelectItem value="higher_is_better">
                              Higher is Better (e.g., jump height)
                            </SelectItem>
                            <SelectItem value="tracking">
                              Tracking Only (no improvement direction)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Category */}
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No Category</SelectItem>
                            {METRIC_CATEGORIES.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Unit */}
                  <FormField
                    control={form.control}
                    name="unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="e.g., s, in, mph" />
                        </FormControl>
                        <FormDescription>
                          Unit of measurement (seconds, inches, mph, etc.)
                        </FormDescription>
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
                            placeholder="Describe what this metric measures..."
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Sport Associations */}
                  <FormField
                    control={form.control}
                    name="sportAssociations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sport Associations</FormLabel>
                        <FormDescription className="mb-2">
                          Select sports that commonly use this metric
                        </FormDescription>
                        <div className="flex flex-wrap gap-2">
                          {sports.map((sport: SiteSport) => {
                            const isSelected = field.value?.includes(sport.code) || false;
                            return (
                              <Button
                                key={sport.code}
                                type="button"
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  const current = field.value || [];
                                  if (isSelected) {
                                    field.onChange(current.filter((s) => s !== sport.code));
                                  } else {
                                    field.onChange([...current, sport.code]);
                                  }
                                }}
                              >
                                {sport.name}
                              </Button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                {/* Validation Tab */}
                <TabsContent value="validation" className="space-y-4 mt-4">
                  {/* Decimal Precision */}
                  <FormField
                    control={form.control}
                    name="decimalPrecision"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Decimal Precision</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            max={10}
                            value={field.value ?? 3}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription>
                          Number of decimal places to display (0-10)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Validation Range */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="validationMin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum Value</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              step="any"
                              placeholder="e.g., 0"
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            Optional minimum valid value
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="validationMax"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum Value</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              step="any"
                              placeholder="e.g., 100"
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            Optional maximum valid value
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Display Order */}
                  <FormField
                    control={form.control}
                    name="displayOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Order</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            placeholder="e.g., 1"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value ? parseInt(e.target.value) : undefined)
                            }
                          />
                        </FormControl>
                        <FormDescription>
                          Lower numbers appear first in lists
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Color */}
                  <FormField
                    control={form.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Color (Optional)</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ""}
                              placeholder="e.g., #3B82F6"
                            />
                          </FormControl>
                          {field.value && isValidHexColor(field.value) && (
                            <div
                              className="w-10 h-10 rounded border"
                              style={{ backgroundColor: field.value }}
                              aria-label={`Color preview: ${field.value}`}
                            />
                          )}
                        </div>
                        <FormDescription>
                          Hex color for charts and displays (e.g., #3B82F6)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                {/* Derived Metrics Tab */}
                <TabsContent value="derived" className="space-y-4 mt-4">
                  {/* Is Derived Toggle */}
                  <FormField
                    control={form.control}
                    name="isDerived"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Derived Metric</FormLabel>
                          <FormDescription>
                            Calculate this metric from other metrics using a formula
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Formula */}
                  {isDerived && (
                    <FormField
                      control={form.control}
                      name="formula"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Formula *</FormLabel>
                          <FormControl>
                            <FormulaBuilder
                              organizationId={organizationId}
                              value={field.value || ""}
                              onChange={field.onChange}
                              excludeCode={metric?.code}
                            />
                          </FormControl>
                          <FormDescription>
                            Use metric codes (type to autocomplete) and operators (+, -, *, /, parentheses)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {!isDerived && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Enable "Derived Metric" above to create a calculated metric.</p>
                      <p className="text-sm mt-2">
                        Derived metrics automatically calculate values from other metrics
                        using a formula you define.
                      </p>
                    </div>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>

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
                    ? "Update Metric"
                    : "Create Metric"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
