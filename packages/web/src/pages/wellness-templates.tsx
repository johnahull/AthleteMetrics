import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWellnessTemplates } from '@/hooks/use-wellness-templates';
import { useWellnessRequests } from '@/hooks/use-wellness-requests';
import TemplateBuilder from '@/components/wellness/TemplateBuilder';
import TemplateCard from '@/components/wellness/TemplateCard';
import RequestModal from '@/components/wellness/RequestModal';
import RequestsList from '@/components/wellness/RequestsList';

export default function WellnessTemplates() {
  const { organizationContext, userOrganizations, user } = useAuth();
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'templates' | 'requests'>('templates');

  // Get effective organization ID
  const getEffectiveOrganizationId = () => {
    if (organizationContext) return organizationContext;
    const isSiteAdmin = user?.isSiteAdmin || false;
    if (!isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
      return userOrganizations[0].organizationId;
    }
    return null;
  };

  const effectiveOrganizationId = getEffectiveOrganizationId();

  // Fetch templates
  const { data: templates, isLoading: templatesLoading } = useWellnessTemplates({
    organizationId: effectiveOrganizationId || '',
    activeOnly: false,
  });

  // Fetch requests
  const { data: requests, isLoading: requestsLoading } = useWellnessRequests({
    organizationId: effectiveOrganizationId || '',
  });

  if (!effectiveOrganizationId) {
    return (
      <div className="p-6">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <p className="text-yellow-800">
              Please select an organization to manage wellness questionnaires.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Wellness Questionnaires</h1>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as any)} className="space-y-6">
        <TabsList>
          <TabsTrigger value="templates" role="tab">
            Templates
          </TabsTrigger>
          <TabsTrigger value="requests" role="tab">
            Requests
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => setShowTemplateBuilder(true)}
                data-testid="button-add-template"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Template
              </Button>
            </div>

            {templatesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            ) : templates && templates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onEdit={(template) => {
                      setEditingTemplate(template);
                      setShowTemplateBuilder(true);
                    }}
                    organizationId={effectiveOrganizationId}
                  />
                ))}
              </div>
            ) : (
              <Card className="bg-gray-50 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-gray-600 text-center mb-4">
                    No wellness templates yet. Create your first template to get started.
                  </p>
                  <Button onClick={() => setShowTemplateBuilder(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Template
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Requests Tab */}
        <TabsContent value="requests">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => setShowRequestModal(true)}
                data-testid="button-send-request"
              >
                <Plus className="h-4 w-4 mr-2" />
                Send Request
              </Button>
            </div>

            {requestsLoading ? (
              <Skeleton className="h-96" />
            ) : (
              <RequestsList
                requests={requests || []}
                organizationId={effectiveOrganizationId}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Template Builder Modal */}
      {showTemplateBuilder && (
        <TemplateBuilder
          isOpen={showTemplateBuilder}
          onClose={() => {
            setShowTemplateBuilder(false);
            setEditingTemplate(null);
          }}
          template={editingTemplate}
          organizationId={effectiveOrganizationId}
        />
      )}

      {/* Request Modal */}
      {showRequestModal && (
        <RequestModal
          isOpen={showRequestModal}
          onClose={() => setShowRequestModal(false)}
          organizationId={effectiveOrganizationId}
          templates={templates || []}
        />
      )}
    </div>
  );
}
