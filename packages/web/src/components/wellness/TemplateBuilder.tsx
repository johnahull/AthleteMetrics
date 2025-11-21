import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useCreateWellnessTemplate, useUpdateWellnessTemplate } from '@/hooks/use-wellness-templates';
import type { WellnessTemplate, QuestionConfig } from '@shared/wellness-types';
import { createWellnessTemplateSchema } from '@shared/wellness-validation';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import QuestionEditor from './QuestionEditor';

interface TemplateBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  template?: WellnessTemplate | null;
  organizationId: string;
}

type FormData = z.infer<typeof createWellnessTemplateSchema>;

export default function TemplateBuilder({ isOpen, onClose, template, organizationId }: TemplateBuilderProps) {
  const { toast } = useToast();
  const createTemplate = useCreateWellnessTemplate(organizationId);
  const updateTemplate = useUpdateWellnessTemplate(organizationId);
  const [questions, setQuestions] = useState<QuestionConfig[]>(template?.config?.questions || []);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(createWellnessTemplateSchema),
    defaultValues: {
      name: template?.name || '',
      description: template?.description || '',
      config: {
        questions: template?.config?.questions || [],
      },
      isActive: template?.isActive ?? true,
      isDefault: template?.isDefault ?? false,
    },
  });

  // Sync questions with form
  useEffect(() => {
    form.setValue('config.questions', questions);
  }, [questions, form]);

  const onSubmit = async (data: FormData) => {
    try {
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
      onClose();
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
