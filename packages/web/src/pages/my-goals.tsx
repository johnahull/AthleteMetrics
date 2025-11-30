/**
 * My Goals Page
 *
 * Dedicated page for athlete goal management:
 * - View active and completed goals
 * - Create new goals with wizard
 * - Track goal progress
 *
 * This page is for athletes managing their personal goals.
 */

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useAthleteDashboardData } from '@/hooks/useAthleteDashboardData';
import { useAthleteContext } from '@/hooks/useAthleteContext';
import { useActiveGoals, useGoals, useUpdateGoalStatus, useCreateGoal, GoalStatus, GoalType } from '@/hooks/useGoals';
import { GoalProgressCard } from '@/components/athlete/GoalProgressCard';
import { GoalCreationWizard } from '@/components/athlete/GoalCreationWizard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, AlertCircle, Target, Plus, Trophy, Archive } from 'lucide-react';
import { Redirect, Link } from 'wouter';
import type { Goal } from '@shared/schema';

/**
 * Adapt Goal from API response to GoalProgressCard expected type
 */
function adaptGoalForDisplay(goal: Goal) {
  return {
    id: goal.id,
    userId: goal.userId,
    metric: goal.metric,
    goalType: goal.goalType as unknown as GoalType,
    status: goal.status as unknown as GoalStatus,
    targetValue: typeof goal.targetValue === 'string' ? parseFloat(goal.targetValue) : Number(goal.targetValue),
    baselineValue: typeof goal.baselineValue === 'string' ? parseFloat(goal.baselineValue) : Number(goal.baselineValue),
    currentValue: typeof goal.currentValue === 'string' ? parseFloat(goal.currentValue) : Number(goal.currentValue),
    targetDate: goal.targetDate,
    createdAt: typeof goal.createdAt === 'string' ? goal.createdAt : goal.createdAt.toISOString(),
    achievedAt: goal.achievedAt ? (typeof goal.achievedAt === 'string' ? goal.achievedAt : goal.achievedAt.toISOString()) : undefined,
    notes: goal.notes ?? undefined,
  };
}

export default function MyGoalsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { athleteId, isLoading: contextLoading } = useAthleteContext();
  const [showGoalWizard, setShowGoalWizard] = useState(false);

  // Fetch dashboard data for measurements (needed for goal wizard)
  const { data: dashboardData, isLoading: dashboardLoading } = useAthleteDashboardData(athleteId);

  // Fetch goals
  const { data: activeGoals = [], isLoading: activeLoading } = useActiveGoals();
  const { data: allGoals = [], isLoading: allLoading } = useGoals();
  const updateGoalStatus = useUpdateGoalStatus();
  const createGoal = useCreateGoal();

  // Filter completed/archived goals
  const completedGoals = allGoals.filter(
    (g: Goal) => g.status === GoalStatus.ACHIEVED || g.status === GoalStatus.MISSED || g.status === GoalStatus.ABANDONED
  );

  // Handle marking a goal as complete
  const handleMarkComplete = (goalId: string) => {
    updateGoalStatus.mutate({ goalId, status: GoalStatus.ACHIEVED });
  };

  // Handle abandoning a goal
  const handleAbandon = (goalId: string) => {
    updateGoalStatus.mutate({ goalId, status: GoalStatus.ABANDONED });
  };

  // Handle creating a new goal
  const handleCreateGoal = async (goalData: {
    metric: string;
    goalType: string;
    targetValue: number;
    targetDate: string;
    baselineValue: number;
  }) => {
    await createGoal.mutateAsync({
      metric: goalData.metric,
      goalType: goalData.goalType as typeof GoalType[keyof typeof GoalType],
      targetValue: goalData.targetValue,
      baselineValue: goalData.baselineValue,
      targetDate: goalData.targetDate,
    });
    setShowGoalWizard(false);
  };

  // Redirect if not logged in
  if (!authLoading && !user) {
    return <Redirect to="/login" />;
  }

  // Redirect if not an athlete
  if (!authLoading && user && !user.athleteId) {
    return <Redirect to="/dashboard" />;
  }

  // Loading state
  const isLoading = authLoading || contextLoading || dashboardLoading || activeLoading || allLoading;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading your goals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Goals</h1>
          <p className="text-sm sm:text-base text-gray-500 mt-1">Track your progress and stay motivated</p>
        </div>
        <Button
          onClick={() => setShowGoalWizard(true)}
          className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          Set New Goal
        </Button>
      </div>

      {/* Goals Tabs */}
      <Tabs defaultValue="active" className="w-full">
        <TabsList>
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Active ({activeGoals.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Completed ({completedGoals.length})
          </TabsTrigger>
        </TabsList>

        {/* Active Goals Tab */}
        <TabsContent value="active" className="mt-6">
          {activeGoals.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeGoals.map((goal: Goal) => (
                <GoalProgressCard
                  key={goal.id}
                  goal={adaptGoalForDisplay(goal)}
                  onMarkComplete={handleMarkComplete}
                  onAbandon={handleAbandon}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
              <Target className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Goals</h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Set personal performance goals to track your progress and stay motivated.
              </p>
              <Button
                onClick={() => setShowGoalWizard(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Set Your First Goal
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Completed Goals Tab */}
        <TabsContent value="completed" className="mt-6">
          {completedGoals.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {completedGoals.map((goal: Goal) => (
                <GoalProgressCard
                  key={goal.id}
                  goal={adaptGoalForDisplay(goal)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
              <Archive className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Completed Goals Yet</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                When you achieve or complete goals, they'll appear here.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Back to Dashboard Link */}
      <div className="pt-4 border-t border-gray-200">
        <Link href="/my-dashboard" className="text-blue-600 hover:underline text-sm">
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Goal Creation Wizard Modal */}
      <Dialog open={showGoalWizard} onOpenChange={setShowGoalWizard}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <DialogTitle className="sr-only">Create New Goal</DialogTitle>
          <GoalCreationWizard
            measurements={dashboardData?.measurements || []}
            availableMetrics={dashboardData?.availableMetrics || []}
            onCreateGoal={handleCreateGoal}
            onCancel={() => setShowGoalWizard(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
