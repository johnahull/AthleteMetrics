import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import type { BooleanQuestionConfig } from '@shared/wellness-types';
import { cn } from '@/lib/utils';

interface BooleanQuestionInputProps {
  question: BooleanQuestionConfig;
  value: boolean | null;
  onChange: (value: boolean) => void;
  error?: string;
}

export function BooleanQuestionInput({
  question,
  value,
  onChange,
  error,
}: BooleanQuestionInputProps) {
  return (
    <div className="space-y-4" data-testid="question-boolean">
      <Label className="text-base font-medium">
        {question.label}
        {question.required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}

      <div className="flex gap-4">
        <Button
          type="button"
          variant={value === true ? "default" : "outline"}
          className={cn(
            "flex-1 h-16 text-lg",
            value === true && "selected active primary"
          )}
          onClick={() => onChange(true)}
          aria-pressed={value === true}
        >
          <Check className="mr-2 h-5 w-5" />
          Yes
        </Button>

        <Button
          type="button"
          variant={value === false ? "default" : "outline"}
          className={cn(
            "flex-1 h-16 text-lg",
            value === false && "selected active primary"
          )}
          onClick={() => onChange(false)}
          aria-pressed={value === false}
        >
          <X className="mr-2 h-5 w-5" />
          No
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
