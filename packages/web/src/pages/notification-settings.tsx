/**
 * User Notification Settings Page
 *
 * Allows users to manage their notification preferences:
 * - Push notification toggles
 * - Email notification toggles
 * - Quiet hours configuration
 * - Device management
 */

import { useAuth } from '@/lib/auth';
import { NotificationPreferencesCard } from '@/components/notifications/notification-preferences-card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Bell, Loader2 } from 'lucide-react';
import { Link, Redirect } from 'wouter';

export default function NotificationSettingsPage() {
  const { user, isLoading } = useAuth();

  // Redirect if not logged in
  if (!isLoading && !user) {
    return <Redirect to="/login" />;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/my-profile">
          <Button variant="ghost" size="sm" className="gap-2 mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Profile
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notification Settings</h1>
            <p className="text-muted-foreground">
              Manage how and when you receive notifications
            </p>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <NotificationPreferencesCard />
    </div>
  );
}
