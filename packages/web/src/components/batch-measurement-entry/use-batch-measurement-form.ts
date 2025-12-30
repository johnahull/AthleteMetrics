import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';

// Batch measurement row schema (aligned with server insertMeasurementSchema)
const batchMeasurementRowSchema = z.object({
  athleteId: z.string().min(1, 'Athlete is required'), // Frontend uses athleteId, mapped to userId on submit
  date: z.string().date('Date must be in YYYY-MM-DD format'), // Use strict .date() validation like server
  // Accept any valid metric code - supports derived metrics and custom metrics
  metric: z.string().min(1, 'Metric is required').regex(/^[A-Z0-9_]+$/, 'Invalid metric code format'),
  value: z.number().positive('Value must be positive').refine((val) => val < 10000, {
    message: 'Value exceeds realistic range'
  }), // Add upper bound validation
  flyInDistance: z.number().positive().optional(),
  notes: z.string().max(1000, 'Notes must be 1000 characters or less').optional(),
  teamId: z.string().optional(),
});

const batchMeasurementSchema = z.object({
  measurements: z.array(batchMeasurementRowSchema),
});

type BatchMeasurementRow = z.infer<typeof batchMeasurementRowSchema>;
type BatchMeasurementForm = z.infer<typeof batchMeasurementSchema>;

const STORAGE_KEY = 'batch-measurement-draft';
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

export function useBatchMeasurementForm() {
  const { user } = useAuth();

  const form = useForm<BatchMeasurementForm>({
    resolver: zodResolver(batchMeasurementSchema),
    defaultValues: {
      measurements: [],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'measurements',
  });

  // Load draft from localStorage on mount
  useEffect(() => {
    const loadDraft = () => {
      // Guard: Only load draft if user ID is available
      if (!user?.id) return;

      try {
        const draft = localStorage.getItem(`${STORAGE_KEY}-${user.id}`);
        if (draft) {
          const parsed = JSON.parse(draft);
          if (parsed.measurements && Array.isArray(parsed.measurements)) {
            form.setValue('measurements', parsed.measurements);
          }
        }
      } catch (error) {
        console.error('Failed to load draft:', error);
      }
    };

    loadDraft();
  }, [user?.id, form]);

  // Auto-save to localStorage
  useEffect(() => {
    // Guard: Only set up auto-save if user ID is available
    if (!user?.id) return;

    // Capture user ID at effect creation time to prevent stale closure
    const currentUserId = user.id;

    const saveDraft = () => {
      // Verify this is still the same user
      if (!user?.id || user.id !== currentUserId) return;

      try {
        const values = form.getValues();
        // Only save if form is dirty and has data
        if (form.formState.isDirty && values.measurements.length > 0) {
          localStorage.setItem(
            `${STORAGE_KEY}-${currentUserId}`,
            JSON.stringify(values)
          );
        }
      } catch (error) {
        // Handle localStorage quota exceeded error specifically
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          console.warn('localStorage quota exceeded, skipping auto-save');
          // Could optionally notify user with toast here
        } else {
          console.error('Failed to save draft:', error);
        }
      }
    };

    const interval = setInterval(saveDraft, AUTO_SAVE_INTERVAL);

    // Cleanup: clear interval immediately on unmount or user change
    return () => {
      clearInterval(interval);
    };
  }, [user?.id, form]);

  // Add a new row
  const addRow = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const lastRow = fields[fields.length - 1];

    append({
      athleteId: '',
      date: lastRow?.date || today,
      metric: lastRow?.metric || 'FLY10_TIME',
      value: 0,
      notes: '',
      teamId: lastRow?.teamId || '',
    });
  }, [append, fields]);

  // Delete a row
  const deleteRow = useCallback((index: number) => {
    remove(index);
  }, [remove]);

  // Copy previous row (except athlete)
  const copyPreviousRow = useCallback(() => {
    if (fields.length > 0) {
      const lastRow = fields[fields.length - 1];
      append({
        athleteId: '',
        date: lastRow.date,
        metric: lastRow.metric,
        value: lastRow.value,
        flyInDistance: lastRow.flyInDistance,
        notes: lastRow.notes,
        teamId: lastRow.teamId,
      });
    }
  }, [append, fields]);

  // Clear all rows
  const clearAll = useCallback(() => {
    form.setValue('measurements', []);
    // Only remove from localStorage if user ID exists
    if (user?.id) {
      localStorage.removeItem(`${STORAGE_KEY}-${user.id}`);
    }
  }, [form, user?.id]);

  // Batch save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: BatchMeasurementForm) => {
      // Transform athleteId -> userId for backend
      const transformedData = {
        measurements: data.measurements.map(m => ({
          userId: m.athleteId, // Map athleteId to userId for backend schema
          date: m.date,
          metric: m.metric,
          value: m.value,
          flyInDistance: m.flyInDistance,
          notes: m.notes,
          teamId: m.teamId,
        })),
      };

      const response = await fetch('/api/measurements/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transformedData),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save measurements');
      }

      return response.json();
    },
    onSuccess: () => {
      // Clear draft after successful save
      if (user?.id) {
        localStorage.removeItem(`${STORAGE_KEY}-${user.id}`);
      }
      form.reset();
    },
  });

  // Save all measurements
  const save = useCallback(async () => {
    const isValid = await form.trigger();

    if (!isValid) {
      // Get field-specific errors for better error messages
      const errors = form.formState.errors;
      const errorMessages: string[] = [];

      if (errors.measurements) {
        const measurementErrors = errors.measurements as any;
        if (Array.isArray(measurementErrors)) {
          measurementErrors.forEach((rowError, index) => {
            if (rowError) {
              const fields = Object.keys(rowError);
              if (fields.length > 0) {
                errorMessages.push(`Row ${index + 1}: ${fields.join(', ')} validation failed`);
              }
            }
          });
        }
      }

      return {
        success: false,
        errors: errorMessages.length > 0
          ? errorMessages
          : ['Please fix validation errors before saving'],
      };
    }

    try {
      const data = form.getValues();

      // Additional validation: ensure all athleteIds are non-empty
      const emptyAthleteRows = data.measurements
        .map((m, i) => ({ athlete: m.athleteId, index: i }))
        .filter(r => !r.athlete || r.athlete.trim() === '');

      if (emptyAthleteRows.length > 0) {
        return {
          success: false,
          errors: emptyAthleteRows.map(r => `Row ${r.index + 1}: Athlete is required`),
        };
      }

      const result = await saveMutation.mutateAsync(data);

      return {
        success: true,
        count: result.created || data.measurements.length,
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Failed to save'],
      };
    }
  }, [form, saveMutation]);

  return {
    form,
    fields,
    addRow,
    append, // Export append for direct use in wizard
    deleteRow,
    copyPreviousRow,
    clearAll,
    save,
    saving: saveMutation.isPending,
    errors: form.formState.errors,
  };
}
