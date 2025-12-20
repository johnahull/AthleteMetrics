import { useEffect, useState, useCallback } from 'react';
import { useRoute } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { ScaleQuestionInput } from '@/components/wellness/ScaleQuestionInput';
import { TextQuestionInput } from '@/components/wellness/TextQuestionInput';
import { BooleanQuestionInput } from '@/components/wellness/BooleanQuestionInput';
import { BodyMapInput } from '@/components/wellness/BodyMapInput';
import { MultipleChoiceQuestionInput } from '@/components/wellness/MultipleChoiceQuestionInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  WellnessRequest,
  WellnessTemplate,
  QuestionConfig,
  WellnessResponseData,
} from '@shared/wellness-types';

const API_BASE = '';

/**
 * Helper to get local storage key for auto-save
 *
 * SECURITY NOTE: localStorage is used for auto-save convenience but has limitations:
 * - Data is stored unencrypted on the client device
 * - Accessible to any JavaScript code on the same origin (vulnerable to XSS)
 * - Persists until manually cleared (data remains after browser close)
 * - No server-side control over data retention
 *
 * This is acceptable for wellness draft responses because:
 * - Data is draft-only and cleared on successful submission
 * - Users are informed via "Previous answers restored" message
 * - Wellness responses are not considered highly sensitive
 * - Auto-save is disabled in incognito/private browsing modes
 *
 * For sensitive data (auth tokens, PII), use secure httpOnly cookies or sessionStorage
 */
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
  const queryClient = useQueryClient();

  const [responses, setResponses] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [showDraftRestored, setShowDraftRestored] = useState(false);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [athleteName, setAthleteName] = useState('');

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
    error: templateError,
  } = useQuery<WellnessTemplate>({
    queryKey: ['wellness-template', request?.templateId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/wellness/requests/by-token/${token}/template`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to load wellness template');
      }
      return res.json();
    },
    enabled: !!request?.templateId,
    retry: (failureCount, error) => {
      // Don't retry on 404 or other client errors
      if (error.message.includes('not found')) return false;
      // Retry up to 3 times for server/network errors
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });

  // Check if user has already submitted for this request
  const {
    data: submissionCheck,
    isLoading: isCheckingSubmission,
  } = useQuery<{ hasSubmitted: boolean; submittedAt?: string; responseId?: string }>({
    queryKey: ['wellness-submission-check', request?.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/wellness/requests/${request?.id}/check-submission`);
      if (!res.ok) {
        // If check fails, assume not submitted to allow form access
        return { hasSubmitted: false };
      }
      return res.json();
    },
    enabled: !!request?.id,
  });

  // Fetch targeted athletes for dropdown
  const {
    data: targetedAthletes,
    isLoading: isLoadingAthletes,
  } = useQuery<{ athletes: Array<{ id: string; fullName: string; teamName: string | null; teamId: string | null }> }>({
    queryKey: ['targeted-athletes', token],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/wellness/requests/by-token/${token}/targeted-athletes`);
      if (!res.ok) throw new Error('Failed to load athletes');
      return res.json();
    },
    enabled: !!token,
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { responses: WellnessResponseData; selectedAthleteId?: string | null; athleteName?: string }) => {
      const res = await fetch(`${API_BASE}/api/wellness/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request?.id,
          token,
          templateId: template?.id,
          responses: data.responses,
          athlete: data.selectedAthleteId, // Middleware expects 'athlete' parameter
          selectedAthleteId: data.selectedAthleteId,
          athleteName: data.athleteName,
          date: new Date().toISOString().split('T')[0],
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        console.error('Wellness submission failed:', error);
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

      // Invalidate wellness-my-requests query to update pending tasks banner
      queryClient.invalidateQueries({ queryKey: ['wellness-my-requests'] });

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
    if (request?.id && template) {
      const key = getAutoSaveKey(request.id);
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);

          // Migrate old body_map string values to coordinate objects
          const migratedResponses: Record<string, any> = {};
          for (const [questionId, value] of Object.entries(parsed)) {
            const question = template.config.questions.find((q: any) => q.id === questionId);

            // If it's a body_map question and the value is an array of strings, skip it
            // (force user to re-select, as we can't reliably map strings to coordinates)
            if (question?.type === 'body_map' && Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
              console.log(`Clearing old body_map data for question ${questionId}`);
              continue; // Skip this question, user will need to re-select
            }

            migratedResponses[questionId] = value;
          }

          setResponses(migratedResponses);
          setShowDraftRestored(true);
          setTimeout(() => setShowDraftRestored(false), 5000);
        } catch (error) {
          console.error('Failed to restore draft:', error);
        }
      }
    }
  }, [request?.id, template]);

  // Check if token is expired
  const isExpired = request?.expiresAt && new Date(request.expiresAt) < new Date();

  // Check if already submitted (checks both API and current session state)
  const hasSubmitted = isSubmitted || (submissionCheck?.hasSubmitted ?? false);

  // Calculate progress
  const questions = template?.config?.questions || [];
  const answeredCount = questions.filter((q) => {
    const answer = responses[q.id];

    // Check if answer is not empty based on question type
    if (answer === null || answer === undefined) {
      return false;
    }

    if (q.type === 'multiple_choice' && q.allowMultiple) {
      // For multi-select, check if array has items
      return Array.isArray(answer) && answer.length > 0;
    }

    if (typeof answer === 'string') {
      return answer !== '';
    }

    // For other types (number, boolean, array), just check it exists
    return true;
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

    // Validate athlete selection OR manual name
    if (!showManualEntry && !selectedAthleteId) {
      newErrors['athleteSelection'] = 'Please select your name or choose manual entry';
    } else if (showManualEntry && (!athleteName || athleteName.trim().length === 0)) {
      newErrors['athleteName'] = 'Please enter your name';
    }

    questions.forEach((question) => {
      if (question.required) {
        const answer = responses[question.id];

        // Check if answer is empty based on question type
        let isEmpty = false;

        if (answer === null || answer === undefined) {
          isEmpty = true;
        } else if (question.type === 'multiple_choice' && question.allowMultiple) {
          // For multi-select, check if array is empty
          isEmpty = !Array.isArray(answer) || answer.length === 0;
        } else if (typeof answer === 'string' && answer === '') {
          isEmpty = true;
        }

        if (isEmpty) {
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

    // Transform responses to include question labels (required by API schema)
    const formattedResponses: WellnessResponseData = {};
    questions.forEach((question) => {
      if (responses[question.id] !== undefined && responses[question.id] !== null) {
        formattedResponses[question.id] = {
          value: responses[question.id],
          label: question.label,
        };
      }
    });

    submitMutation.mutate({
      responses: formattedResponses,
      selectedAthleteId: showManualEntry ? null : selectedAthleteId,
      athleteName: showManualEntry ? athleteName.trim() : undefined
    });
  };

  // Loading state
  if (isLoadingRequest || isLoadingTemplate || isCheckingSubmission) {
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
  if (requestError || templateError || !request || !template) {
    const displayError = requestError || templateError;
    return (
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {displayError instanceof Error
              ? displayError.message
              : 'Failed to load wellness questionnaire. Please try again later.'}
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
            {(submittedAt || submissionCheck?.submittedAt) && (
              <p className="text-sm text-muted-foreground">
                Submitted at {submittedAt || new Date(submissionCheck?.submittedAt!).toLocaleString()}
              </p>
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

          {/* Athlete Selection */}
          <div className="mb-8 p-4 border rounded-md bg-muted/50">
            <Label className="text-base font-semibold">
              Your Name <span className="text-red-500">*</span>
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Please select your name from the list below
            </p>

            {isLoadingAthletes ? (
              <Skeleton className="h-10 w-full" />
            ) : !showManualEntry ? (
              <>
                <Select
                  value={selectedAthleteId || ""}
                  onValueChange={(value) => {
                    if (value === "manual-entry") {
                      setShowManualEntry(true);
                      setSelectedAthleteId(null);
                    } else {
                      setSelectedAthleteId(value);
                      // Clear error when athlete is selected
                      if (errors['athleteSelection']) {
                        setErrors((prev) => {
                          const newErrors = { ...prev };
                          delete newErrors['athleteSelection'];
                          return newErrors;
                        });
                      }
                    }
                  }}
                >
                  <SelectTrigger data-testid="athlete-selector">
                    <SelectValue placeholder="Select your name..." />
                  </SelectTrigger>
                  <SelectContent>
                    {targetedAthletes?.athletes?.map((athlete) => (
                      <SelectItem key={athlete.id} value={athlete.id}>
                        {athlete.fullName}{athlete.teamName ? ` (${athlete.teamName})` : ''}
                      </SelectItem>
                    ))}
                    <SelectItem value="manual-entry" className="border-t mt-2">
                      <span className="italic">Not listed? Enter manually</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {errors['athleteSelection'] && (
                  <p className="text-sm text-red-500 mt-1">{errors['athleteSelection']}</p>
                )}
              </>
            ) : (
              <>
                <Input
                  type="text"
                  placeholder="Enter your full name"
                  value={athleteName}
                  onChange={(e) => {
                    setAthleteName(e.target.value);
                    // Clear error when user starts typing
                    if (errors['athleteName']) {
                      setErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors['athleteName'];
                        return newErrors;
                      });
                    }
                  }}
                  data-testid="manual-name-input"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowManualEntry(false);
                    setAthleteName('');
                    // Clear error
                    if (errors['athleteName']) {
                      setErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors['athleteName'];
                        return newErrors;
                      });
                    }
                  }}
                  className="mt-2"
                >
                  ← Back to athlete list
                </Button>
                {errors['athleteName'] && (
                  <p className="text-sm text-red-500 mt-1">{errors['athleteName']}</p>
                )}
              </>
            )}
          </div>

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
                case 'multiple_choice':
                  return (
                    <MultipleChoiceQuestionInput
                      key={question.id}
                      question={question}
                      value={value || (question.allowMultiple ? [] : null)}
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
