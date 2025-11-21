import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { BodyMapQuestionConfig } from '@shared/wellness-types';
import { cn } from '@/lib/utils';

interface BodyMapInputProps {
  question: BodyMapQuestionConfig;
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
}

// Body parts organized by region
const BODY_PARTS = {
  head: ['Head', 'Neck'],
  upperBody: ['Left Shoulder', 'Right Shoulder', 'Chest', 'Upper Back'],
  arms: ['Left Elbow', 'Right Elbow', 'Left Wrist', 'Right Wrist', 'Left Hand', 'Right Hand'],
  core: ['Abdomen', 'Lower Back', 'Hips'],
  legs: ['Left Thigh', 'Right Thigh', 'Left Knee', 'Right Knee', 'Left Shin', 'Right Shin'],
  feet: ['Left Ankle', 'Right Ankle', 'Left Foot', 'Right Foot'],
};

const ALL_BODY_PARTS = Object.values(BODY_PARTS).flat();

export function BodyMapInput({
  question,
  value = [],
  onChange,
  error,
}: BodyMapInputProps) {
  const toggleBodyPart = (part: string) => {
    const normalizedValue = value || [];
    if (normalizedValue.includes(part)) {
      onChange(normalizedValue.filter((p) => p !== part));
    } else {
      onChange([...normalizedValue, part]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  // Render a body part button with proper accessibility
  const renderBodyPartButton = (part: string) => {
    const isSelected = value.includes(part);
    return (
      <button
        key={part}
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        aria-label={`${part}, ${isSelected ? 'selected' : 'not selected'}`}
        data-body-part={part.toLowerCase().replace(' ', '-')}
        onClick={() => toggleBodyPart(part)}
        className={cn(
          "px-3 py-2 rounded-md border text-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "min-h-[44px]", // Touch-friendly
          isSelected
            ? "bg-primary text-primary-foreground border-primary selected marked active"
            : "bg-background"
        )}
      >
        {part}
      </button>
    );
  };

  return (
    <div className="space-y-4" data-testid="question-body-map">
      <div className="flex items-start justify-between">
        <Label
          id={`${question.id}-label`}
          className="text-base font-medium"
        >
          {question.label}
          {question.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        {value.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-sm text-muted-foreground hover:text-foreground"
            aria-label={`Clear all ${value.length} selected body parts`}
          >
            Clear all
          </button>
        )}
      </div>

      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}

      {/* Simple body diagram using buttons organized by region */}
      <div
        className="border rounded-lg p-4 bg-muted/30"
        data-testid="body-diagram"
        role="group"
        aria-labelledby={`${question.id}-label`}
        aria-describedby={question.description ? `${question.id}-description` : undefined}
      >
        <div className="space-y-4">
          {/* Head & Neck */}
          <div role="group" aria-label="Head">
            <p className="text-xs font-medium text-muted-foreground mb-2">Head</p>
            <div className="flex flex-wrap gap-2">
              {BODY_PARTS.head.map(renderBodyPartButton)}
            </div>
          </div>

          {/* Upper Body */}
          <div role="group" aria-label="Upper Body">
            <p className="text-xs font-medium text-muted-foreground mb-2">Upper Body</p>
            <div className="flex flex-wrap gap-2">
              {BODY_PARTS.upperBody.map(renderBodyPartButton)}
            </div>
          </div>

          {/* Arms */}
          <div role="group" aria-label="Arms & Hands">
            <p className="text-xs font-medium text-muted-foreground mb-2">Arms & Hands</p>
            <div className="flex flex-wrap gap-2">
              {BODY_PARTS.arms.map(renderBodyPartButton)}
            </div>
          </div>

          {/* Core */}
          <div role="group" aria-label="Core">
            <p className="text-xs font-medium text-muted-foreground mb-2">Core</p>
            <div className="flex flex-wrap gap-2">
              {BODY_PARTS.core.map(renderBodyPartButton)}
            </div>
          </div>

          {/* Legs */}
          <div role="group" aria-label="Legs">
            <p className="text-xs font-medium text-muted-foreground mb-2">Legs</p>
            <div className="flex flex-wrap gap-2">
              {BODY_PARTS.legs.map(renderBodyPartButton)}
            </div>
          </div>

          {/* Feet */}
          <div role="group" aria-label="Feet">
            <p className="text-xs font-medium text-muted-foreground mb-2">Feet</p>
            <div className="flex flex-wrap gap-2">
              {BODY_PARTS.feet.map(renderBodyPartButton)}
            </div>
          </div>
        </div>
      </div>

      {/* Selected parts display */}
      {value.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Selected areas ({value.length}):</p>
          <div className="flex flex-wrap gap-2">
            {value.map((part) => (
              <Badge
                key={part}
                variant="secondary"
                className="text-sm"
              >
                {part}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
