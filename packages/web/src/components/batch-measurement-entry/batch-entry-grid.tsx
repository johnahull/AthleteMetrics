import React, { useRef, useCallback } from 'react';
import { useFormContext, FieldArrayWithId } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAvailableMetrics } from '@/hooks/use-available-metrics';

// Type for batch measurement row (matches schema in use-batch-measurement-form.ts)
type BatchMeasurementRow = {
  athleteId: string;
  date: string;
  metric: string;
  value: number;
  flyInDistance?: number;
  notes?: string;
  teamId?: string;
};

interface BatchEntryGridProps {
  fields: FieldArrayWithId<{ measurements: BatchMeasurementRow[] }, 'measurements', 'id'>[];
  deleteRow: (index: number) => void;
}

export function BatchEntryGrid({ fields, deleteRow }: BatchEntryGridProps) {
  const { register, setValue, watch, formState: { errors } } = useFormContext();
  const gridRef = useRef<HTMLTableElement>(null);

  const { data: athletes = [] } = useQuery<any[]>({
    queryKey: ['/api/athletes'],
  });

  const { metrics: availableMetrics } = useAvailableMetrics();

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, cellIndex: number) => {
    if (!gridRef.current) return;

    const rows = gridRef.current.querySelectorAll('tbody tr');
    const currentRow = rows[rowIndex];
    if (!currentRow) return;

    const inputs = currentRow.querySelectorAll('input, select');
    const totalCells = inputs.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        // Move to same cell in next row
        if (rowIndex < fields.length - 1) {
          const nextRow = rows[rowIndex + 1];
          const nextInputs = nextRow.querySelectorAll('input, select');
          const nextInput = nextInputs[cellIndex] as HTMLElement;
          nextInput?.focus();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        // Move to same cell in previous row
        if (rowIndex > 0) {
          const prevRow = rows[rowIndex - 1];
          const prevInputs = prevRow.querySelectorAll('input, select');
          const prevInput = prevInputs[cellIndex] as HTMLElement;
          prevInput?.focus();
        }
        break;

      case 'ArrowRight':
        // Move to next cell in same row (only if at end of input)
        const input = e.target as HTMLInputElement;
        // Check if selectionStart is available (null for select/date inputs)
        if (input.selectionStart !== null && input.selectionStart === input.value.length) {
          e.preventDefault();
          if (cellIndex < totalCells - 1) {
            const nextInput = inputs[cellIndex + 1] as HTMLElement;
            nextInput?.focus();
          }
        }
        break;

      case 'ArrowLeft':
        // Move to previous cell in same row (only if at start of input)
        const inputLeft = e.target as HTMLInputElement;
        // Check if selectionStart is available (null for select/date inputs)
        if (inputLeft.selectionStart !== null && inputLeft.selectionStart === 0) {
          e.preventDefault();
          if (cellIndex > 0) {
            const prevInput = inputs[cellIndex - 1] as HTMLElement;
            prevInput?.focus();
          }
        }
        break;

      case 'Enter':
        e.preventDefault();
        // Move down to next row, same cell
        if (rowIndex < fields.length - 1) {
          const nextRow = rows[rowIndex + 1];
          const nextInputs = nextRow.querySelectorAll('input, select');
          const nextInput = nextInputs[cellIndex] as HTMLElement;
          nextInput?.focus();
        }
        break;

      case 'Escape':
        e.preventDefault();
        // Blur current input (UX design choice: exit edit mode without canceling edits)
        // Note: This allows users to quickly exit a field with Esc without losing changes
        (e.target as HTMLElement)?.blur();
        break;
    }
  }, [fields.length]);

  // Get error for a specific field
  const getFieldError = (rowIndex: number, fieldName: string) => {
    const measurementErrors = errors.measurements as any;
    return measurementErrors?.[rowIndex]?.[fieldName];
  };

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table ref={gridRef} className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2 font-medium">Athlete</th>
            <th className="text-left p-2 font-medium">Date</th>
            <th className="text-left p-2 font-medium">Metric</th>
            <th className="text-left p-2 font-medium">Value</th>
            <th className="text-left p-2 font-medium">Notes</th>
            <th className="text-left p-2 font-medium w-16">Actions</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => {
            const athleteError = getFieldError(index, 'athleteId');
            const dateError = getFieldError(index, 'date');
            const metricError = getFieldError(index, 'metric');
            const valueError = getFieldError(index, 'value');

            return (
              <tr
                key={field.id}
                data-testid={`batch-row-${index}`}
                className="border-b hover:bg-muted/50"
              >
                {/* Athlete Select */}
                <td className="p-2">
                  <div>
                    <select
                      {...register(`measurements.${index}.athleteId`)}
                      className={`w-full p-2 border rounded ${athleteError ? 'border-red-500 ring-2 ring-red-200' : ''}`}
                      data-testid={`batch-athlete-${index}`}
                      onKeyDown={(e) => handleKeyDown(e, index, 0)}
                    >
                      <option value="">Select athlete...</option>
                      {athletes?.map((athlete: any) => (
                        <option key={athlete.id} value={athlete.id}>
                          {athlete.fullName}
                        </option>
                      ))}
                    </select>
                    {athleteError && (
                      <p className="text-xs text-red-500 mt-1">{athleteError.message}</p>
                    )}
                  </div>
                </td>

                {/* Date Input */}
                <td className="p-2">
                  <div>
                    <Input
                      type="date"
                      {...register(`measurements.${index}.date`)}
                      data-testid={`batch-date-${index}`}
                      className={dateError ? 'border-red-500 ring-2 ring-red-200' : ''}
                      onKeyDown={(e) => handleKeyDown(e, index, 1)}
                    />
                    {dateError && (
                      <p className="text-xs text-red-500 mt-1">{dateError.message}</p>
                    )}
                  </div>
                </td>

                {/* Metric Select */}
                <td className="p-2">
                  <div>
                    <select
                      {...register(`measurements.${index}.metric`)}
                      className={`w-full p-2 border rounded ${metricError ? 'border-red-500 ring-2 ring-red-200' : ''}`}
                      data-testid={`batch-metric-${index}`}
                      onKeyDown={(e) => handleKeyDown(e, index, 2)}
                    >
                      {availableMetrics.map((metric) => (
                        <option key={metric.code} value={metric.code}>
                          {metric.label}
                        </option>
                      ))}
                    </select>
                    {metricError && (
                      <p className="text-xs text-red-500 mt-1">{metricError.message}</p>
                    )}
                  </div>
                </td>

                {/* Value Input */}
                <td className="p-2">
                  <div>
                    <Input
                      type="number"
                      step="0.01"
                      {...register(`measurements.${index}.value`, {
                        valueAsNumber: true,
                      })}
                      data-testid={`batch-value-${index}`}
                      className={valueError ? 'border-red-500 ring-2 ring-red-200' : ''}
                      onKeyDown={(e) => handleKeyDown(e, index, 3)}
                    />
                    {valueError && (
                      <p className="text-xs text-red-500 mt-1">{valueError.message}</p>
                    )}
                  </div>
                </td>

                {/* Notes Input */}
                <td className="p-2">
                  <Input
                    type="text"
                    {...register(`measurements.${index}.notes`)}
                    data-testid={`batch-notes-${index}`}
                    placeholder="Optional notes..."
                    maxLength={1000}
                    onKeyDown={(e) => handleKeyDown(e, index, 4)}
                  />
                </td>

                {/* Delete Button */}
                <td className="p-2 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteRow(index)}
                    data-testid={`batch-delete-row-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
