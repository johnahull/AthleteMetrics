import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { WellnessTemplate } from '@shared/wellness-types';

interface TemplatePreviewProps {
  template: WellnessTemplate;
  isOpen: boolean;
  onClose: () => void;
}

export default function TemplatePreview({ template, isOpen, onClose }: TemplatePreviewProps) {
  const questions = template.config?.questions || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="template-preview">
        <DialogHeader>
          <DialogTitle>Preview: {template.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {template.description && (
            <p className="text-gray-600">{template.description}</p>
          )}

          <div className="space-y-6">
            {questions.map((question, index) => (
              <div
                key={index}
                className="p-4 border rounded-md bg-gray-50"
                data-testid={`preview-question-${index}`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className="font-medium text-gray-900">
                    {index + 1}. {question.label}
                  </span>
                  {question.required && (
                    <Badge variant="secondary" className="text-xs">Required</Badge>
                  )}
                </div>

                {question.description && (
                  <p className="text-sm text-gray-600 mb-3">{question.description}</p>
                )}

                {/* Preview based on question type */}
                {question.type === 'scale' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>{question.minLabel || question.scaleMin}</span>
                      <span>{question.maxLabel || question.scaleMax}</span>
                    </div>
                    <div className="flex gap-2">
                      {Array.from({ length: question.scaleMax - question.scaleMin + 1 }, (_, i) => (
                        <div
                          key={i}
                          className="flex-1 h-10 border-2 rounded-md flex items-center justify-center bg-white"
                        >
                          {question.scaleMin + i}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {question.type === 'text' && (
                  <div className="mt-2">
                    <div className="border-2 rounded-md p-3 bg-white text-gray-400 text-sm">
                      {question.placeholder || 'Enter your response...'}
                    </div>
                  </div>
                )}

                {question.type === 'boolean' && (
                  <div className="flex gap-4 mt-2">
                    <div className="flex-1 h-10 border-2 rounded-md flex items-center justify-center bg-white">
                      Yes
                    </div>
                    <div className="flex-1 h-10 border-2 rounded-md flex items-center justify-center bg-white">
                      No
                    </div>
                  </div>
                )}

                {question.type === 'body_map' && (
                  <div className="mt-2 p-4 border-2 rounded-md bg-white text-center text-gray-400">
                    <p className="text-sm">Body map interface would appear here</p>
                    {question.allowMultiple && (
                      <p className="text-xs mt-1">(Multiple selections allowed)</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {questions.length === 0 && (
            <p className="text-center text-gray-500 py-8">No questions in this template</p>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose} data-testid="button-close-preview">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
