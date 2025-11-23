import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { BodyMapQuestionConfig } from '@shared/wellness-types';
import { cn } from '@/lib/utils';

interface BodyMapPoint {
  x: number;
  y: number;
  label?: string;
}

interface BodyMapInputProps {
  question: BodyMapQuestionConfig;
  value: BodyMapPoint[];
  onChange: (value: BodyMapPoint[]) => void;
  error?: string;
}

// Body parts with fixed coordinates (normalized 0-1)
const BODY_PARTS_WITH_COORDS: Record<string, { x: number; y: number; label: string }> = {
  'Head': { x: 0.5, y: 0.1, label: 'Head' },
  'Neck': { x: 0.5, y: 0.15, label: 'Neck' },
  'Left Shoulder': { x: 0.3, y: 0.2, label: 'Left Shoulder' },
  'Right Shoulder': { x: 0.7, y: 0.2, label: 'Right Shoulder' },
  'Chest': { x: 0.5, y: 0.25, label: 'Chest' },
  'Upper Back': { x: 0.5, y: 0.25, label: 'Upper Back' },
  'Left Elbow': { x: 0.2, y: 0.35, label: 'Left Elbow' },
  'Right Elbow': { x: 0.8, y: 0.35, label: 'Right Elbow' },
  'Left Wrist': { x: 0.15, y: 0.45, label: 'Left Wrist' },
  'Right Wrist': { x: 0.85, y: 0.45, label: 'Right Wrist' },
  'Left Hand': { x: 0.1, y: 0.5, label: 'Left Hand' },
  'Right Hand': { x: 0.9, y: 0.5, label: 'Right Hand' },
  'Abdomen': { x: 0.5, y: 0.4, label: 'Abdomen' },
  'Lower Back': { x: 0.5, y: 0.45, label: 'Lower Back' },
  'Hips': { x: 0.5, y: 0.5, label: 'Hips' },
  'Left Thigh': { x: 0.4, y: 0.6, label: 'Left Thigh' },
  'Right Thigh': { x: 0.6, y: 0.6, label: 'Right Thigh' },
  'Left Knee': { x: 0.4, y: 0.7, label: 'Left Knee' },
  'Right Knee': { x: 0.6, y: 0.7, label: 'Right Knee' },
  'Left Shin': { x: 0.4, y: 0.8, label: 'Left Shin' },
  'Right Shin': { x: 0.6, y: 0.8, label: 'Right Shin' },
  'Left Ankle': { x: 0.4, y: 0.9, label: 'Left Ankle' },
  'Right Ankle': { x: 0.6, y: 0.9, label: 'Right Ankle' },
  'Left Foot': { x: 0.4, y: 0.95, label: 'Left Foot' },
  'Right Foot': { x: 0.6, y: 0.95, label: 'Right Foot' },
};

// Body parts organized by region for display
const BODY_PARTS = {
  head: ['Head', 'Neck'],
  upperBody: ['Left Shoulder', 'Right Shoulder', 'Chest', 'Upper Back'],
  arms: ['Left Elbow', 'Right Elbow', 'Left Wrist', 'Right Wrist', 'Left Hand', 'Right Hand'],
  core: ['Abdomen', 'Lower Back', 'Hips'],
  legs: ['Left Thigh', 'Right Thigh', 'Left Knee', 'Right Knee', 'Left Shin', 'Right Shin'],
  feet: ['Left Ankle', 'Right Ankle', 'Left Foot', 'Right Foot'],
};

export function BodyMapInput({
  question,
  value = [],
  onChange,
  error,
}: BodyMapInputProps) {
  const toggleBodyPart = (partLabel: string) => {
    const normalizedValue = value || [];
    const exists = normalizedValue.some((p) => p.label === partLabel);

    if (exists) {
      onChange(normalizedValue.filter((p) => p.label !== partLabel));
    } else {
      const coords = BODY_PARTS_WITH_COORDS[partLabel];
      if (coords) {
        onChange([...normalizedValue, coords]);
      }
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  // Render a body part button with proper accessibility
  const renderBodyPartButton = (part: string) => {
    const isSelected = value.some((p) => p.label === part);
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
            {value.map((point, idx) => (
              <Badge
                key={`${point.label}-${idx}`}
                variant="secondary"
                className="text-sm"
              >
                {point.label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
