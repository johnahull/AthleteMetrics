import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useCreateWellnessTemplate, useUpdateWellnessTemplate } from '@/hooks/use-wellness-templates';
import type { WellnessTemplate, QuestionConfig } from '@shared/wellness-types';
import { createWellnessTemplateSchema } from '@shared/wellness-validation';
import { z } from 'zod';
import { Plus, X } from 'lucide-react';
import QuestionEditor from './QuestionEditor';
import TemplateLibrary from './TemplateLibrary';

interface TemplateBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  template?: WellnessTemplate | null;
  organizationId?: string; // Optional for system templates
  isSystemTemplate?: boolean; // Flag for admin system templates
  onSuccess?: () => void; // Callback for successful save
}

type FormData = z.infer<typeof createWellnessTemplateSchema>;

const CATEGORIES = ['general', 'recovery', 'performance', 'injury', 'training'];

export default function TemplateBuilder({ isOpen, onClose, template, organizationId, isSystemTemplate = false, onSuccess }: TemplateBuilderProps) {
  const { toast } = useToast();
  const createTemplate = useCreateWellnessTemplate(organizationId || '');
  const updateTemplate = useUpdateWellnessTemplate(organizationId || '');
  const [questions, setQuestions] = useState<QuestionConfig[]>(template?.config?.questions || []);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [newTag, setNewTag] = useState('');

  const form = useForm<FormData>({
    resolver: zodResolver(createWellnessTemplateSchema),
    defaultValues: {
      name: template?.name || '',
      description: template?.description || '',
      config: {
        questions: template?.config?.questions || [],
        colorConfig: template?.config?.colorConfig || undefined,
        statusConfig: template?.config?.statusConfig || undefined,
      },
      isActive: template?.isActive ?? true,
      isDefault: template?.isDefault ?? false,
      category: template?.category || undefined,
      tags: template?.tags || [],
    },
  });

  // Sync questions with form
  useEffect(() => {
    form.setValue('config.questions', questions);
  }, [questions, form]);

  const onSubmit = async (data: FormData) => {
    try {
      if (isSystemTemplate) {
        // System template: use admin endpoints
        const endpoint = template
          ? `/api/admin/wellness/templates/${template.id}`
          : '/api/admin/wellness/templates';
        const method = template ? 'PUT' : 'POST';

        const res = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Failed to save template');
        }

        toast({
          title: 'Success',
          description: template ? 'Template updated successfully' : 'Template created successfully',
        });
      } else {
        // Organization template: use existing hooks
        if (template) {
          await updateTemplate.mutateAsync({
            id: template.id,
            updates: data,
          });
          toast({
            title: 'Success',
            description: 'Template updated successfully',
          });
        } else {
          await createTemplate.mutateAsync(data);
          toast({
            title: 'Success',
            description: 'Template created successfully',
          });
        }
      }

      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save template',
        variant: 'destructive',
      });
    }
  };

  const handleAddQuestion = () => {
    setEditingQuestionIndex(null);
    setShowQuestionEditor(true);
  };

  const handleEditQuestion = (index: number) => {
    setEditingQuestionIndex(index);
    setShowQuestionEditor(true);
  };

  const handleSaveQuestion = (question: QuestionConfig) => {
    if (editingQuestionIndex !== null) {
      // Update existing question
      const updated = [...questions];
      updated[editingQuestionIndex] = question;
      setQuestions(updated);
    } else {
      // Add new question
      setQuestions([...questions, question]);
    }
    setShowQuestionEditor(false);
    setEditingQuestionIndex(null);
  };

  const handleDeleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;

    const updated = [...questions];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setQuestions(updated);
  };

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    const currentTags = form.getValues('tags') || [];
    if (currentTags.length >= 20) {
      toast({
        title: 'Maximum tags reached',
        description: 'You can only add up to 20 tags',
        variant: 'destructive',
      });
      return;
    }
    if (currentTags.includes(newTag.trim())) {
      toast({
        title: 'Duplicate tag',
        description: 'This tag already exists',
        variant: 'destructive',
      });
      return;
    }
    form.setValue('tags', [...currentTags, newTag.trim()]);
    setNewTag('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = form.getValues('tags') || [];
    form.setValue('tags', currentTags.filter(tag => tag !== tagToRemove));
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="template-builder">
          <DialogHeader>
            <DialogTitle>{template ? 'Edit Template' : 'Create Template'}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Template Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Daily Wellness Check-in"
                        data-testid="input-template-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value || ''}
                        placeholder="Brief description of this questionnaire..."
                        data-testid="input-template-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Category */}
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category (Optional)</FormLabel>
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select a category..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category.charAt(0).toUpperCase() + category.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      Helps organize templates in the library
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tags */}
              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags (Optional)</FormLabel>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          placeholder="Add a tag..."
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTag();
                            }
                          }}
                          maxLength={30}
                          data-testid="input-new-tag"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddTag}
                          disabled={!newTag.trim()}
                          data-testid="button-add-tag"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {field.value && field.value.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {field.value.map((tag, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {tag}
                              <button
                                type="button"
                                onClick={() => handleRemoveTag(tag)}
                                className="ml-1 text-gray-500 hover:text-gray-700"
                                data-testid={`button-remove-tag-${idx}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500">
                        Add tags to help find templates in the library (max 20 tags, 30 chars each)
                      </p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Questions List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Questions</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddQuestion}
                    data-testid="button-add-question"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Question
                  </Button>
                </div>

                {questions.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">
                    No questions yet. Add your first question to get started.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {questions.map((question, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-3 border rounded-md bg-gray-50"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{question.label}</p>
                          <p className="text-sm text-gray-600">
                            Type: {question.type}
                            {question.required && ' • Required'}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => moveQuestion(index, 'up')}
                            disabled={index === 0}
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => moveQuestion(index, 'down')}
                            disabled={index === questions.length - 1}
                          >
                            ↓
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditQuestion(index)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteQuestion(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Analytics Color Configuration (Optional) */}
              <div className="space-y-4 border-t pt-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Analytics Color Configuration (Optional)</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Define custom color thresholds for the analytics heatmap. Leave blank to auto-generate based on your scale range.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="config.colorConfig.lowThreshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Low Threshold</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.1"
                            placeholder="Auto"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-low-threshold"
                          />
                        </FormControl>
                        <p className="text-xs text-gray-500">Scores ≤ this are "low" (red)</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="config.colorConfig.mediumThreshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Medium Threshold</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.1"
                            placeholder="Auto"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-medium-threshold"
                          />
                        </FormControl>
                        <p className="text-xs text-gray-500">Scores ≤ this are "medium" (yellow)</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="config.colorConfig.highThreshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>High Threshold</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.1"
                            placeholder="Auto"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-high-threshold"
                          />
                        </FormControl>
                        <p className="text-xs text-gray-500">Scores &gt; this are "high" (green)</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Example:</strong> For a 1-5 scale, you might use: Low=2, Medium=3, High=4
                  </p>
                </div>
              </div>

              {/* Team Status Configuration (Optional) */}
              <div className="space-y-4 border-t pt-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Team Status Configuration (Optional)</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Define how athlete wellness scores map to red/yellow/green status on the dashboard.
                  </p>
                </div>

                {/* Scale Orientation */}
                <FormField
                  control={form.control}
                  name="config.statusConfig.scaleOrientation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scale Orientation</FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value || 'higher_is_better'}
                          onValueChange={field.onChange}
                          className="flex flex-col space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="higher_is_better" id="higher" />
                            <label htmlFor="higher" className="text-sm font-normal cursor-pointer">
                              Higher is better (5 = excellent, 1 = poor)
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="lower_is_better" id="lower" />
                            <label htmlFor="lower" className="text-sm font-normal cursor-pointer">
                              Lower is better (1 = excellent, 5 = poor)
                            </label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Calculation Method */}
                <FormField
                  control={form.control}
                  name="config.statusConfig.calculationMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Score Calculation Method</FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value || 'average'}
                          onValueChange={field.onChange}
                          className="flex flex-col space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="average" id="method-average" />
                            <label htmlFor="method-average" className="text-sm font-normal cursor-pointer">
                              Average (standard wellness scoring)
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="sum" id="method-sum" />
                            <label htmlFor="method-sum" className="text-sm font-normal cursor-pointer">
                              Sum (Modified Hooper Index)
                            </label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <p className="text-xs text-gray-500 mt-2">
                        {field.value === 'sum'
                          ? 'Scores will be summed across all questions (e.g., 3+4+2+5=14). Use this for Modified Hooper Index.'
                          : 'Scores will be averaged across all questions (e.g., (3+4+2+5)/4=3.5). Default method.'}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Threshold Inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="config.statusConfig.redThreshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Red Threshold</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.1"
                            placeholder="2"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-red-threshold"
                          />
                        </FormControl>
                        <p className="text-xs text-gray-500">
                          {form.watch('config.statusConfig.scaleOrientation') === 'lower_is_better'
                            ? 'Scores ≥ this are "red" (worse health)'
                            : 'Scores ≤ this are "red" (worse health)'}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="config.statusConfig.yellowThreshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Yellow Threshold</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.1"
                            placeholder="4"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-yellow-threshold"
                          />
                        </FormControl>
                        <p className="text-xs text-gray-500">
                          {form.watch('config.statusConfig.scaleOrientation') === 'lower_is_better'
                            ? 'Scores ≥ this are "yellow" (caution)'
                            : 'Scores ≤ this are "yellow" (caution)'}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Injury Questions Multi-Select */}
                <FormField
                  control={form.control}
                  name="config.statusConfig.injuryQuestionIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Injury Indicator Questions</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value && field.value.length > 0 ? field.value[0] : ''}
                          onValueChange={(value) => {
                            const currentValues = field.value || [];
                            if (value && !currentValues.includes(value)) {
                              field.onChange([...currentValues, value]);
                            }
                          }}
                        >
                          <SelectTrigger data-testid="select-injury-questions">
                            <SelectValue placeholder="Select injury indicator questions..." />
                          </SelectTrigger>
                          <SelectContent>
                            {questions.map((q) => (
                              <SelectItem key={q.id} value={q.id}>
                                {q.label} ({q.type})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      {field.value && field.value.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {field.value.map((qId) => {
                            const question = questions.find((q) => q.id === qId);
                            return question ? (
                              <Badge key={qId} variant="secondary" className="text-xs">
                                {question.label}
                                <button
                                  type="button"
                                  onClick={() => {
                                    field.onChange(field.value?.filter((id) => id !== qId) || []);
                                  }}
                                  className="ml-1 text-gray-500 hover:text-gray-700"
                                >
                                  ×
                                </button>
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      )}
                      <p className="text-xs text-gray-500">
                        Questions whose responses indicate athlete injuries (typically body_map questions)
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Injury Override Checkbox */}
                <FormField
                  control={form.control}
                  name="config.statusConfig.injuryOverride"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-injury-override"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="!mt-0 cursor-pointer">
                          Any injury overrides wellness score (always red)
                        </FormLabel>
                        <p className="text-xs text-gray-500">
                          When enabled, athletes with injuries will always show as "red" regardless of their wellness score
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Dynamic Help Text */}
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Example:</strong> {form.watch('config.statusConfig.scaleOrientation') === 'lower_is_better'
                      ? 'For lower is better: Green ≤ 2, Yellow ≤ 4, Red > 4'
                      : 'For higher is better: Red ≤ 2, Yellow ≤ 4, Green > 4'}
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createTemplate.isPending || updateTemplate.isPending}
                  data-testid="button-save-template"
                >
                  {createTemplate.isPending || updateTemplate.isPending ? 'Saving...' : 'Save Template'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Question Editor Modal */}
      {showQuestionEditor && (
        <QuestionEditor
          isOpen={showQuestionEditor}
          onClose={() => {
            setShowQuestionEditor(false);
            setEditingQuestionIndex(null);
          }}
          onSave={handleSaveQuestion}
          question={editingQuestionIndex !== null ? questions[editingQuestionIndex] : undefined}
        />
      )}
    </>
  );
}
