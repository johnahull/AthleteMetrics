import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertMeasurementSchema, type InsertMeasurement } from "@shared/schema";
import { Save } from "lucide-react";
import { useAvailableMetrics } from "@/hooks/use-available-metrics";
import { z } from "zod";

interface AthleteMeasurementFormProps {
  athleteId: string;
  athleteName: string;
  onSuccess?: () => void;
}

// Create dynamic measurement schema that accepts any metric string
// Backend will validate against org-enabled metrics
const dynamicMeasurementSchema = insertMeasurementSchema.omit({ metric: true }).extend({
  metric: z.string().min(1, "Metric is required"),
});

type DynamicInsertMeasurement = z.infer<typeof dynamicMeasurementSchema>;

export default function AthleteMeasurementForm({ athleteId, athleteName, onSuccess }: AthleteMeasurementFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get available metrics using centralized hook (filters by active+enabled)
  const { metrics: availableMetrics } = useAvailableMetrics();

  const firstMetricCode = "FLY10_TIME";

  const form = useForm<DynamicInsertMeasurement>({
    resolver: zodResolver(dynamicMeasurementSchema),
    defaultValues: {
      userId: athleteId,
      date: new Date().toISOString().split('T')[0],
      metric: firstMetricCode,
      value: 0,
      flyInDistance: undefined,
      notes: "",
    },
  });

  const createMeasurementMutation = useMutation({
    mutationFn: async (data: DynamicInsertMeasurement) => {
      const response = await apiRequest("POST", "/api/measurements", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/measurements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/athlete", athleteId] });
      toast({
        title: "Success",
        description: "Measurement added successfully",
      });
      form.reset({
        userId: athleteId,
        date: new Date().toISOString().split('T')[0],
        metric: firstMetricCode,
        value: 0,
        flyInDistance: undefined,
        notes: "",
      });
      onSuccess?.();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add measurement",
        variant: "destructive",
      });
    },
  });

  const metric = form.watch("metric");
  // Get unit from metric config dynamically
  const units = availableMetrics.find(m => m.code === metric)?.unit || "";

  const onSubmit = (data: DynamicInsertMeasurement) => {
    createMeasurementMutation.mutate({
      ...data,
      userId: athleteId,
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-600 mb-4">
        Adding measurement for: <span className="font-medium">{athleteName}</span>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <SelectTrigger data-testid="select-measurement-metric">
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

            {/* Value */}
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
                        data-testid="input-measurement-value"
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

          {/* Submit Button */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button 
              type="submit" 
              disabled={createMeasurementMutation.isPending}
              data-testid="button-save-measurement"
            >
              <Save className="h-4 w-4 mr-2" />
              {createMeasurementMutation.isPending ? "Saving..." : "Save Measurement"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}