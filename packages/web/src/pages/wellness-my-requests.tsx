import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Clock, AlertCircle } from 'lucide-react';
import type { WellnessRequest, WellnessTemplate } from '@shared/wellness-types';
import { useLocation } from 'wouter';

const API_BASE = '';

export default function WellnessMyRequests() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Fetch pending wellness requests for this athlete
  const {
    data: requests,
    isLoading,
    error,
  } = useQuery<WellnessRequest[]>({
    queryKey: ['wellness-my-requests', user?.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/wellness/my-requests`);
      if (!res.ok) {
        throw new Error('Failed to load wellness requests');
      }
      return res.json();
    },
    enabled: !!user,
  });

  // Fetch templates to display names
  const templateIds = requests?.map((r) => r.templateId) || [];
  const {
    data: templates,
  } = useQuery<Record<string, WellnessTemplate>>({
    queryKey: ['wellness-templates-batch', templateIds],
    queryFn: async () => {
      const templateMap: Record<string, WellnessTemplate> = {};

      // Fetch all templates in parallel
      await Promise.all(
        templateIds.map(async (templateId) => {
          const res = await fetch(`${API_BASE}/api/wellness/templates/${templateId}`);
          if (res.ok) {
            templateMap[templateId] = await res.json();
          }
        })
      );

      return templateMap;
    },
    enabled: templateIds.length > 0,
  });

  const handleStartQuestionnaire = (request: WellnessRequest) => {
    // Navigate to submission page with token
    setLocation(`/wellness/submit/${request.publicToken}`);
  };

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (request: WellnessRequest) => {
    if (request.status === 'cancelled') {
      return <Badge variant="destructive">Cancelled</Badge>;
    }

    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      return <Badge variant="outline">Expired</Badge>;
    }

    return <Badge variant="default">Pending</Badge>;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="space-y-6">
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load wellness requests. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Filter active requests
  const activeRequests = requests?.filter(
    (r) =>
      r.status === 'active' &&
      (!r.expiresAt || new Date(r.expiresAt) >= new Date())
  ) || [];

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">My Wellness Requests</h1>
        <p className="text-muted-foreground">
          Complete wellness check-ins requested by your coach
        </p>
      </div>

      {activeRequests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No pending wellness requests at this time
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Pending Requests</h2>
          {activeRequests.map((request) => {
            const template = templates?.[request.templateId];

            return (
              <Card key={request.id} data-testid="wellness-request-card">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle>{template?.name || 'Wellness Check-In'}</CardTitle>
                      {template?.description && (
                        <CardDescription>{template.description}</CardDescription>
                      )}
                    </div>
                    {getStatusBadge(request)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      {request.scheduledFor && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>Scheduled: {formatDate(request.scheduledFor)}</span>
                        </div>
                      )}
                      {request.expiresAt && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span>Expires: {formatDate(request.expiresAt)}</span>
                        </div>
                      )}
                    </div>

                    {template && (
                      <div className="text-sm text-muted-foreground">
                        {template.config.questions.length} questions •{' '}
                        ~{Math.ceil(template.config.questions.length * 0.5)} min
                      </div>
                    )}

                    <Button
                      onClick={() => handleStartQuestionnaire(request)}
                      className="w-full sm:w-auto"
                    >
                      Start Questionnaire
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
