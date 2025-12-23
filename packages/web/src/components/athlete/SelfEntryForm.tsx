/**
 * SelfEntryForm Component
 *
 * Allows athletes to self-enter their own measurements
 * These measurements are marked as unverified and not included in peer comparisons
 */

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle } from "lucide-react";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAvailableMetrics } from "@/hooks/use-available-metrics";

// Form validation schema
// Accept any valid metric code - actual validation happens against org-enabled metrics at API level
const selfEntrySchema = z.object({
  metric: z
    .string({
      required_error: "Metric is required",
    })
    .min(1, "Metric is required")
    .regex(/^[A-Z0-9_]+$/, "Invalid metric code format"),
  value: z
    .number({
      required_error: "Value is required",
      invalid_type_error: "Value must be a number",
    })
    .positive("Value must be positive"),
  date: z
    .string({
      required_error: "Date is required",
    })
    .min(1, "Date is required")
    .refine((dateStr) => {
      if (!dateStr) return true; // Let min() handle empty string
      const date = new Date(dateStr);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      return date <= today;
    }, "Date cannot be in the future"),
  notes: z.string().optional(),
});

type SelfEntryFormData = z.infer<typeof selfEntrySchema>;

export interface SelfEntryData {
  metric: string;
  value: number;
  date: string;
  notes?: string;
}

export interface SelfEntryFormProps {
  onSubmit: (data: SelfEntryData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function SelfEntryForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: SelfEntryFormProps) {
  // Get available metrics and filter out derived metrics
  const { metrics: availableMetrics } = useAvailableMetrics();
  const selectableMetrics = availableMetrics.filter(m => !m.isDerived);

  const form = useForm<SelfEntryFormData>({
    resolver: zodResolver(selfEntrySchema),
    defaultValues: {
      metric: '' as SelfEntryFormData['metric'], // Empty string triggers validation on submit
      value: undefined as unknown as number, // undefined triggers validation on submit
      date: new Date().toISOString().split('T')[0], // Default to today
      notes: '',
    },
  });

  // Watch metric field outside render to avoid unnecessary re-renders
  const selectedMetricCode = useWatch({ control: form.control, name: 'metric' });
  const selectedMetric = selectableMetrics.find(m => m.code === selectedMetricCode);

  const handleSubmit = async (data: SelfEntryFormData) => {
    await onSubmit({
      metric: data.metric,
      value: data.value,
      date: data.date,
      notes: data.notes,
    });
  };

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <Alert role="alert" className="border-orange-200 bg-orange-50">
        <AlertCircle className="h-4 w-4 text-orange-600" />
        <AlertDescription className="text-orange-800">
          <strong>Personal Entry</strong> - This measurement is for your personal
          tracking only and will not be included in peer comparisons or official
          records.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Metric Selection */}
          <FormField
            control={form.control}
            name="metric"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Metric</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isSubmitting}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a metric" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {selectableMetrics.map((metric) => (
                      <SelectItem key={metric.code} value={metric.code}>
                        {metric.label}{metric.unit ? ` (${metric.unit})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Enter a value for the selected metric. Some metrics (like calculated top speed) are automatically derived from your other measurements.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Value Input */}
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Value{selectedMetric?.unit ? ` (${selectedMetric.unit})` : ''}
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={selectedMetric?.unit ? `Enter value in ${selectedMetric.unit}` : 'Enter value'}
                    disabled={isSubmitting}
                    {...field}
                    onChange={(e) => {
                      const value = e.target.value;
                      field.onChange(value === '' ? undefined : parseFloat(value));
                    }}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Date Input */}
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    disabled={isSubmitting}
                    {...field}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Notes Textarea */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Add any additional context..."
                    disabled={isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
