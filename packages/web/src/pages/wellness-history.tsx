import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, AlertCircle } from 'lucide-react';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';

const API_BASE = '';

export default function WellnessHistory() {
  const { user } = useAuth();
  const [selectedResponse, setSelectedResponse] = useState<WellnessResponse | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WellnessTemplate | null>(null);

  // Fetch submission history for this athlete
  const {
    data: responses,
    isLoading,
    error,
  } = useQuery<WellnessResponse[]>({
    queryKey: ['wellness-history', user?.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/wellness/my-responses`);
      if (!res.ok) {
        throw new Error('Failed to load wellness history');
      }
      return res.json();
    },
    enabled: !!user,
  });

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleViewDetails = async (response: WellnessResponse) => {
    setSelectedResponse(response);

    // Fetch template to show question labels
    try {
      const res = await fetch(`${API_BASE}/api/wellness/templates/${response.templateId}`);
      if (res.ok) {
        const template = await res.json();
        setSelectedTemplate(template);
      }
    } catch (error) {
      console.error('Failed to fetch template:', error);
    }
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
            Failed to load wellness history. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">My Wellness History</h1>
        <p className="text-muted-foreground">
          View your past wellness check-in submissions
        </p>
      </div>

      {!responses || responses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No wellness submissions yet
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {responses.map((response) => (
            <Card
              key={response.id}
              data-testid="submission-card"
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => handleViewDetails(response)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">
                      Wellness Check-In
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {formatDate(response.submittedAt)}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">
                    {Object.keys(response.responses).length} questions
                  </Badge>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedResponse} onOpenChange={() => setSelectedResponse(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submission Details</DialogTitle>
          </DialogHeader>

          {selectedResponse && (
            <div className="space-y-6">
              <div className="text-sm text-muted-foreground">
                Submitted on {formatDate(selectedResponse.submittedAt)}
              </div>

              <div className="space-y-4" data-testid="response-detail">
                {selectedTemplate &&
                  selectedTemplate.config.questions.map((question) => {
                    const answer = selectedResponse.responses[question.id];

                    return (
                      <div key={question.id} className="border-b pb-4 last:border-0">
                        <div className="font-medium mb-2">{question.label}</div>
                        <div className="text-muted-foreground">
                          {question.type === 'scale' && (
                            <div className="flex items-center gap-2">
                              <span className="text-2xl font-bold text-primary">
                                {String(answer)}
                              </span>
                              {'minLabel' in question && 'maxLabel' in question && (
                                <span className="text-sm">
                                  ({question.minLabel} - {question.maxLabel})
                                </span>
                              )}
                            </div>
                          )}
                          {question.type === 'text' && (
                            <p className="whitespace-pre-wrap">{String(answer || 'No response')}</p>
                          )}
                          {question.type === 'boolean' && (
                            <Badge variant={answer ? 'default' : 'secondary'}>
                              {answer ? 'Yes' : 'No'}
                            </Badge>
                          )}
                          {question.type === 'body_map' && Array.isArray(answer) && (
                            <div className="flex flex-wrap gap-2">
                              {answer.length > 0 ? (
                                answer.map((part: string) => (
                                  <Badge key={part} variant="outline">
                                    {part}
                                  </Badge>
                                ))
                              ) : (
                                <span>No areas selected</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
