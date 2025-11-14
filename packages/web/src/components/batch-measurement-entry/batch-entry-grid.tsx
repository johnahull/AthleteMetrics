import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAvailableMetrics } from '@/hooks/use-available-metrics';

interface BatchEntryGridProps {
  fields: any[];
  deleteRow: (index: number) => void;
}

export function BatchEntryGrid({ fields, deleteRow }: BatchEntryGridProps) {
  const { register, setValue, watch } = useFormContext();

  const { data: athletes = [] } = useQuery<any[]>({
    queryKey: ['/api/athletes'],
  });

  const { metrics: availableMetrics } = useAvailableMetrics();

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
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
          {fields.map((field, index) => (
            <tr
              key={field.id}
              data-testid={`batch-row-${index}`}
              className="border-b hover:bg-muted/50"
            >
              {/* Athlete Select */}
              <td className="p-2">
                <select
                  {...register(`measurements.${index}.athleteId`)}
                  className="w-full p-2 border rounded"
                  data-testid={`batch-athlete-${index}`}
                >
                  <option value="">Select athlete...</option>
                  {athletes?.map((athlete: any) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.fullName}
                    </option>
                  ))}
                </select>
              </td>

              {/* Date Input */}
              <td className="p-2">
                <Input
                  type="date"
                  {...register(`measurements.${index}.date`)}
                  data-testid={`batch-date-${index}`}
                />
              </td>

              {/* Metric Select */}
              <td className="p-2">
                <select
                  {...register(`measurements.${index}.metric`)}
                  className="w-full p-2 border rounded"
                  data-testid={`batch-metric-${index}`}
                >
                  {availableMetrics.map((metric) => (
                    <option key={metric.code} value={metric.code}>
                      {metric.label}
                    </option>
                  ))}
                </select>
              </td>

              {/* Value Input */}
              <td className="p-2">
                <Input
                  type="number"
                  step="0.01"
                  {...register(`measurements.${index}.value`, {
                    valueAsNumber: true,
                  })}
                  data-testid={`batch-value-${index}`}
                />
              </td>

              {/* Notes Input */}
              <td className="p-2">
                <Input
                  type="text"
                  {...register(`measurements.${index}.notes`)}
                  data-testid={`batch-notes-${index}`}
                  placeholder="Optional notes..."
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
