import { useEffect, useState, useCallback } from 'react';
import { useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { ScaleQuestionInput } from '@/components/wellness/ScaleQuestionInput';
import { TextQuestionInput } from '@/components/wellness/TextQuestionInput';
import { BooleanQuestionInput } from '@/components/wellness/BooleanQuestionInput';
import { BodyMapInput } from '@/components/wellness/BodyMapInput';
import type {
  WellnessRequest,
  WellnessTemplate,
  QuestionConfig,
  WellnessResponseData,
} from '@shared/wellness-types';

const API_BASE = '';

// Helper to get local storage key for auto-save
function getAutoSaveKey(requestId: string): string {
  return `wellness-draft-${requestId}`;
}

// Helper to debounce auto-save
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function WellnessSubmit() {
  const [, params] = useRoute('/wellness/submit/:token');
  const token = params?.token;
  const { toast } = useToast();

  const [responses, setResponses] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [showDraftRestored, setShowDraftRestored] = useState(false);

  // Debounce responses for auto-save
  const debouncedResponses = useDebounce(responses, 1000);

  // Fetch wellness request and template
  const {
    data: request,
    isLoading: isLoadingRequest,
    error: requestError,
  } = useQuery<WellnessRequest>({
    queryKey: ['wellness-request', token],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/wellness/requests/by-token/${token}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Wellness request not found');
        }
        throw new Error('Failed to load wellness request');
      }
      return res.json();
    },
    enabled: !!token,
  });

  const {
    data: template,
    isLoading: isLoadingTemplate,
  } = useQuery<WellnessTemplate>({
    queryKey: ['wellness-template', request?.templateId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/wellness/templates/${request?.templateId}`);
      if (!res.ok) {
        throw new Error('Failed to load wellness template');
      }
      return res.json();
    },
    enabled: !!request?.templateId,
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { responses: WellnessResponseData }) => {
      const res = await fetch(`${API_BASE}/api/wellness/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request?.id,
          token,
          responses: data.responses,
          date: new Date().toISOString().split('T')[0],
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to submit wellness response');
      }

      return res.json();
    },
    onSuccess: () => {
      setIsSubmitted(true);
      setSubmittedAt(new Date().toLocaleString());

      // Clear auto-save draft
      if (request?.id) {
        localStorage.removeItem(getAutoSaveKey(request.id));
      }

      toast({
        title: 'Success',
        description: 'Your wellness response has been submitted',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Submission failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Auto-save to local storage
  useEffect(() => {
    if (request?.id && Object.keys(debouncedResponses).length > 0 && !isSubmitted) {
      const key = getAutoSaveKey(request.id);
      localStorage.setItem(key, JSON.stringify(debouncedResponses));
    }
  }, [debouncedResponses, request?.id, isSubmitted]);

  // Restore draft from local storage on mount
  useEffect(() => {
    if (request?.id) {
      const key = getAutoSaveKey(request.id);
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setResponses(parsed);
          setShowDraftRestored(true);
          setTimeout(() => setShowDraftRestored(false), 5000);
        } catch (error) {
          console.error('Failed to restore draft:', error);
        }
      }
    }
  }, [request?.id]);

  // Check if token is expired
  const isExpired = request?.expiresAt && new Date(request.expiresAt) < new Date();

  // Check if already submitted (by checking local storage or API)
  const hasSubmitted = isSubmitted; // TODO: Check if user already submitted this request

  // Calculate progress
  const questions = template?.config?.questions || [];
  const answeredCount = questions.filter((q) => {
    const answer = responses[q.id];
    return answer !== null && answer !== undefined && answer !== '';
  }).length;
  const progressPercentage = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  // Handle question change
  const handleQuestionChange = useCallback((questionId: string, value: any) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
    // Clear error for this question
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[questionId];
      return newErrors;
    });
  }, []);

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    questions.forEach((question) => {
      if (question.required) {
        const answer = responses[question.id];
        if (answer === null || answer === undefined || answer === '') {
          newErrors[question.id] = 'This question is required';
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast({
        title: 'Validation error',
        description: 'Please answer all required questions',
        variant: 'destructive',
      });
      return;
    }

    submitMutation.mutate({ responses });
  };

  // Loading state
  if (isLoadingRequest || isLoadingTemplate) {
    return (
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full mt-2" />
          </CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (requestError || !request || !template) {
    return (
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {requestError instanceof Error ? requestError.message : 'Failed to load wellness questionnaire'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Expired state
  if (isExpired) {
    return (
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <Alert variant="destructive">
          <Clock className="h-4 w-4" />
          <AlertDescription>
            <p className="font-semibold">This wellness questionnaire link has expired</p>
            <p className="text-sm mt-1">Please contact your coach for a new link</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Already submitted state
  if (hasSubmitted) {
    return (
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <CardTitle>Thank you for completing the wellness questionnaire</CardTitle>
            </div>
            <CardDescription>Your responses have been recorded</CardDescription>
          </CardHeader>
          <CardContent>
            {submittedAt && (
              <p className="text-sm text-muted-foreground">Submitted at {submittedAt}</p>
            )}
            <p className="mt-4 text-sm">You have already submitted this questionnaire</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main form
  return (
    <div className="container max-w-3xl mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Wellness Check-In</CardTitle>
          <CardDescription>{template.name}</CardDescription>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-2">{template.description}</p>
          )}
        </CardHeader>

        <CardContent>
          {/* Draft restored message */}
          {showDraftRestored && (
            <Alert className="mb-6">
              <AlertDescription>Previous answers restored</AlertDescription>
            </Alert>
          )}

          {/* Progress indicator */}
          <div className="mb-8" data-testid="progress-indicator">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>
                {answeredCount} of {questions.length} questions answered
              </span>
              <span>{Math.round(progressPercentage)}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          {/* Questions */}
          <form onSubmit={handleSubmit} className="space-y-8">
            {questions.map((question) => {
              const value = responses[question.id];
              const error = errors[question.id];

              switch (question.type) {
                case 'scale':
                  return (
                    <ScaleQuestionInput
                      key={question.id}
                      question={question}
                      value={value}
                      onChange={(val) => handleQuestionChange(question.id, val)}
                      error={error}
                    />
                  );
                case 'text':
                  return (
                    <TextQuestionInput
                      key={question.id}
                      question={question}
                      value={value || ''}
                      onChange={(val) => handleQuestionChange(question.id, val)}
                      error={error}
                    />
                  );
                case 'boolean':
                  return (
                    <BooleanQuestionInput
                      key={question.id}
                      question={question}
                      value={value}
                      onChange={(val) => handleQuestionChange(question.id, val)}
                      error={error}
                    />
                  );
                case 'body_map':
                  return (
                    <BodyMapInput
                      key={question.id}
                      question={question}
                      value={value || []}
                      onChange={(val) => handleQuestionChange(question.id, val)}
                      error={error}
                    />
                  );
                default:
                  return null;
              }
            })}

            <CardFooter className="px-0 pt-6">
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitMutation.isPending || hasSubmitted}
              >
                {submitMutation.isPending ? 'Submitting...' : 'Submit'}
              </Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
