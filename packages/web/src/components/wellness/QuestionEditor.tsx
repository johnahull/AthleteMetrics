import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { QuestionConfig } from '@shared/wellness-types';

interface QuestionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (question: QuestionConfig) => void;
  question?: QuestionConfig;
}

export default function QuestionEditor({ isOpen, onClose, onSave, question }: QuestionEditorProps) {
  const [questionType, setQuestionType] = useState<'scale' | 'text' | 'boolean' | 'body_map' | 'multiple_choice'>(
    question?.type || 'scale'
  );
  const [label, setLabel] = useState(question?.label || '');
  const [description, setDescription] = useState(question?.description || '');
  const [required, setRequired] = useState(question?.required ?? true);

  // Scale-specific
  const [scaleMin, setScaleMin] = useState(
    question?.type === 'scale' ? question.scaleMin.toString() : '1'
  );
  const [scaleMax, setScaleMax] = useState(
    question?.type === 'scale' ? question.scaleMax.toString() : '10'
  );
  const [minLabel, setMinLabel] = useState(
    question?.type === 'scale' ? question.minLabel || '' : ''
  );
  const [maxLabel, setMaxLabel] = useState(
    question?.type === 'scale' ? question.maxLabel || '' : ''
  );

  // Text-specific
  const [placeholder, setPlaceholder] = useState(
    question?.type === 'text' ? question.placeholder || '' : ''
  );
  const [maxLength, setMaxLength] = useState(
    question?.type === 'text' ? question.maxLength?.toString() || '' : ''
  );

  // Body map-specific
  const [allowMultiple, setAllowMultiple] = useState(
    question?.type === 'body_map' ? question.allowMultiple :
    question?.type === 'multiple_choice' ? question.allowMultiple : false
  );

  // Multiple choice-specific
  const [options, setOptions] = useState<string[]>(
    question?.type === 'multiple_choice' ? question.options : ['Option 1', 'Option 2']
  );

  const handleSave = () => {
    const baseQuestion = {
      id: question?.id || `q_${Date.now()}`,
      label,
      description: description || undefined,
      required,
    };

    let newQuestion: QuestionConfig;

    switch (questionType) {
      case 'scale':
        newQuestion = {
          ...baseQuestion,
          type: 'scale',
          scaleMin: parseInt(scaleMin),
          scaleMax: parseInt(scaleMax),
          minLabel: minLabel || undefined,
          maxLabel: maxLabel || undefined,
        };
        break;
      case 'text':
        newQuestion = {
          ...baseQuestion,
          type: 'text',
          placeholder: placeholder || undefined,
          maxLength: maxLength ? parseInt(maxLength) : undefined,
        };
        break;
      case 'boolean':
        newQuestion = {
          ...baseQuestion,
          type: 'boolean',
        };
        break;
      case 'body_map':
        newQuestion = {
          ...baseQuestion,
          type: 'body_map',
          allowMultiple,
        };
        break;
      case 'multiple_choice':
        newQuestion = {
          ...baseQuestion,
          type: 'multiple_choice',
          options: options.filter(opt => opt.trim().length > 0),
          allowMultiple,
        };
        break;
      default:
        return;
    }

    onSave(newQuestion);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{question ? 'Edit Question' : 'Add Question'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Question Type */}
          <div className="space-y-2">
            <Label htmlFor="question-type">Question Type</Label>
            <Select
              value={questionType}
              onValueChange={(value: any) => setQuestionType(value)}
            >
              <SelectTrigger data-testid="select-question-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scale">Scale (1-10)</SelectItem>
                <SelectItem value="text">Text Response</SelectItem>
                <SelectItem value="boolean">Yes/No</SelectItem>
                <SelectItem value="body_map">Body Map</SelectItem>
                <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Question Label */}
          <div className="space-y-2">
            <Label htmlFor="label">Question *</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="How are you feeling today?"
              data-testid="input-question-label"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional context for this question..."
              rows={2}
            />
          </div>

          {/* Type-specific fields */}
          {questionType === 'scale' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scale-min">Minimum Value</Label>
                  <Input
                    id="scale-min"
                    type="number"
                    value={scaleMin}
                    onChange={(e) => setScaleMin(e.target.value)}
                    data-testid="input-scale-min"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scale-max">Maximum Value</Label>
                  <Input
                    id="scale-max"
                    type="number"
                    value={scaleMax}
                    onChange={(e) => setScaleMax(e.target.value)}
                    data-testid="input-scale-max"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min-label">Min Label (Optional)</Label>
                  <Input
                    id="min-label"
                    value={minLabel}
                    onChange={(e) => setMinLabel(e.target.value)}
                    placeholder="Poor"
                    data-testid="input-scale-min-label"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-label">Max Label (Optional)</Label>
                  <Input
                    id="max-label"
                    value={maxLabel}
                    onChange={(e) => setMaxLabel(e.target.value)}
                    placeholder="Excellent"
                    data-testid="input-scale-max-label"
                  />
                </div>
              </div>
            </>
          )}

          {questionType === 'text' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="placeholder">Placeholder (Optional)</Label>
                <Input
                  id="placeholder"
                  value={placeholder}
                  onChange={(e) => setPlaceholder(e.target.value)}
                  placeholder="Enter your response..."
                  data-testid="input-text-placeholder"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-length">Max Length (Optional)</Label>
                <Input
                  id="max-length"
                  type="number"
                  value={maxLength}
                  onChange={(e) => setMaxLength(e.target.value)}
                  placeholder="500"
                />
              </div>
            </>
          )}

          {questionType === 'body_map' && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="allow-multiple"
                checked={allowMultiple}
                onCheckedChange={(checked) => setAllowMultiple(checked as boolean)}
              />
              <Label htmlFor="allow-multiple">Allow multiple pain points</Label>
            </div>
          )}

          {questionType === 'multiple_choice' && (
            <>
              <div className="space-y-2">
                <Label>Answer Options *</Label>
                {options.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={option}
                      onChange={(e) => {
                        const newOptions = [...options];
                        newOptions[index] = e.target.value;
                        setOptions(newOptions);
                      }}
                      placeholder={`Option ${index + 1}`}
                    />
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setOptions(options.filter((_, i) => i !== index));
                        }}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
                {options.length < 10 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOptions([...options, `Option ${options.length + 1}`]);
                    }}
                  >
                    Add Option
                  </Button>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allow-multiple-mc"
                  checked={allowMultiple}
                  onCheckedChange={(checked) => setAllowMultiple(checked as boolean)}
                />
                <Label htmlFor="allow-multiple-mc">Allow selecting multiple options</Label>
              </div>
            </>
          )}

          {/* Required Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="required"
              checked={required}
              onCheckedChange={(checked) => setRequired(checked as boolean)}
              data-testid="checkbox-question-required"
            />
            <Label htmlFor="required">Required question</Label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!label.trim()}
            data-testid="button-save-question"
          >
            Save Question
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
