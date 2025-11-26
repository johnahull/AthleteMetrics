import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useCloneWellnessTemplate } from '@/hooks/use-wellness-library';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import type { WellnessTemplate, QuestionConfig } from '@shared/wellness-types';

interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: WellnessTemplate;
  organizationId: string;
  showCloneButton?: boolean;
}

export default function TemplatePreviewModal({
  isOpen,
  onClose,
  template,
  organizationId,
  showCloneButton = true,
}: TemplatePreviewModalProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const cloneMutation = useCloneWellnessTemplate(organizationId);

  const handleClone = async () => {
    try {
      await cloneMutation.mutateAsync(template.id);
      toast({
        title: 'Success',
        description: 'Template cloned successfully',
      });
      onClose();
      setLocation('/wellness');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to clone template',
        variant: 'destructive',
      });
    }
  };

  const renderQuestionConfig = (question: QuestionConfig) => {
    switch (question.type) {
      case 'scale':
        return (
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              Scale: {question.scaleMin} - {question.scaleMax}
            </p>
            {question.minLabel && (
              <p>
                Min Label: <span className="font-medium">{question.minLabel}</span>
              </p>
            )}
            {question.maxLabel && (
              <p>
                Max Label: <span className="font-medium">{question.maxLabel}</span>
              </p>
            )}
          </div>
        );
      case 'text':
        return (
          <div className="text-sm text-gray-600">
            {question.placeholder && <p>Placeholder: "{question.placeholder}"</p>}
            {question.maxLength && <p>Max Length: {question.maxLength} characters</p>}
          </div>
        );
      case 'boolean':
        return <p className="text-sm text-gray-600">Yes/No question</p>;
      case 'body_map':
        return (
          <div className="text-sm text-gray-600">
            <p>{question.allowMultiple ? 'Multiple pain points allowed' : 'Single pain point'}</p>
          </div>
        );
      case 'multiple_choice':
        return (
          <div className="text-sm text-gray-600 space-y-1">
            <p>{question.allowMultiple ? 'Multi-select' : 'Single-select'}</p>
            <p className="font-medium">Options:</p>
            <ul className="list-disc list-inside pl-2">
              {question.options.map((option, idx) => (
                <li key={idx}>{option}</li>
              ))}
            </ul>
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {template.name}
            {template.isSystemSeeded && (
              <Badge variant="secondary" className="text-xs">
                System Template
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Description */}
          {template.description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Description</h3>
              <p className="text-sm text-gray-600">{template.description}</p>
            </div>
          )}

          {/* Category and Tags */}
          <div className="flex flex-wrap gap-4">
            {template.category && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Category</h3>
                <Badge variant="outline">{template.category}</Badge>
              </div>
            )}
            {template.tags && template.tags.length > 0 && (
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Tags</h3>
                <div className="flex flex-wrap gap-1">
                  {template.tags.map((tag, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Questions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Questions ({template.config.questions.length})
            </h3>
            <div className="space-y-3">
              {template.config.questions.map((question, index) => (
                <Card key={question.id} className="bg-gray-50">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-500">Q{index + 1}</span>
                          <Badge variant="outline" className="text-xs">
                            {question.type}
                          </Badge>
                          {question.required && (
                            <Badge variant="secondary" className="text-xs">
                              Required
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium text-gray-900">{question.label}</p>
                        {question.description && (
                          <p className="text-sm text-gray-600 mt-1">{question.description}</p>
                        )}
                      </div>
                    </div>
                    {renderQuestionConfig(question)}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Status Configuration */}
          {template.config.statusConfig && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Team Status Configuration</h3>
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Scale Orientation:</span>
                    <span className="font-medium">
                      {template.config.statusConfig.scaleOrientation === 'higher_is_better'
                        ? 'Higher is better'
                        : 'Lower is better'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Calculation Method:</span>
                    <span className="font-medium">
                      {template.config.statusConfig.calculationMethod === 'sum' ? 'Sum' : 'Average'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Red Threshold:</span>
                    <span className="font-medium">{template.config.statusConfig.redThreshold}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Yellow Threshold:</span>
                    <span className="font-medium">{template.config.statusConfig.yellowThreshold}</span>
                  </div>
                  {template.config.statusConfig.injuryOverride && (
                    <div className="pt-2 border-t border-blue-300">
                      <p className="text-blue-800 font-medium">
                        Any injury overrides wellness score (always red)
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Color Configuration */}
          {template.config.colorConfig && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Analytics Color Configuration</h3>
              <Card className="bg-gray-50">
                <CardContent className="pt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Low Threshold:</span>
                    <span className="font-medium">{template.config.colorConfig.lowThreshold}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Medium Threshold:</span>
                    <span className="font-medium">{template.config.colorConfig.mediumThreshold}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">High Threshold:</span>
                    <span className="font-medium">{template.config.colorConfig.highThreshold}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {showCloneButton && (
            <Button
              onClick={handleClone}
              disabled={cloneMutation.isPending}
              data-testid="button-clone-template"
            >
              {cloneMutation.isPending ? 'Cloning...' : 'Clone to My Organization'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
