import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { TextQuestionConfig } from '@shared/wellness-types';

interface TextQuestionInputProps {
  question: TextQuestionConfig;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function TextQuestionInput({
  question,
  value,
  onChange,
  error,
}: TextQuestionInputProps) {
  const maxLength = question.maxLength || 500;
  const currentLength = value?.length || 0;

  return (
    <div className="space-y-2" data-testid="question-text">
      <Label className="text-base font-medium">
        {question.label}
        {question.required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}

      <Textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder}
        maxLength={maxLength}
        className="min-h-[120px] resize-y"
        aria-invalid={!!error}
        aria-describedby={error ? `${question.id}-error` : undefined}
      />

      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground">
          {currentLength} / {maxLength}
        </span>
        {error && (
          <span id={`${question.id}-error`} className="text-destructive">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
