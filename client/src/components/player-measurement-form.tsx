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

interface PlayerMeasurementFormProps {
  playerId: string;
  playerName: string;
  onSuccess?: () => void;
}

export default function PlayerMeasurementForm({ playerId, playerName, onSuccess }: PlayerMeasurementFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertMeasurement>({
    resolver: zodResolver(insertMeasurementSchema),
    defaultValues: {
      playerId: playerId,
      date: new Date().toISOString().split('T')[0],
      metric: "FLY10_TIME",
      value: 0,
      flyInDistance: undefined,
      notes: "",
    },
  });

  const createMeasurementMutation = useMutation({
    mutationFn: async (data: InsertMeasurement) => {
      const response = await apiRequest("POST", "/api/measurements", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/measurements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/player", playerId] });
      toast({
        title: "Success",
        description: "Measurement added successfully",
      });
      form.reset({
        playerId: playerId,
        date: new Date().toISOString().split('T')[0],
        metric: "FLY10_TIME",
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
  const units = metric === "VERTICAL_JUMP" ? "in" : "s";

  const onSubmit = (data: InsertMeasurement) => {
    createMeasurementMutation.mutate({
      ...data,
      playerId: playerId,
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-600 mb-4">
        Adding measurement for: <span className="font-medium">{playerName}</span>
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
                      <SelectItem value="FLY10_TIME">10-Yard Fly Time</SelectItem>
                      <SelectItem value="VERTICAL_JUMP">Vertical Jump</SelectItem>
                      <SelectItem value="AGILITY_505">5-0-5 Agility Test</SelectItem>
                      <SelectItem value="AGILITY_5105">5-10-5 Agility Test</SelectItem>
                      <SelectItem value="T_TEST">T-Test</SelectItem>
                      <SelectItem value="DASH_40YD">40-Yard Dash</SelectItem>
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
                        className="rounded-r-none"
                        data-testid="input-measurement-value"
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <div className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-600 text-sm">
                      {units}
                    </div>
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