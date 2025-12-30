/**
 * AdminNotificationSettingsCard - Site admin notification settings management
 *
 * Allows site admins to configure global notification settings:
 * - Global kill switch for push notifications
 * - Default org settings for new organizations
 * - Platform-wide notification analytics
 * - Emergency broadcast capability
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Bell,
  BellRing,
  Loader2,
  AlertCircle,
  Check,
  TrendingUp,
  Users,
  Building2,
  Megaphone,
  BarChart3,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface SiteNotificationSettings {
  pushNotificationsEnabled: boolean;
  pushDefaultOrgSettings: {
    pushEnabled?: boolean;
    wellnessSurveysEnabled?: boolean;
    wellnessDigestEnabled?: boolean;
    newMeasurementsEnabled?: boolean;
    teamAnnouncementsEnabled?: boolean;
  } | null;
}

interface NotificationAnalytics {
  summary: {
    totalSubscriptions: number;
    usersWithPreferences: number;
    orgsWithCustomSettings: number;
  };
  last30Days: {
    notificationsByStatus: Record<string, number>;
    notificationsByType: Record<string, number>;
    totalDelivered: number;
    totalFailed: number;
    clickThroughRate: number;
  };
  recentNotifications: Array<{
    id: string;
    type: string;
    title: string;
    sentAt: string;
    deliveryStatus: string;
  }>;
}

export function AdminNotificationSettingsCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Fetch site notification settings
  const { data: settings, isLoading: settingsLoading, isError: settingsError } = useQuery<SiteNotificationSettings>({
    queryKey: ['/api/admin/notifications/settings'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/notifications/settings');
      return response.json();
    },
  });

  // Fetch notification analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery<NotificationAnalytics>({
    queryKey: ['/api/admin/notifications/analytics'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/notifications/analytics');
      return response.json();
    },
  });

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<SiteNotificationSettings>) => {
      const response = await apiRequest('PUT', '/api/admin/notifications/settings', updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notifications/settings'] });
      toast({
        title: 'Settings saved',
        description: 'Global notification settings have been updated.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Broadcast mutation
  const broadcastMutation = useMutation({
    mutationFn: async (data: { title: string; body: string; urgent: boolean }) => {
      const response = await apiRequest('POST', '/api/admin/notifications/broadcast', data);
      return response.json();
    },
    onSuccess: (data) => {
      setBroadcastOpen(false);
      setBroadcastTitle('');
      setBroadcastBody('');
      toast({
        title: 'Broadcast sent',
        description: `Sent to ${data.results.successful} users. ${data.results.failed} failed.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notifications/analytics'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to send broadcast. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter both title and message.',
        variant: 'destructive',
      });
      return;
    }

    setIsBroadcasting(true);
    try {
      await broadcastMutation.mutateAsync({
        title: broadcastTitle,
        body: broadcastBody,
        urgent: true,
      });
    } finally {
      setIsBroadcasting(false);
    }
  };

  if (settingsLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (settingsError) {
    return (
      <Card>
        <CardContent className="py-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load notification settings. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const siteSettings = settings || {
    pushNotificationsEnabled: true,
    pushDefaultOrgSettings: null,
  };

  return (
    <div className="space-y-6">
      {/* Global Control */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle>Global Push Notifications</CardTitle>
            </div>
            {siteSettings.pushNotificationsEnabled ? (
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" />
                Enabled
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Disabled
              </Badge>
            )}
          </div>
          <CardDescription>
            Control push notifications across the entire platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="global-push">Enable Push Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Master kill switch for all push notifications platform-wide
              </p>
            </div>
            <Switch
              id="global-push"
              checked={siteSettings.pushNotificationsEnabled}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ pushNotificationsEnabled: checked })
              }
            />
          </div>

          {!siteSettings.pushNotificationsEnabled && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Push notifications are disabled globally. No users will receive push notifications until this is re-enabled.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Analytics */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle>Notification Analytics</CardTitle>
          </div>
          <CardDescription>
            Platform-wide notification statistics (last 30 days)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analyticsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : analytics ? (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-2xl font-bold text-primary">
                    {analytics.summary.totalSubscriptions}
                  </div>
                  <p className="text-sm text-muted-foreground">Total Subscriptions</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {analytics.last30Days.totalDelivered}
                  </div>
                  <p className="text-sm text-muted-foreground">Delivered</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {analytics.last30Days.clickThroughRate}%
                  </div>
                  <p className="text-sm text-muted-foreground">Click Rate</p>
                </div>
              </div>

              <Separator />

              {/* By Type */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Notifications by Type</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm">Wellness Surveys</span>
                    <Badge variant="secondary">
                      {analytics.last30Days.notificationsByType.wellness_survey || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm">Wellness Digest</span>
                    <Badge variant="secondary">
                      {analytics.last30Days.notificationsByType.wellness_digest || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm">Measurements</span>
                    <Badge variant="secondary">
                      {analytics.last30Days.notificationsByType.new_measurement || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm">Announcements</span>
                    <Badge variant="secondary">
                      {analytics.last30Days.notificationsByType.team_announcement || 0}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Recent Notifications */}
              {analytics.recentNotifications.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Recent Notifications</h4>
                    <div className="space-y-2">
                      {analytics.recentNotifications.slice(0, 5).map((notif) => (
                        <div
                          key={notif.id}
                          className="flex items-center justify-between p-2 bg-muted/50 rounded"
                        >
                          <div>
                            <p className="text-sm font-medium">{notif.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(notif.sentAt).toLocaleString()}
                            </p>
                          </div>
                          <Badge
                            variant={
                              notif.deliveryStatus === 'delivered'
                                ? 'secondary'
                                : notif.deliveryStatus === 'failed'
                                ? 'destructive'
                                : 'outline'
                            }
                          >
                            {notif.deliveryStatus}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No analytics data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Emergency Broadcast */}
      <Card className="border-orange-200 dark:border-orange-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-orange-500" />
            <CardTitle>Emergency Broadcast</CardTitle>
          </div>
          <CardDescription>
            Send an urgent notification to all users with push enabled
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <BellRing className="h-4 w-4 mr-2" />
                Send Broadcast
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send Emergency Broadcast</DialogTitle>
                <DialogDescription>
                  This will send a push notification to all users who have enabled notifications.
                  Use sparingly for important announcements only.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="broadcast-title">Title</Label>
                  <Input
                    id="broadcast-title"
                    placeholder="Important Announcement"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="broadcast-body">Message</Label>
                  <Textarea
                    id="broadcast-body"
                    placeholder="Enter your message here..."
                    value={broadcastBody}
                    onChange={(e) => setBroadcastBody(e.target.value)}
                    maxLength={500}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    {broadcastBody.length}/500 characters
                  </p>
                </div>
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This action is rate-limited to 5 broadcasts per hour.
                  </AlertDescription>
                </Alert>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBroadcastOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleBroadcast}
                  disabled={isBroadcasting || !broadcastTitle.trim() || !broadcastBody.trim()}
                >
                  {isBroadcasting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Broadcast
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminNotificationSettingsCard;
