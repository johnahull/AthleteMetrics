/**
 * NotificationPreferencesCard - User notification preference management
 *
 * Allows users to configure their push and email notification preferences:
 * - Enable/disable push notifications globally
 * - Toggle specific notification types (wellness, measurements, announcements)
 * - Configure quiet hours
 * - Manage devices
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Bell,
  BellOff,
  Smartphone,
  Trash2,
  Loader2,
  AlertCircle,
  Check,
  Mail,
  Heart,
  TrendingUp,
  Users,
  Clock,
  Moon,
  Send,
} from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  pushWellnessSurveys: boolean;
  pushWellnessDigest: boolean;
  pushNewMeasurements: boolean;
  pushTeamAnnouncements: boolean;
  emailWellnessSurveys: boolean;
  emailWellnessDigest: boolean;
  emailNewMeasurements: boolean;
  emailTeamAnnouncements: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursTimezone: string | null;
}

interface DeviceSubscription {
  id: string;
  endpoint: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export function NotificationPreferencesCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading: pushLoading,
    subscribe,
    unsubscribeById,
    sendTestNotification,
    subscriptions,
    refreshSubscriptions,
  } = usePushNotifications();

  // Fetch notification preferences
  const { data: preferences, isLoading: prefsLoading, isError } = useQuery<NotificationPreferences>({
    queryKey: ['/api/notifications/preferences'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/notifications/preferences');
      return response.json();
    },
  });

  // Update preferences mutation
  const updatePrefs = useMutation({
    mutationFn: async (updates: Partial<NotificationPreferences>) => {
      const response = await apiRequest('PUT', '/api/notifications/preferences', updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/preferences'] });
      toast({
        title: 'Preferences saved',
        description: 'Your notification preferences have been updated.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save preferences. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    await updatePrefs.mutateAsync({ [key]: value });
  };

  const handleEnableNotifications = async () => {
    setIsSaving(true);
    try {
      const success = await subscribe();
      if (success) {
        toast({
          title: 'Notifications enabled',
          description: 'You will now receive push notifications.',
        });
        refreshSubscriptions();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to enable notifications. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveDevice = async (subscriptionId: string) => {
    try {
      await unsubscribeById(subscriptionId);
      toast({
        title: 'Device removed',
        description: 'The device will no longer receive notifications.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove device. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleTestNotification = async () => {
    try {
      const success = await sendTestNotification();
      if (success) {
        toast({
          title: 'Test notification sent',
          description: 'Check your device for the test notification.',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send test notification.',
        variant: 'destructive',
      });
    }
  };

  if (prefsLoading || pushLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load notification preferences. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const prefs = preferences || {
    pushEnabled: true,
    emailEnabled: true,
    pushWellnessSurveys: true,
    pushWellnessDigest: true,
    pushNewMeasurements: true,
    pushTeamAnnouncements: true,
    emailWellnessSurveys: true,
    emailWellnessDigest: true,
    emailNewMeasurements: false,
    emailTeamAnnouncements: true,
    quietHoursEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    quietHoursTimezone: null,
  };

  return (
    <div className="space-y-6">
      {/* Push Notifications Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle>Push Notifications</CardTitle>
            </div>
            {isSubscribed && (
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" />
                Enabled
              </Badge>
            )}
          </div>
          <CardDescription>
            Receive instant updates on your devices
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isSupported ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Push notifications are not supported in this browser. Try using Chrome, Firefox, or Edge.
              </AlertDescription>
            </Alert>
          ) : permission === 'denied' ? (
            <Alert variant="destructive">
              <BellOff className="h-4 w-4" />
              <AlertDescription>
                Notifications are blocked. To enable them, click the lock icon in your browser's address bar and allow notifications.
              </AlertDescription>
            </Alert>
          ) : !isSubscribed ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-medium">Enable Push Notifications</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Get instant alerts for wellness surveys, new measurements, and team updates
                </p>
              </div>
              <Button onClick={handleEnableNotifications} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enabling...
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4 mr-2" />
                    Enable Notifications
                  </>
                )}
              </Button>
            </div>
          ) : (
            <>
              {/* Master Push Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="push-enabled">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive push notifications on this device
                  </p>
                </div>
                <Switch
                  id="push-enabled"
                  checked={prefs.pushEnabled}
                  onCheckedChange={(checked) => handleToggle('pushEnabled', checked)}
                />
              </div>

              <Separator />

              {/* Notification Types */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Notification Types</h4>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Heart className="h-4 w-4 text-red-500" />
                      <div>
                        <Label>Wellness Surveys</Label>
                        <p className="text-xs text-muted-foreground">New wellness check requests</p>
                      </div>
                    </div>
                    <Switch
                      checked={prefs.pushWellnessSurveys}
                      onCheckedChange={(checked) => handleToggle('pushWellnessSurveys', checked)}
                      disabled={!prefs.pushEnabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-orange-500" />
                      <div>
                        <Label>Wellness Digest</Label>
                        <p className="text-xs text-muted-foreground">Daily wellness summary</p>
                      </div>
                    </div>
                    <Switch
                      checked={prefs.pushWellnessDigest}
                      onCheckedChange={(checked) => handleToggle('pushWellnessDigest', checked)}
                      disabled={!prefs.pushEnabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <div>
                        <Label>New Measurements</Label>
                        <p className="text-xs text-muted-foreground">When new data is recorded</p>
                      </div>
                    </div>
                    <Switch
                      checked={prefs.pushNewMeasurements}
                      onCheckedChange={(checked) => handleToggle('pushNewMeasurements', checked)}
                      disabled={!prefs.pushEnabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4 text-blue-500" />
                      <div>
                        <Label>Team Announcements</Label>
                        <p className="text-xs text-muted-foreground">Messages from coaches</p>
                      </div>
                    </div>
                    <Switch
                      checked={prefs.pushTeamAnnouncements}
                      onCheckedChange={(checked) => handleToggle('pushTeamAnnouncements', checked)}
                      disabled={!prefs.pushEnabled}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Devices */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Registered Devices</h4>
                  <Button variant="outline" size="sm" onClick={handleTestNotification}>
                    <Send className="h-3 w-3 mr-2" />
                    Test
                  </Button>
                </div>

                {subscriptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No devices registered</p>
                ) : (
                  <div className="space-y-2">
                    {subscriptions.map((device) => (
                      <div
                        key={device.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Smartphone className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">
                              {device.deviceName || 'Unknown Device'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Added {new Date(device.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveDevice(device.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Email Notifications Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle>Email Notifications</CardTitle>
          </div>
          <CardDescription>
            Receive updates via email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master Email Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-enabled">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive notification emails
              </p>
            </div>
            <Switch
              id="email-enabled"
              checked={prefs.emailEnabled}
              onCheckedChange={(checked) => handleToggle('emailEnabled', checked)}
            />
          </div>

          <Separator />

          {/* Email Types */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Email Types</h4>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Heart className="h-4 w-4 text-red-500" />
                  <div>
                    <Label>Wellness Surveys</Label>
                    <p className="text-xs text-muted-foreground">New wellness check requests</p>
                  </div>
                </div>
                <Switch
                  checked={prefs.emailWellnessSurveys}
                  onCheckedChange={(checked) => handleToggle('emailWellnessSurveys', checked)}
                  disabled={!prefs.emailEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <div>
                    <Label>Wellness Digest</Label>
                    <p className="text-xs text-muted-foreground">Daily wellness summary</p>
                  </div>
                </div>
                <Switch
                  checked={prefs.emailWellnessDigest}
                  onCheckedChange={(checked) => handleToggle('emailWellnessDigest', checked)}
                  disabled={!prefs.emailEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <div>
                    <Label>New Measurements</Label>
                    <p className="text-xs text-muted-foreground">When new data is recorded</p>
                  </div>
                </div>
                <Switch
                  checked={prefs.emailNewMeasurements}
                  onCheckedChange={(checked) => handleToggle('emailNewMeasurements', checked)}
                  disabled={!prefs.emailEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-blue-500" />
                  <div>
                    <Label>Team Announcements</Label>
                    <p className="text-xs text-muted-foreground">Messages from coaches</p>
                  </div>
                </div>
                <Switch
                  checked={prefs.emailTeamAnnouncements}
                  onCheckedChange={(checked) => handleToggle('emailTeamAnnouncements', checked)}
                  disabled={!prefs.emailEnabled}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Moon className="h-5 w-5 text-primary" />
            <CardTitle>Quiet Hours</CardTitle>
          </div>
          <CardDescription>
            Pause notifications during specific times
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="quiet-hours">Enable Quiet Hours</Label>
              <p className="text-sm text-muted-foreground">
                Mute notifications during set times
              </p>
            </div>
            <Switch
              id="quiet-hours"
              checked={prefs.quietHoursEnabled}
              onCheckedChange={(checked) => handleToggle('quietHoursEnabled', checked)}
            />
          </div>

          {prefs.quietHoursEnabled && (
            <div className="grid gap-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quiet-start">Start Time</Label>
                  <Input
                    id="quiet-start"
                    type="time"
                    value={prefs.quietHoursStart || '22:00'}
                    onChange={(e) =>
                      updatePrefs.mutate({ quietHoursStart: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quiet-end">End Time</Label>
                  <Input
                    id="quiet-end"
                    type="time"
                    value={prefs.quietHoursEnd || '07:00'}
                    onChange={(e) =>
                      updatePrefs.mutate({ quietHoursEnd: e.target.value })
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Notifications received during quiet hours will be delivered after they end.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default NotificationPreferencesCard;
