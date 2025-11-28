import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import type { MultipleChoiceQuestionConfig } from '@shared/wellness-types';

interface MultipleChoiceQuestionInputProps {
  question: MultipleChoiceQuestionConfig;
  value: string | string[] | null;
  onChange: (value: string | string[]) => void;
  error?: string;
}

export function MultipleChoiceQuestionInput({
  question,
  value,
  onChange,
  error,
}: MultipleChoiceQuestionInputProps) {
  // Handle single-select (radio buttons)
  const handleRadioChange = (selectedValue: string) => {
    onChange(selectedValue);
  };

  // Handle multi-select (checkboxes)
  const handleCheckboxChange = (option: string, checked: boolean) => {
    const currentValues = Array.isArray(value) ? value : [];

    if (checked) {
      // Add option if not already present
      if (!currentValues.includes(option)) {
        onChange([...currentValues, option]);
      }
    } else {
      // Remove option
      onChange(currentValues.filter((v) => v !== option));
    }
  };

  return (
    <div className="space-y-4" data-testid="question-multiple-choice">
      <Label className="text-base font-medium">
        {question.label}
        {question.required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}

      {question.allowMultiple ? (
        // Multi-select: Checkboxes
        <div className="space-y-3">
          {question.options.map((option) => {
            const isChecked = Array.isArray(value) && value.includes(option);

            return (
              <div key={option} className="flex items-center space-x-3">
                <Checkbox
                  id={`${question.id}-${option}`}
                  checked={isChecked}
                  onCheckedChange={(checked) => handleCheckboxChange(option, checked as boolean)}
                  value={option}
                />
                <Label
                  htmlFor={`${question.id}-${option}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {option}
                </Label>
              </div>
            );
          })}
        </div>
      ) : (
        // Single-select: Radio buttons
        <RadioGroup
          value={typeof value === 'string' ? value : ''}
          onValueChange={handleRadioChange}
        >
          {question.options.map((option) => (
            <div key={option} className="flex items-center space-x-3">
              <RadioGroupItem
                value={option}
                id={`${question.id}-${option}`}
              />
              <Label
                htmlFor={`${question.id}-${option}`}
                className="text-sm font-normal cursor-pointer"
              >
                {option}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
