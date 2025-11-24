import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Users, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import TemplateBuilder from '@/components/wellness/TemplateBuilder';
import type { WellnessTemplate } from '@shared/wellness-types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AdminWellnessTemplatesPage() {
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WellnessTemplate | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch system templates
  const { data: templates, isLoading, error } = useQuery<WellnessTemplate[]>({
    queryKey: ['/api/admin/wellness/templates'],
  });

  // Debug: Log query state
  console.log('🔍 [AdminWellnessTemplates] Query state:', {
    templatesCount: templates?.length,
    isLoading,
    error: error ? String(error) : null
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/wellness/templates/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to delete template');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/wellness/templates'] });
      toast({ title: 'Template deleted successfully' });
      setDeleteConfirm(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete template', description: error.message, variant: 'destructive' });
    },
  });

  // Handle delete with usage check
  const handleDelete = async (template: WellnessTemplate) => {
    try {
      const res = await fetch(`/api/admin/wellness/templates/${template.id}/usage`);
      if (!res.ok) {
        throw new Error('Failed to fetch template usage');
      }
      const usage = await res.json();
      setDeleteConfirm({ template, usage });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to check template usage',
        variant: 'destructive',
      });
    }
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      deleteMutation.mutate(deleteConfirm.template.id);
    }
  };

  const handleEditClick = (template: WellnessTemplate) => {
    setEditingTemplate(template);
    setIsBuilderOpen(true);
  };

  const handleCreateClick = () => {
    setEditingTemplate(null);
    setIsBuilderOpen(true);
  };

  const handleBuilderClose = () => {
    setIsBuilderOpen(false);
    setEditingTemplate(null);
  };

  const handleBuilderSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/wellness/templates'] });
    setIsBuilderOpen(false);
    setEditingTemplate(null);
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Global Wellness Templates</h1>
          <p className="text-gray-600 mt-2">
            Manage system templates that appear in all organizations' libraries
          </p>
        </div>
        <Button onClick={handleCreateClick}>
          <Plus className="w-4 h-4 mr-2" />
          Create Template
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading templates...</div>
      ) : templates && templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No system templates yet. Create your first global template.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates?.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => handleEditClick(template)}
              onDelete={() => handleDelete(template)}
            />
          ))}
        </div>
      )}

      {/* Template Builder Modal */}
      {isBuilderOpen && (
        <TemplateBuilder
          isOpen={isBuilderOpen}
          onClose={handleBuilderClose}
          template={editingTemplate}
          isSystemTemplate={true}
          onSuccess={handleBuilderSuccess}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete System Template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm && (
                <>
                  <p className="mb-2">
                    Are you sure you want to delete "{deleteConfirm.template.name}"?
                  </p>
                  {deleteConfirm.usage.organizationCount > 0 ? (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-yellow-800 font-medium">
                            This template is used by {deleteConfirm.usage.organizationCount} organization(s)
                          </p>
                          <p className="text-yellow-700 text-sm mt-1">
                            Deleting will remove it from the library, but existing clones will remain intact.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-600 mt-2">
                      This template is not currently used by any organizations.
                    </p>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Template'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface TemplateCardProps {
  template: WellnessTemplate;
  onEdit: () => void;
  onDelete: () => void;
}

function TemplateCard({ template, onEdit, onDelete }: TemplateCardProps) {
  const [usage, setUsage] = useState<any>(null);

  // Fetch usage on mount
  useState(() => {
    fetch(`/api/admin/wellness/templates/${template.id}/usage`)
      .then(res => res.json())
      .then(setUsage)
      .catch(console.error);
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{template.name}</CardTitle>
            <p className="text-sm text-gray-600 mt-1">{template.description}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="w-4 h-4 text-red-600" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm flex-wrap">
          {template.category && (
            <Badge variant="secondary">
              {template.category.charAt(0).toUpperCase() + template.category.slice(1)}
            </Badge>
          )}
          <div className="flex items-center gap-1 text-gray-600">
            <Users className="w-4 h-4" />
            <span>
              {usage ? `${usage.organizationCount} org${usage.organizationCount !== 1 ? 's' : ''}` : 'Loading...'}
            </span>
          </div>
          <span className="text-gray-600">
            {(template.config as any)?.questions?.length || 0} questions
          </span>
        </div>
        {template.tags && template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {template.tags.map((tag: string, i: number) => (
              <Badge key={i} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
