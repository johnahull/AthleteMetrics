/**
 * My Profile Page
 *
 * Displays the athlete's static profile information:
 * - Header with name, birth year, gender, teams, sports
 * - Contact information (emails, phones)
 *
 * This page is for athletes viewing their own profile.
 * Dynamic data (measurements, progress, goals) is on /my-dashboard.
 */

import { useAuth } from '@/lib/auth';
import { useAthleteContext } from '@/hooks/useAthleteContext';
import { useAthleteProfileComplete } from '@/hooks/useAthleteProfile';
import { usePeerComparisonStatus, useUpdatePeerComparisonStatus } from '@/hooks/usePeerComparison';
import { AthleteHeader } from '@/components/athlete/profile/AthleteHeader';
import { ContactInfoCard } from '@/components/athlete/profile/ContactInfoCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, User, Shield, Users, Bell, ChevronRight } from 'lucide-react';
import { Redirect, Link } from 'wouter';

export default function MyProfilePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { athleteId, isOwnProfile, canView, isLoading: contextLoading } = useAthleteContext();

  // Fetch athlete profile data
  const { athlete, teams, isLoading, isError, error } = useAthleteProfileComplete(athleteId);

  // Fetch peer comparison status
  const { data: peerStatus, isLoading: peerStatusLoading } = usePeerComparisonStatus(user?.id);
  const updatePeerStatus = useUpdatePeerComparisonStatus();

  // Handle peer comparison toggle
  const handlePeerComparisonToggle = (optIn: boolean) => {
    if (user?.id) {
      updatePeerStatus.mutate({ userId: user.id, optIn });
    }
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
  if (authLoading || contextLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading profile...</p>
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Profile</h2>
          <p className="text-gray-500 mb-4">
            {error?.message || 'Unable to load your profile'}
          </p>
        </div>
      </div>
    );
  }

  // Not found state
  if (!athlete) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <User className="h-8 w-8 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Profile Not Found</h2>
          <p className="text-gray-500">
            Unable to find your athlete profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-gray-500 mt-1">
          Your personal information and contact details
        </p>
      </div>

      {/* Athlete Header */}
      <AthleteHeader athlete={athlete} teams={teams} />

      {/* Contact Information */}
      <ContactInfoCard
        emails={athlete.emails}
        phones={athlete.phoneNumbers ?? undefined}
        school={athlete.school}
      />

      {/* Additional Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Username */}
            {user?.username && (
              <div>
                <p className="text-sm text-gray-500">Username</p>
                <p className="font-medium text-gray-900">{user.username}</p>
              </div>
            )}

            {/* Email */}
            {user?.email && (
              <div>
                <p className="text-sm text-gray-500">Login Email</p>
                <p className="font-medium text-gray-900">{user.email}</p>
              </div>
            )}
          </div>

          {/* Role Badge */}
          <div>
            <p className="text-sm text-gray-500 mb-2">Account Type</p>
            <Badge variant="secondary" className="bg-blue-50 text-blue-700">
              Athlete
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Peer Comparisons Display Preference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Peer Comparisons
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="peer-comparison-toggle" className="font-medium">
                Show peer comparisons
              </Label>
              <p className="text-sm text-muted-foreground">
                See how your performance ranks among similar athletes
              </p>
            </div>
            <Switch
              id="peer-comparison-toggle"
              checked={peerStatus?.optedIn ?? true}
              onCheckedChange={handlePeerComparisonToggle}
              disabled={peerStatusLoading || updatePeerStatus.isPending}
              aria-label="Toggle peer comparisons visibility"
            />
          </div>

          <Alert className="bg-blue-50 border-blue-200">
            <Shield className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              All measurements contribute to anonymous peer statistics.
              This toggle only controls whether you see comparison results.
            </AlertDescription>
          </Alert>

          {peerStatus?.optedIn && (
            <p className="text-sm text-green-600">
              ✓ Comparisons visible on your dashboard and{' '}
              <Link href="/my-peer-comparison" className="underline hover:text-green-700">
                Peer Comparison page
              </Link>
            </p>
          )}

          {!peerStatus?.optedIn && (
            <p className="text-sm text-gray-500">
              Peer comparison charts are hidden from your dashboard
            </p>
          )}
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card className="hover:bg-muted/50 transition-colors">
        <Link href="/notification-settings">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Notification Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Manage push notifications and email preferences
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Link>
      </Card>

      {/* Tips Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Visit your{' '}
            <Link href="/my-dashboard" className="underline hover:text-blue-900">
              Dashboard
            </Link>{' '}
            to view your measurements, track progress, and set goals.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
