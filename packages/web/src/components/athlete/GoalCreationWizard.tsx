/**
 * GoalCreationWizard Component
 * Week 4: Goal Setting System
 *
 * A step-by-step wizard for creating athlete goals:
 * - Step 1: Select metric
 * - Step 2: Choose goal type (with smart suggestions)
 * - Step 3: Set target value and date
 */

import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useMetricLabels } from '@/hooks/use-metric-labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DurationInput } from '@/components/duration-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Target,
  TrendingUp,
  Calendar,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MetricType } from '@shared/analytics-types';
import {
  GoalType,
  GoalStatus,
  suggestGoals,
  GoalSuggestion,
} from '@/utils/goal-utils';
import {
  getMetricEducation,
  formatMetricValue,
  isLowerBetterMetric,
} from '@/utils/metric-education-utils';

interface Measurement {
  metric: string;
  value: number | string;
  date: string;
  units?: string | null;
}

interface GoalCreationData {
  metric: string;
  goalType: GoalType;
  targetValue: number;
  targetDate: string;
  baselineValue: number;
}

interface GoalCreationWizardProps {
  measurements: Measurement[];
  availableMetrics: string[];
  /** Codes of time (mm:ss) metrics: their target value is typed as m:ss */
  durationMetrics?: string[];
  /** Better/worse direction per metric code; without an entry the built-in lists decide */
  metricTypes?: Record<string, MetricType>;
  /** True while the metric list (and so metricTypes) is loading: the saved baseline depends on direction */
  metricTypesLoading?: boolean;
  /** True when the metric list failed to load: no direction is known, so no goal can be saved */
  metricTypesError?: boolean;
  onCreateGoal: (goal: GoalCreationData) => void | Promise<void>;
  onCancel: () => void;
}

type WizardStep = 1 | 2 | 3;

