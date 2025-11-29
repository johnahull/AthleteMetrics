/**
 * My Dashboard Page
 *
 * Displays the athlete's dynamic performance data:
 * - Welcome hero with streak tracking
 * - Personal records with celebrations
 * - Recent activity timeline with insights
 * - Wellness status (if enabled)
 * - Metric progress charts
 * - Goal tracking
 *
 * This page is for athletes viewing their own performance data.
 * Static info (name, contact) is on /my-profile.
 */

import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useAthleteContext } from '@/hooks/useAthleteContext';
import { useAthleteDashboardData, type DashboardData } from '@/hooks/useAthleteDashboardData';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import { useActiveGoals, useUpdateGoalStatus, useCreateGoal, GoalStatus, GoalType } from '@/hooks/useGoals';
import { AthleteHomeHero } from '@/components/athlete/AthleteHomeHero';
import { PersonalRecordsCard } from '@/components/athlete/PersonalRecordsCard';
import { RecentActivityTimeline } from '@/components/athlete/RecentActivityTimeline';
import { WellnessStatusCard } from '@/components/athlete/WellnessStatusCard';
import { MetricProgressCard } from '@/components/athlete/MetricProgressCard';
import { GoalProgressCard } from '@/components/athlete/GoalProgressCard';
import { GoalCreationWizard } from '@/components/athlete/GoalCreationWizard';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, BarChart3, Target, Plus } from 'lucide-react';
import { Redirect } from 'wouter';
import { getMetricDisplayName, getMetricUnits } from '@/lib/metrics';
import type { Goal } from '@shared/schema';

export default function MyDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { athleteId, isLoading: contextLoading } = useAthleteContext();
  const [showGoalWizard, setShowGoalWizard] = useState(false);

  // Fetch dashboard data
  const { data: dashboardData, isLoading, isError, error } = useAthleteDashboardData(athleteId);

  // Fetch athlete profile for hero component
  const { data: athlete } = useAthleteProfile(athleteId);

  // Fetch active goals
  const { data: activeGoals = [], isLoading: goalsLoading } = useActiveGoals();
  const updateGoalStatus = useUpdateGoalStatus();
  const createGoal = useCreateGoal();

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

  // Note: Measurements are already grouped by useAthleteDashboardData hook internally
  // This local grouping is kept for the MetricProgressCard component which expects grouped data
  const measurementsByMetric = useMemo(() => {
    if (!dashboardData?.measurements) return {} as Record<string, DashboardData['measurements']>;
    const grouped: Record<string, DashboardData['measurements']> = {};
    dashboardData.measurements.forEach((m) => {
      if (!grouped[m.metric]) {
        grouped[m.metric] = [];
      }
      grouped[m.metric].push(m);
    });
    return grouped;
  }, [dashboardData?.measurements]);

  // Redirect if not logged in
  if (!authLoading && !user) {
    return <Redirect to="/login" />;
  }

  // Redirect if not an athlete
  if (!authLoading && user && !user.athleteId) {
    return <Redirect to="/dashboard" />;
  }

  // Loading state
  if (authLoading || contextLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Dashboard</h2>
          <p className="text-gray-500 mb-4">
            {error?.message || 'Unable to load your performance data'}
          </p>
        </div>
      </div>
    );
  }

  // Default athlete data for hero when athlete is still loading
  // Construct fullName from firstName + lastName since EnhancedUser doesn't have fullName
  const heroAthlete = athlete ? {
    id: athlete.id,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    fullName: athlete.fullName,
  } : {
    id: athleteId || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    fullName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Athlete',
  };

  // Empty state
  if (!dashboardData || dashboardData.measurements.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <AthleteHomeHero
          athlete={heroAthlete}
          measurementCount={0}
          lastMeasurementDate={null}
        />

        {/* Empty state message */}
        <div className="mt-8 text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Measurements Yet</h2>
          <p className="text-gray-500 max-w-md mx-auto">
            Once your coach records some measurements, you'll see your performance data,
            progress charts, and personal records here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Athlete Home Hero */}
      <AthleteHomeHero
        athlete={heroAthlete}
        measurementCount={dashboardData.measurementsThisMonth}
        lastMeasurementDate={dashboardData.lastMeasurementDate}
      />

      {/* Personal Records */}
      <div>
        <PersonalRecordsCard personalRecords={dashboardData.personalRecords} />
      </div>

      {/* Activity & Wellness Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity Timeline */}
        <div className="lg:col-span-2">
          <RecentActivityTimeline activities={dashboardData.activityTimeline} />
        </div>

        {/* Wellness Status */}
        <div>
          <WellnessStatusCard
            wellnessEnabled={false} // TODO: Get from organization settings
            wellnessData={null}
          />
        </div>
      </div>

      {/* Metric Progress Cards */}
      {dashboardData.availableMetrics.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Performance Progress</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboardData.availableMetrics.map((metric) => (
              <MetricProgressCard
                key={metric}
                metric={metric}
                displayName={getMetricDisplayName(metric)}
                measurements={measurementsByMetric[metric] || []}
                units={getMetricUnits(metric)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Goals Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">My Goals</h2>
          <Button
            onClick={() => setShowGoalWizard(true)}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            Set New Goal
          </Button>
        </div>

        {goalsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : activeGoals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeGoals.map((goal: Goal) => (
              <GoalProgressCard
                key={goal.id}
                goal={{
                  ...goal,
                  // Convert decimal strings from DB to numbers for the component
                  targetValue: typeof goal.targetValue === 'string' ? parseFloat(goal.targetValue) : goal.targetValue,
                  baselineValue: typeof goal.baselineValue === 'string' ? parseFloat(goal.baselineValue) : goal.baselineValue,
                  currentValue: typeof goal.currentValue === 'string' ? parseFloat(goal.currentValue) : goal.currentValue,
                }}
                onMarkComplete={handleMarkComplete}
                onAbandon={handleAbandon}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-white rounded-lg shadow-sm border border-gray-200">
            <Target className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No Active Goals</h3>
            <p className="text-gray-500 mb-4 max-w-md mx-auto">
              Set personal performance goals to track your progress and stay motivated.
            </p>
            <Button
              onClick={() => setShowGoalWizard(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-1" />
              Set Your First Goal
            </Button>
          </div>
        )}
      </div>

      {/* Goal Creation Wizard Modal */}
      {showGoalWizard && (
        <GoalCreationWizard
          measurements={dashboardData?.measurements || []}
          availableMetrics={dashboardData?.availableMetrics || []}
          onCreateGoal={handleCreateGoal}
          onCancel={() => setShowGoalWizard(false)}
        />
      )}
    </div>
  );
}
