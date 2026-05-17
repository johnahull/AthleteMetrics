/**
 * Unified Dashboard Page
 *
 * Displays aggregated performance data across all linked organization accounts.
 * Athletes who are members of multiple organizations can view their combined
 * measurements in a single timeline.
 */

import { useAuth } from '@/lib/auth';
import { useUnifiedDashboard, useUnifiedMeasurements, useGlobalAthleteProfile } from '@/hooks/useGlobalAthlete';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OrgBadge, MultiOrgBadge } from '@/components/athlete/OrgBadge';
import { Loader2, AlertCircle, Link2, Building2, BarChart3, Shield, ArrowRight } from 'lucide-react';
import { Redirect, Link } from 'wouter';
import { getMetricUnits } from '@/lib/metrics';
import { useMetricLabels } from '@/hooks/use-metric-labels';
import { formatDistanceToNow } from 'date-fns';

export default function UnifiedDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading, error: profileError } = useGlobalAthleteProfile();
  const { data: dashboard, isLoading: dashboardLoading } = useUnifiedDashboard();
  const { data: measurements, isLoading: measurementsLoading } = useUnifiedMeasurements();
  const { getLabel: getMetricLabel } = useMetricLabels();

  // Redirect if not logged in
  if (!authLoading && !user) {
    return <Redirect to="/login" />;
  }

  // Loading state
  if (authLoading || profileLoading || dashboardLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading unified dashboard...</p>
        </div>
      </div>
    );
  }

  // No global athlete profile
  if (!profile?.hasGlobalAthlete) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Cross-Organization Identity
            </CardTitle>
            <CardDescription>
              Link your accounts across organizations to view all your measurements in one place.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Linked Accounts</h3>
              <p className="text-muted-foreground mb-4">
                Your global athlete identity will be created automatically when you verify your email address.
                Once verified, accounts with the same email will be linked together.
              </p>
              <Link href="/my-profile">
                <Button variant="outline">
                  Go to My Profile
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { globalAthlete, linkedAccountCount, organizations } = dashboard || {};
  const recentMeasurements = dashboard?.recentMeasurements || [];
  const metricStats = dashboard?.metricStats || {};

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Link2 className="h-6 w-6" />
            Unified Dashboard
          </h1>
          <p className="text-muted-foreground">
            Your performance data across all organizations
          </p>
        </div>
        <Link href="/my-global-profile">
          <Button variant="outline" size="sm">
            <Shield className="mr-2 h-4 w-4" />
            Manage Privacy
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Linked Accounts Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Linked Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{linkedAccountCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              across {organizations?.length || 0} organization{(organizations?.length || 0) !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        {/* Total Measurements Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Measurements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{measurements?.totalCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              unified across organizations
            </p>
          </CardContent>
        </Card>

        {/* Metrics Tracked Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Metrics Tracked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(metricStats).length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              different performance metrics
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Organizations */}
      {organizations && organizations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Your Organizations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {organizations.map((org) => (
                <OrgBadge key={org.id} organizationName={org.name} size="md" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metric Summary */}
      {Object.keys(metricStats).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Performance Summary
            </CardTitle>
            <CardDescription>
              Latest values for each tracked metric
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(metricStats).map(([metric, stats]) => (
                <div
                  key={metric}
                  className="p-4 rounded-lg border bg-card text-card-foreground"
                >
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    {getMetricLabel(metric)}
                  </div>
                  <div className="text-xl font-bold">
                    {stats.latest?.value || 'N/A'}
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      {stats.latest?.units || getMetricUnits(metric)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {stats.count} measurement{stats.count !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Measurements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Measurements</CardTitle>
          <CardDescription>
            Your latest performance data from all organizations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentMeasurements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No measurements found across your linked accounts.
            </div>
          ) : (
            <div className="space-y-3">
              {recentMeasurements.map((m: any) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {getMetricLabel(m.metric)}
                      </span>
                      {m.organizationName && (
                        <OrgBadge organizationName={m.organizationName} />
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(m.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">
                      {m.value}
                      <span className="text-sm font-normal text-muted-foreground ml-1">
                        {m.units}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Privacy Notice */}
      <div className="text-center text-sm text-muted-foreground">
        <Shield className="inline h-4 w-4 mr-1" />
        Your data is shared across organizations based on your privacy settings.
        <Link href="/my-global-profile" className="text-primary hover:underline ml-1">
          Manage settings
        </Link>
      </div>
    </div>
  );
}
