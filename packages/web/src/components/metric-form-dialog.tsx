import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { organizationTypeEnum } from "@shared/schema";

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
  description: z.string().optional(),
  lowerIsBetter: z.boolean().default(true),
  availableOrgTypes: z.array(z.enum(organizationTypeEnum)).optional(),
});

type MetricFormValues = z.infer<typeof metricFormSchema>;

interface MetricFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metric?: SiteMetric | null; // If provided, edit mode; otherwise create mode
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
      lowerIsBetter: true,
      availableOrgTypes: undefined,
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (metric && open) {
      form.reset({
        code: metric.code,
        label: metric.label,
        category: metric.category || "",
        unit: metric.unit || "",
        description: metric.description || "",
        lowerIsBetter: metric.lowerIsBetter,
        availableOrgTypes: metric.availableOrgTypes || undefined,
      });
    } else if (!open) {
      // Reset form when dialog closes
      form.reset({
        code: "",
        label: "",
        category: "",
        unit: "",
        description: "",
        lowerIsBetter: true,
        availableOrgTypes: undefined,
      });
    }
  }, [metric, open, form]);

  const onSubmit = async (data: MetricFormValues) => {
    try {
      if (isEditMode) {
        // Update existing metric
        await updateMetricMutation.mutateAsync({
          code: metric.code,
          data: {
            label: data.label,
            category: data.category || undefined,
            unit: data.unit || undefined,
            description: data.description || undefined,
            lowerIsBetter: data.lowerIsBetter,
            availableOrgTypes: data.availableOrgTypes || undefined,
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
          lowerIsBetter: data.lowerIsBetter,
          availableOrgTypes: data.availableOrgTypes || undefined,
          isActive: true,
          decimalPrecision: 3, // Default precision for measurements
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

            {/* Lower is Better field */}
            <FormField
              control={form.control}
              name="lowerIsBetter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Performance Direction *</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === "true")}
                    value={field.value ? "true" : "false"}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="metric-direction-select">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="false">Higher is better</SelectItem>
                      <SelectItem value="true">Lower is better</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Direction of improvement for this metric
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
