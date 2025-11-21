import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Edit, Trash2, Eye, Send, QrCode, MoreHorizontal } from 'lucide-react';
import type { WellnessTemplate } from '@shared/wellness-types';
import { useDeleteWellnessTemplate } from '@/hooks/use-wellness-templates';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import TemplatePreview from './TemplatePreview';

interface TemplateCardProps {
  template: WellnessTemplate;
  onEdit: (template: WellnessTemplate) => void;
  organizationId: string;
}

export default function TemplateCard({ template, onEdit, organizationId }: TemplateCardProps) {
  const { toast } = useToast();
  const deleteTemplate = useDeleteWellnessTemplate(organizationId);
  const [showPreview, setShowPreview] = useState(false);

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete "${template.name}"?`)) {
      try {
        await deleteTemplate.mutateAsync(template.id);
        toast({
          title: 'Success',
          description: 'Template deleted successfully',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to delete template',
          variant: 'destructive',
        });
      }
    }
  };

  const questionCount = template.config?.questions?.length || 0;

  return (
    <>
      <Card data-testid={`template-card-${template.id}`}>
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex flex-col flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
              {template.isDefault && (
                <Badge variant="secondary" data-testid={`badge-default-${template.id}`}>
                  Default
                </Badge>
              )}
            </div>
            {template.description && (
              <p className="text-sm text-gray-600 mt-1">{template.description}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onEdit(template)}
                data-testid={`button-edit-template-${template.id}`}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Template
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowPreview(true)}
                data-testid={`button-preview-template-${template.id}`}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-red-600"
                data-testid={`button-delete-template-${template.id}`}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Questions</span>
              <span className="font-medium">{questionCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Status</span>
              <Badge variant={template.isActive ? 'default' : 'secondary'}>
                {template.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {showPreview && (
        <TemplatePreview
          template={template}
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
