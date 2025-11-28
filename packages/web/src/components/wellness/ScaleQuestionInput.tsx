import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { ScaleQuestionConfig } from '@shared/wellness-types';

interface ScaleQuestionInputProps {
  question: ScaleQuestionConfig;
  value: number | null;
  onChange: (value: number) => void;
  error?: string;
}

export function ScaleQuestionInput({
  question,
  value,
  onChange,
  error,
}: ScaleQuestionInputProps) {
  const [localValue, setLocalValue] = useState(value || question.scaleMin);

  const handleChange = (values: number[]) => {
    const newValue = values[0];
    setLocalValue(newValue);
    onChange(newValue);
  };

  return (
    <div className="space-y-4" data-testid="question-scale">
      <div className="flex items-start justify-between">
        <Label className="text-base font-medium">
          {question.label}
          {question.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <span className="text-2xl font-bold text-primary">{localValue}</span>
      </div>

      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}

      <div className="space-y-4 py-4">
        <Slider
          min={question.scaleMin}
          max={question.scaleMax}
          step={1}
          value={[localValue]}
          onValueChange={handleChange}
          className="touch-action-none" // Better touch support
        />

        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{question.minLabel || question.scaleMin}</span>
          <span>{question.maxLabel || question.scaleMax}</span>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
