/**
 * GoalProgressCard Component
 * Week 4: Goal Setting System
 *
 * Displays an athlete's goal with:
 * - Progress bar visualization
 * - Current vs target values
 * - Days remaining countdown
 * - Status indicators
 * - Action buttons (mark complete, abandon)
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Target, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Goal,
  GoalStatus,
  GoalType,
  calculateGoalProgress,
  formatGoalTarget,
  getDaysRemaining,
  isGoalAchieved,
} from '@/utils/goal-utils';
import { getMetricEducation, formatMetricValue } from '@/utils/metric-education-utils';

interface GoalProgressCardProps {
  goal: Goal;
  onMarkComplete?: (goalId: string) => void;
  onAbandon?: (goalId: string) => void;
  compact?: boolean;
}

export function GoalProgressCard({
  goal,
  onMarkComplete,
  onAbandon,
  compact = false,
}: GoalProgressCardProps) {
  const progress = calculateGoalProgress(goal);
  const daysRemaining = getDaysRemaining(goal.targetDate);
  const achieved = isGoalAchieved(goal);
  const education = getMetricEducation(goal.metric);
  const metricName = education?.name || goal.metric;

  // Get border color based on status
  const getBorderColor = () => {
    switch (goal.status) {
      case GoalStatus.ACHIEVED:
        return 'border-green-200 bg-green-50';
      case GoalStatus.ACTIVE:
        return 'border-blue-200';
      case GoalStatus.MISSED:
        return 'border-red-200 bg-red-50';
      case GoalStatus.ABANDONED:
        return 'border-gray-200 bg-gray-50';
      default:
        return 'border-gray-200';
    }
  };

  // Get progress bar color based on progress and status
  const getProgressColor = () => {
    if (goal.status === GoalStatus.ACHIEVED) return 'bg-green-500';
    if (goal.status === GoalStatus.MISSED) return 'bg-red-500';
    if (goal.status === GoalStatus.ABANDONED) return 'bg-gray-400';
    if (progress >= 75) return 'bg-green-500';
    if (progress >= 50) return 'bg-blue-500';
    if (progress >= 25) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  // Get status badge
  const getStatusBadge = () => {
    const statusConfig = {
      [GoalStatus.ACTIVE]: { label: 'Active', variant: 'default' as const, className: 'bg-blue-100 text-blue-800' },
      [GoalStatus.ACHIEVED]: { label: 'Achieved', variant: 'default' as const, className: 'bg-green-100 text-green-800' },
      [GoalStatus.MISSED]: { label: 'Missed', variant: 'default' as const, className: 'bg-red-100 text-red-800' },
      [GoalStatus.ABANDONED]: { label: 'Abandoned', variant: 'default' as const, className: 'bg-gray-100 text-gray-800' },
    };
    const config = statusConfig[goal.status];
    return (
      <Badge
        data-testid="goal-status-badge"
        variant={config.variant}
        className={config.className}
      >
        {config.label}
      </Badge>
    );
  };

  // Format current value display
  const formatCurrentDisplay = () => {
    if (goal.goalType === GoalType.CONSISTENCY) {
      return String(goal.currentValue);
    }
    return formatMetricValue(goal.currentValue, goal.metric);
  };

  // Format days remaining text
  const getDaysRemainingText = () => {
    if (goal.status !== GoalStatus.ACTIVE) return null;

    if (daysRemaining > 0) {
      return `${daysRemaining} days remaining`;
    } else if (daysRemaining === 0) {
      return 'Due today!';
    } else {
      return `${Math.abs(daysRemaining)} days overdue`;
    }
  };

  // Format target date for display
  const formatTargetDate = () => {
    const date = new Date(goal.targetDate);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Card
      data-testid="goal-progress-card"
      className={cn(
        'transition-shadow hover:shadow-md',
        getBorderColor(),
        compact && 'compact'
      )}
      aria-label={`${metricName} goal progress card`}
    >
      <CardHeader className={cn('pb-2', compact && 'pb-1')}>
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-500" />
            <span>{metricName}</span>
          </div>
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>

      <CardContent className={cn('space-y-4', compact && 'space-y-2')}>
        {/* Target and Current Values */}
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-500">Target</p>
            <p data-testid="goal-target" className="text-xl font-bold text-gray-900">
              {formatGoalTarget(goal)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Current</p>
            <p data-testid="goal-current" className="text-xl font-bold text-blue-600">
              {formatCurrentDisplay()}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Progress</span>
            <span data-testid="goal-progress" className="font-medium">
              {progress}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Goal progress: ${progress}%`}
            className="h-3 w-full bg-gray-200 rounded-full overflow-hidden"
          >
            <div
              className={cn('h-full transition-all duration-500', getProgressColor())}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Target Date and Days Remaining */}
        <div className="flex justify-between items-center text-sm">
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="h-4 w-4" />
            <span data-testid="goal-target-date">Target: {formatTargetDate()}</span>
          </div>
          {goal.status === GoalStatus.ACTIVE && (
            <span
              data-testid="goal-days-remaining"
              className={cn(
                'font-medium',
                daysRemaining < 0 ? 'text-red-600' : daysRemaining <= 7 ? 'text-orange-600' : 'text-gray-600'
              )}
            >
              {getDaysRemainingText()}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        {!compact && (
          <div className="flex gap-2 pt-2">
            {/* Mark Complete Button - only show when goal is achieved but not yet marked */}
            {achieved && goal.status === GoalStatus.ACTIVE && onMarkComplete && (
              <Button
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={() => onMarkComplete(goal.id)}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Mark Complete
              </Button>
            )}

            {/* Abandon Button - only show for active goals */}
            {goal.status === GoalStatus.ACTIVE && onAbandon && (
              <Button
                size="sm"
                variant="outline"
                className="text-gray-600 hover:text-red-600 hover:border-red-300"
                onClick={() => onAbandon(goal.id)}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Abandon
              </Button>
            )}
          </div>
        )}

        {/* Achievement Celebration */}
        {goal.status === GoalStatus.ACHIEVED && (
          <div className="flex items-center gap-2 p-2 bg-green-100 rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">
              Goal achieved! 🎉
            </span>
          </div>
        )}

        {/* Overdue Warning */}
        {goal.status === GoalStatus.ACTIVE && daysRemaining < 0 && (
          <div className="flex items-center gap-2 p-2 bg-red-100 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="text-sm font-medium text-red-800">
              This goal is overdue - consider adjusting the target date
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
