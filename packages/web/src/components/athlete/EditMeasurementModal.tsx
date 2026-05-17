/**
 * EditMeasurementModal Component
 *
 * Modal dialog for editing self-entered (unverified) measurements.
 * Athletes can only edit measurements they submitted themselves.
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Measurement } from '@shared/schema';
import { getMetricUnit } from '@/constants/metrics';
import { useMetricLabels } from '@/hooks/use-metric-labels';

// Form validation schema
const editMeasurementSchema = z.object({
  value: z.coerce
    .number({ required_error: 'Value is required', invalid_type_error: 'Value is required' })
    .positive('Value must be positive'),
  date: z
    .string()
    .min(1, 'Date is required')
    .refine(
      (dateStr) => {
        const date = new Date(dateStr);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        return date <= today;
      },
      { message: 'Date cannot be in the future' }
    ),
  notes: z.string().optional(),
});

type EditMeasurementFormData = z.infer<typeof editMeasurementSchema>;

export interface EditMeasurementData {
  measurementId: string;
  value: number;
  date: string;
  notes?: string;
}

export interface EditMeasurementModalProps {
  open: boolean;
  measurement: Measurement | null;
  onSave: (data: EditMeasurementData) => void;
  onClose: () => void;
  isSaving?: boolean;
}

export function EditMeasurementModal({
  open,
  measurement,
  onSave,
  onClose,
  isSaving = false,
}: EditMeasurementModalProps) {
  const form = useForm<EditMeasurementFormData>({
    resolver: zodResolver(editMeasurementSchema),
    defaultValues: {
      value: measurement ? parseFloat(measurement.value) : 0,
      date: measurement?.date || '',
      notes: measurement?.notes || '',
    },
  });

  const { getLabel } = useMetricLabels();

  // Reset form when measurement changes
  React.useEffect(() => {
    if (measurement && open) {
      form.reset({
        value: parseFloat(measurement.value),
        date: measurement.date,
        notes: measurement.notes || '',
      });
    }
  }, [measurement, open, form]);

  // Don't render if no measurement
  if (!measurement) {
    return null;
  }

  const metricDisplayName = getLabel(measurement.metric);
  const metricUnits = getMetricUnit(measurement.metric, measurement.units);

  const handleSubmit = (data: EditMeasurementFormData) => {
    onSave({
      measurementId: measurement.id,
      value: data.value,
      date: data.date,
      notes: data.notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Measurement</DialogTitle>
          <DialogDescription>
            Update your {metricDisplayName} measurement
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value {metricUnits && `(${metricUnits})`}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      placeholder="Enter value"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any notes about this measurement..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default EditMeasurementModal;