export function GoalCreationWizard({
  measurements,
  availableMetrics,
  durationMetrics,
  metricTypes,
  metricTypesLoading,
  metricTypesError,
  onCreateGoal,
  onCancel,
}: GoalCreationWizardProps) {
  // Once the list has loaded, a code with no type that is not a built-in has no known direction, so no goal for it
  const hasDirection = (metric: string) =>
    !metricTypes || metricTypesLoading || !!metricTypes[metric] ||
    !!getMetricEducation(metric) || isLowerBetterMetric(metric);
  const pickableMetrics = availableMetrics.filter(hasDirection);

  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const { getUnit } = useMetricLabels();
  const selectedUnit = selectedMetric ? getUnit(selectedMetric) : '';
  const [selectedGoalType, setSelectedGoalType] = useState<GoalType | null>(null);
  const [targetValue, setTargetValue] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ target?: string; date?: string; count?: string }>({});
  // A code picked while loading can turn out to have no direction
  const metricUnavailable = !!selectedMetric && !hasDirection(selectedMetric);
  const submitBlocked = metricTypesLoading || metricTypesError || metricUnavailable;

  // Get current performance for selected metric
  const currentPerformance = useMemo(() => {
    if (!selectedMetric) return null;

    const metricMeasurements = measurements
      .filter((m) => m.metric === selectedMetric)
      .map((m) => ({
        ...m,
        value: typeof m.value === 'string' ? parseFloat(m.value) : m.value,
      }));

    if (metricMeasurements.length === 0) return null;

    const lowerIsBetter = isLowerBetterMetric(selectedMetric, metricTypes?.[selectedMetric]);
    const best = lowerIsBetter
      ? Math.min(...metricMeasurements.map((m) => m.value))
      : Math.max(...metricMeasurements.map((m) => m.value));

    const latest = metricMeasurements.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0].value;

    return { best, latest, count: metricMeasurements.length };
  }, [selectedMetric, measurements, metricTypes]);

  // Get smart suggestions
  const suggestions = useMemo(() => {
    if (!selectedMetric) return [];
    return suggestGoals(measurements, selectedMetric, metricTypes?.[selectedMetric]);
  }, [selectedMetric, measurements, metricTypes]);

  // Validate target value
  const validateTargetValue = (value: string): string | null => {
    if (!selectedMetric || !currentPerformance) return null;

    const numValue = parseFloat(value);
    if (isNaN(numValue)) return 'Please enter a valid number';

    const lowerIsBetter = isLowerBetterMetric(selectedMetric, metricTypes?.[selectedMetric]);

    if (selectedGoalType === GoalType.TARGET_VALUE) {
      if (lowerIsBetter && numValue >= currentPerformance.best) {
        return 'Target should be better (lower) than your current best';
      }
      if (!lowerIsBetter && numValue <= currentPerformance.best) {
        return 'Target should be better (higher) than your current best';
      }
    }

    if (selectedGoalType === GoalType.IMPROVEMENT_PERCENTAGE) {
      if (numValue <= 0) return 'Improvement percentage must be positive';
      if (numValue > 50) return 'Improvement percentage seems too ambitious (max 50%)';
    }

    if (selectedGoalType === GoalType.CONSISTENCY) {
      if (numValue < 1) return 'Must be at least 1 measurement';
      if (!Number.isInteger(numValue)) return 'Must be a whole number';
    }

    return null;
  };

  // Validate target date
  const validateTargetDate = (date: string): string | null => {
    if (!date) return 'Please select a target date';

    // 'YYYY-MM-DD' compares as a string
    if (date <= format(new Date(), 'yyyy-MM-dd')) {
      return 'Date must be in the future';
    }

    return null;
  };

  // Handle metric selection
  const handleSelectMetric = (metric: string) => {
    setSelectedMetric(metric);
    setCurrentStep(2);
  };

  // Handle goal type selection
  const handleSelectGoalType = (goalType: GoalType) => {
    setSelectedGoalType(goalType);
    setTargetValue('');
    setErrors({});
    setCurrentStep(3);
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: GoalSuggestion) => {
    setSelectedGoalType(suggestion.goalType);
    setTargetValue(String(suggestion.targetValue));
    setErrors({});
    setCurrentStep(3);
  };

  // Handle target value change
  const handleTargetValueChange = (value: string) => {
    setTargetValue(value);
    const error = validateTargetValue(value);
    setErrors((prev) => ({ ...prev, target: error || undefined }));
  };

  // Handle target date change
  const handleTargetDateChange = (value: string) => {
    setTargetDate(value);
    const error = validateTargetDate(value);
    setErrors((prev) => ({ ...prev, date: error || undefined }));
  };

  // Calculate target value from percentage improvement
  const calculatedTarget = useMemo(() => {
    if (
      selectedGoalType !== GoalType.IMPROVEMENT_PERCENTAGE ||
      !currentPerformance ||
      !selectedMetric
    )
      return null;

    const percent = parseFloat(targetValue);
    if (isNaN(percent)) return null;

    const lowerIsBetter = isLowerBetterMetric(selectedMetric, metricTypes?.[selectedMetric]);
    const improvement = currentPerformance.best * (percent / 100);

    return lowerIsBetter
      ? currentPerformance.best - improvement
      : currentPerformance.best + improvement;
  }, [selectedGoalType, targetValue, currentPerformance, selectedMetric, metricTypes]);

  // Check if form is valid
  const isFormValid = useMemo(() => {
    if (!targetValue || !targetDate) return false;
    if (validateTargetValue(targetValue)) return false;
    if (validateTargetDate(targetDate)) return false;
    return true;
  }, [targetValue, targetDate, validateTargetValue, validateTargetDate]);

  // Handle form submission
  const handleSubmit = async () => {
    if (!selectedMetric || !selectedGoalType || !currentPerformance || submitBlocked) return;

    setIsSubmitting(true);

    try {
      await onCreateGoal({
        metric: selectedMetric,
        goalType: selectedGoalType,
        targetValue: parseFloat(targetValue),
        targetDate,
        baselineValue: currentPerformance.best,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get label for target input based on goal type
  const getTargetInputLabel = () => {
    switch (selectedGoalType) {
      case GoalType.TARGET_VALUE:
        return 'Target Value';
      case GoalType.IMPROVEMENT_PERCENTAGE:
        return 'Improvement Percentage';
      case GoalType.CONSISTENCY:
        return 'Number of Measurements';
      default:
        return 'Target';
    }
  };

  return (
    <Card
      role="dialog"
      aria-label="Create new goal wizard"
      className="w-full max-w-lg mx-auto"
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Create New Goal</span>
          <div
            data-testid="step-indicator"
            role="status"
            aria-live="polite"
            className="text-sm font-normal text-gray-500"
          >
            Step {currentStep} of 3
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Step 1: Select Metric */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Select a Metric</h3>
            <div className="grid gap-2">
              {pickableMetrics.map((metric) => {
                const education = getMetricEducation(metric);
                return (
                  <Button
                    key={metric}
                    variant="outline"
                    className="justify-start h-auto py-3"
                    onClick={() => handleSelectMetric(metric)}
                  >
                    <Target className="h-5 w-5 mr-2 text-blue-500" />
                    <div className="text-left">
                      <div className="font-medium">{education?.name || metric}</div>
                      <div className="text-xs text-gray-500">
                        {education?.description?.slice(0, 60)}...
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Choose Goal Type */}
        {currentStep === 2 && selectedMetric && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Choose Goal Type</h3>

            {/* Current Performance */}
            {currentPerformance && (
              <div
                data-testid="current-performance"
                className="p-3 bg-blue-50 rounded-lg"
              >
                <p className="text-sm text-blue-800">
                  Current best:{' '}
                  <span className="font-bold">
                    {formatMetricValue(currentPerformance.best, selectedMetric, selectedUnit)}
                  </span>
                  {' '}({currentPerformance.count} measurements)
                </p>
              </div>
            )}

            {/* Smart Suggestions */}
            {suggestions.length > 0 && (
              <div data-testid="smart-suggestions" className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Sparkles className="h-4 w-4 text-yellow-500" />
                  <span>Smart Suggestions</span>
                </div>
                <div className="grid gap-2">
                  {suggestions.slice(0, 3).map((suggestion, index) => (
                    <Button
                      key={index}
                      data-testid="suggestion-button"
                      variant="outline"
                      className="justify-start h-auto py-2 text-left"
                      onClick={() => handleSelectSuggestion(suggestion)}
                    >
                      <div>
                        <div className="font-medium">{suggestion.description}</div>
                        <div className="flex gap-2 mt-1">
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-xs',
                              suggestion.difficulty === 'easy' &&
                                'bg-green-100 text-green-800',
                              suggestion.difficulty === 'moderate' &&
                                'bg-yellow-100 text-yellow-800',
                              suggestion.difficulty === 'challenging' &&
                                'bg-red-100 text-red-800'
                            )}
                          >
                            {suggestion.difficulty}
                          </Badge>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Goal Type Selection */}
            <div className="space-y-2 pt-4 border-t">
              <p className="text-sm text-gray-600">Or choose manually:</p>
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => handleSelectGoalType(GoalType.TARGET_VALUE)}
                >
                  <Target className="h-4 w-4 mr-2" />
                  Target Value
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => handleSelectGoalType(GoalType.IMPROVEMENT_PERCENTAGE)}
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Improvement Percentage
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => handleSelectGoalType(GoalType.CONSISTENCY)}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Consistency
                </Button>
              </div>
            </div>

            <Button variant="ghost" onClick={() => setCurrentStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        )}

        {/* Step 3: Set Target */}
        {currentStep === 3 && selectedMetric && selectedGoalType && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Set Target</h3>

            {/* Target Value Input */}
            <div className="grid gap-y-2">
              <Label htmlFor="target-value">{getTargetInputLabel()}</Label>
              {selectedGoalType === GoalType.TARGET_VALUE && durationMetrics?.includes(selectedMetric) ? (
                <DurationInput
                  id="target-value"
                  value={targetValue ? Number(targetValue) : undefined}
                  onValueChange={(seconds) => handleTargetValueChange(seconds === undefined ? '' : String(seconds))}
                  aria-describedby={errors.target ? 'target-error' : undefined}
                />
              ) : (
              <Input
                id="target-value"
                type="number"
                step="any"
                value={targetValue}
                onChange={(e) => handleTargetValueChange(e.target.value)}
                placeholder={
                  selectedGoalType === GoalType.CONSISTENCY
                    ? 'e.g., 10'
                    : selectedGoalType === GoalType.IMPROVEMENT_PERCENTAGE
                    ? 'e.g., 5'
                    : 'e.g., 1.05'
                }
                aria-describedby={errors.target ? 'target-error' : undefined}
              />
              )}
              {errors.target && (
                <p id="target-error" className="text-sm text-red-600">
                  {errors.target}
                </p>
              )}
            </div>

            {/* Calculated Target for Percentage Goals */}
            {selectedGoalType === GoalType.IMPROVEMENT_PERCENTAGE &&
              calculatedTarget !== null && (
                <div
                  data-testid="calculated-target"
                  className="p-2 bg-gray-50 rounded text-sm"
                >
                  Target will be:{' '}
                  <span className="font-bold">
                    {formatMetricValue(calculatedTarget, selectedMetric, selectedUnit)}
                  </span>
                </div>
              )}

            {/* Target Date Input */}
            <div className="grid gap-y-2">
              <Label htmlFor="target-date">Target Date</Label>
              <Input
                id="target-date"
                type="date"
                value={targetDate}
                onChange={(e) => handleTargetDateChange(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
                aria-describedby={errors.date ? 'date-error' : undefined}
              />
              {errors.date && (
                <p id="date-error" className="text-sm text-red-600">
                  {errors.date}
                </p>
              )}
            </div>

            {metricUnavailable && (
              <p className="text-sm text-red-600" role="alert">
                This metric is not available for goals. Go back and pick another metric.
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              <Button variant="ghost" onClick={() => setCurrentStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={!isFormValid || isSubmitting || submitBlocked}
              >
                {isSubmitting ? (
                  <>
                    <Loader2
                      data-testid="loading-spinner"
                      className="h-4 w-4 mr-2 animate-spin"
                    />
                    Creating...
                  </>
                ) : metricTypesLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                    Loading metrics…
                  </>
                ) : metricTypesError ? (
                  'Metrics unavailable, try again later'
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Create Goal
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Cancel Button (visible on all steps) */}
        <div className="pt-4 border-t">
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
