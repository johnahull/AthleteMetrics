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

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { useAthleteContext } from '@/hooks/useAthleteContext';
import { useAthleteDashboardData, type DashboardData } from '@/hooks/useAthleteDashboardData';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import { AthleteHomeHero } from '@/components/athlete/AthleteHomeHero';
import { PersonalRecordsCard } from '@/components/athlete/PersonalRecordsCard';
import { RecentActivityTimeline } from '@/components/athlete/RecentActivityTimeline';
import { WellnessStatusCard } from '@/components/athlete/WellnessStatusCard';
import { MetricProgressCard } from '@/components/athlete/MetricProgressCard';
import { Loader2, AlertCircle, BarChart3 } from 'lucide-react';
import { Redirect } from 'wouter';
import { getMetricDisplayName, getMetricUnits } from '@/lib/metrics';

export default function MyDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { athleteId, isLoading: contextLoading } = useAthleteContext();

  // Fetch dashboard data
  const { data: dashboardData, isLoading, isError, error } = useAthleteDashboardData(athleteId);

  // Fetch athlete profile for hero component
  const { data: athlete } = useAthleteProfile(athleteId);

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

      {/* Goals Section (placeholder for future implementation) */}
      {/* TODO: Integrate GoalProgressCard and GoalCreationWizard
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">My Goals</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map(goal => (
            <GoalProgressCard key={goal.id} goal={goal} />
          ))}
        </div>
      </div>
      */}
    </div>
  );
}
