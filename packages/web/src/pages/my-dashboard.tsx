/**
 * My Dashboard Page
 *
 * Displays the athlete's dynamic performance data:
 * - Welcome hero with streak tracking
 * - Metric progress cards with PRs integrated
 * - Goal tracking in main area
 * - Recent activity timeline (compact sidebar)
 * - Achievements (compact sidebar)
 * - Wellness status (compact sidebar)
 *
 * This page is for athletes viewing their own performance data.
 * Static info (name, contact) is on /my-profile.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useAthleteContext } from '@/hooks/useAthleteContext';
import { useAthleteDashboardData, type DashboardData } from '@/hooks/useAthleteDashboardData';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import { useAthleteWellnessStatus } from '@/hooks/useAthleteWellnessStatus';
import { useActiveGoals, GoalStatus, GoalType } from '@/hooks/useGoals';
import { useAvailableMetrics } from '@/hooks/use-available-metrics';
import { AthleteHomeHero } from '@/components/athlete/AthleteHomeHero';
import { RecentActivityTimeline } from '@/components/athlete/RecentActivityTimeline';
import { WellnessStatusCard } from '@/components/athlete/WellnessStatusCard';
import { PendingTasksBanner } from '@/components/athlete/PendingTasksBanner';
import { MetricProgressCard } from '@/components/athlete/MetricProgressCard';
import { AchievementsCard } from '@/components/athlete/AchievementsCard';
import { GoalProgressCard } from '@/components/athlete/GoalProgressCard';
import { PeerComparisonCard } from '@/components/athlete/PeerComparisonCard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, BarChart3, Target, ArrowRight } from 'lucide-react';
import { Redirect, Link } from 'wouter';
import { getMetricUnits } from '@/lib/metrics';
import type { Goal, SiteSettings, Organization } from '@shared/schema';

export default function MyDashboardPage() {
  const { user, isLoading: authLoading, organizationContext } = useAuth();
  const { athleteId, isLoading: contextLoading } = useAthleteContext();

  // Fetch dashboard data - include unverified for athlete's own view
  const { data: dashboardData, isLoading, isError, error } = useAthleteDashboardData(athleteId, {
    includeUnverified: true,
  });

  // Fetch athlete profile for hero component
  const { data: athlete } = useAthleteProfile(athleteId);

  // Fetch active goals count for summary card
  const { data: activeGoals = [] } = useActiveGoals();

  // Fetch available metrics to get isDerived and dependentMetrics info
  const { metrics: availableMetrics } = useAvailableMetrics();

  // Fetch site settings to check wellness module status (public endpoint for athletes)
  const { data: siteSettings } = useQuery<SiteSettings>({
    queryKey: ['/api/site-settings/public'],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch organization to check org-level wellness status
  const { data: organization } = useQuery<Organization>({
    queryKey: [`/api/organizations/${organizationContext}`],
    enabled: !!organizationContext,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Calculate wellness enabled status based on site and org settings
  const wellnessModuleEnabled = siteSettings?.wellnessModuleEnabled ?? true;
  const orgWellnessEnabled = organization?.wellnessEnabled ?? true;
  const isWellnessEnabled = wellnessModuleEnabled && orgWellnessEnabled;

  // Fetch athlete's wellness status for dashboard card
  const { data: wellnessData } = useAthleteWellnessStatus(isWellnessEnabled && !!user?.id);

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
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6">
      {/* Athlete Home Hero */}
      <AthleteHomeHero
        athlete={heroAthlete}
        measurementCount={dashboardData.measurementsThisMonth}
        lastMeasurementDate={dashboardData.lastMeasurementDate}
      />

      {/* Book Session CTA */}
      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
        <div>
          <p className="text-sm font-medium text-blue-900">Ready for your next session?</p>
          <p className="text-xs text-blue-700">Book with Coach John and keep the momentum going.</p>
        </div>
        <a
          href="https://bigtimeathletes.com/book"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
        >
          Book a Session <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Pending Tasks Banner - shows wellness questionnaires to complete */}
      {isWellnessEnabled && <PendingTasksBanner />}

      {/* Performance Metrics Grid (includes PRs) */}
      {dashboardData.availableMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dashboardData.availableMetrics.map((metric) => {
            const metricConfig = availableMetrics.find(m => m.code === metric);
            return (
              <MetricProgressCard
                key={metric}
                metric={metric}
                displayName={metricConfig?.label || metric}
                measurements={measurementsByMetric[metric] || []}
                units={getMetricUnits(metric)}
                personalRecord={dashboardData.personalRecords.find(pr => pr.metric === metric)}
                isDerived={metricConfig?.isDerived}
                dependentMetrics={metricConfig?.dependentMetrics}
              />
            );
          })}
        </div>
      )}

      {/* Recent Activity (full size) */}
      <RecentActivityTimeline activities={dashboardData.activityTimeline} />

      {/* Goals Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-600" />
            My Goals
          </h2>
          <Link href="/my-goals" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {activeGoals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeGoals.slice(0, 3).map((goal: Goal) => (
              <GoalProgressCard
                key={goal.id}
                goal={{
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
                }}
                compact
              />
            ))}
          </div>
        ) : (
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-6 text-center">
              <Target className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <h3 className="font-medium text-gray-900 mb-1">No Active Goals</h3>
              <p className="text-sm text-gray-500 mb-4">Set your first goal to track progress</p>
              <Link href="/my-goals">
                <Button variant="outline" size="sm">
                  Set a Goal
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Compact Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Peer Comparison (How You Compare) */}
        {user?.id && athleteId && (
          <PeerComparisonCard
            userId={user.id}
            athleteId={athleteId}
            availableMetrics={dashboardData.availableMetrics}
            compact
          />
        )}

        {/* Achievements (compact) */}
        {user?.id && organizationContext && (
          <AchievementsCard userId={user.id} organizationId={organizationContext} compact />
        )}

        {/* Wellness Status */}
        <WellnessStatusCard
          wellnessEnabled={isWellnessEnabled}
          wellnessData={wellnessData ?? null}
        />
      </div>
    </div>
  );
}
