import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAvailableMetrics } from '@/hooks/use-available-metrics';

interface BatchEntryCardProps {
  fields: any[];
  deleteRow: (index: number) => void;
}

export function BatchEntryCard({ fields, deleteRow }: BatchEntryCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { register } = useFormContext();

  const { data: athletes } = useQuery({
    queryKey: ['/api/athletes'],
  });

  const { metrics: availableMetrics } = useAvailableMetrics();

  if (fields.length === 0) {
    return null;
  }

  const currentField = fields[currentIndex];
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < fields.length - 1;

  const handlePrevious = () => {
    if (canGoPrevious) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleDelete = () => {
    deleteRow(currentIndex);
    if (currentIndex >= fields.length - 1 && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  return (
    <div data-testid="batch-card-view">
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-muted-foreground">
              Entry {currentIndex + 1} of {fields.length}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              data-testid={`batch-delete-card-${currentIndex}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div
            className="space-y-4"
            data-testid={`batch-card-${currentIndex}`}
          >
            {/* Athlete Select */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Athlete
              </label>
              <select
                {...register(`measurements.${currentIndex}.athleteId`)}
                className="w-full p-2 border rounded"
              >
                <option value="">Select athlete...</option>
                {athletes?.map((athlete: any) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.fullName}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Input */}
            <div>
              <label className="text-sm font-medium mb-1 block">Date</label>
              <Input
                type="date"
                {...register(`measurements.${currentIndex}.date`)}
              />
            </div>

            {/* Metric Select */}
            <div>
              <label className="text-sm font-medium mb-1 block">Metric</label>
              <select
                {...register(`measurements.${currentIndex}.metric`)}
                className="w-full p-2 border rounded"
              >
                {availableMetrics.map((metric) => (
                  <option key={metric.code} value={metric.code}>
                    {metric.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Value Input */}
            <div>
              <label className="text-sm font-medium mb-1 block">Value</label>
              <Input
                type="number"
                step="0.01"
                {...register(`measurements.${currentIndex}.value`, {
                  valueAsNumber: true,
                })}
              />
            </div>

            {/* Notes Input */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Notes (Optional)
              </label>
              <Input
                type="text"
                {...register(`measurements.${currentIndex}.notes`)}
                placeholder="Add notes..."
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrevious}
              disabled={!canGoPrevious}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleNext}
              disabled={!canGoNext}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
