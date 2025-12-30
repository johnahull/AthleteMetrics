/**
 * OrgNotificationSettingsCard - Organization notification settings management
 *
 * Allows org admins to configure notification settings for their organization:
 * - Enable/disable push notifications for the org
 * - Toggle which notification types are available
 * - Configure daily digest timing
 * - Set default preferences for new users
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Bell,
  Loader2,
  AlertCircle,
  Check,
  Heart,
  TrendingUp,
  Users,
  Clock,
  Settings2,
  Calendar,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface OrgNotificationSettings {
  pushEnabled: boolean;
  wellnessSurveysEnabled: boolean;
  wellnessDigestEnabled: boolean;
  newMeasurementsEnabled: boolean;
  teamAnnouncementsEnabled: boolean;
  digestTime: string;
  digestSkipWeekends: boolean;
  digestTimezone: string;
  defaultPushWellnessSurveys: boolean;
  defaultPushMeasurements: boolean;
  defaultPushAnnouncements: boolean;
  defaultEmailWellnessSurveys: boolean;
  defaultEmailMeasurements: boolean;
  defaultEmailAnnouncements: boolean;
}

interface OrgNotificationSettingsCardProps {
  organizationId: string;
}

// Common timezones
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Phoenix', label: 'Arizona Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'UTC', label: 'UTC' },
];

export function OrgNotificationSettingsCard({ organizationId }: OrgNotificationSettingsCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch org notification settings
  const { data: settings, isLoading, isError } = useQuery<OrgNotificationSettings>({
    queryKey: [`/api/organizations/${organizationId}/notifications/settings`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/organizations/${organizationId}/notifications/settings`);
      return response.json();
    },
  });

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<OrgNotificationSettings>) => {
      const response = await apiRequest('PUT', `/api/organizations/${organizationId}/notifications/settings`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/notifications/settings`] });
      toast({
        title: 'Settings saved',
        description: 'Organization notification settings have been updated.',
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

  const handleToggle = async (key: keyof OrgNotificationSettings, value: boolean) => {
    await updateSettings.mutateAsync({ [key]: value });
  };

  const handleChange = async (key: keyof OrgNotificationSettings, value: string) => {
    await updateSettings.mutateAsync({ [key]: value });
  };

  if (isLoading) {
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
              Failed to load notification settings. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const orgSettings = settings || {
    pushEnabled: true,
    wellnessSurveysEnabled: true,
    wellnessDigestEnabled: true,
    newMeasurementsEnabled: true,
    teamAnnouncementsEnabled: true,
    digestTime: '07:00',
    digestSkipWeekends: false,
    digestTimezone: 'America/New_York',
    defaultPushWellnessSurveys: true,
    defaultPushMeasurements: true,
    defaultPushAnnouncements: true,
    defaultEmailWellnessSurveys: true,
    defaultEmailMeasurements: false,
    defaultEmailAnnouncements: true,
  };

  return (
    <div className="space-y-6">
      {/* Master Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle>Push Notifications</CardTitle>
            </div>
            {orgSettings.pushEnabled && (
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" />
                Enabled
              </Badge>
            )}
          </div>
          <CardDescription>
            Control push notifications for your entire organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="org-push-enabled">Enable Push Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Allow push notifications for users in this organization
              </p>
            </div>
            <Switch
              id="org-push-enabled"
              checked={orgSettings.pushEnabled}
              onCheckedChange={(checked) => handleToggle('pushEnabled', checked)}
            />
          </div>

          <Separator />

          {/* Available Notification Types */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Available Notification Types</h4>
            <p className="text-xs text-muted-foreground">
              Toggle which types of notifications users can receive
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Heart className="h-4 w-4 text-red-500" />
                  <div>
                    <Label>Wellness Surveys</Label>
                    <p className="text-xs text-muted-foreground">Notify athletes of new wellness checks</p>
                  </div>
                </div>
                <Switch
                  checked={orgSettings.wellnessSurveysEnabled}
                  onCheckedChange={(checked) => handleToggle('wellnessSurveysEnabled', checked)}
                  disabled={!orgSettings.pushEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <div>
                    <Label>Wellness Digest</Label>
                    <p className="text-xs text-muted-foreground">Daily summary for coaches</p>
                  </div>
                </div>
                <Switch
                  checked={orgSettings.wellnessDigestEnabled}
                  onCheckedChange={(checked) => handleToggle('wellnessDigestEnabled', checked)}
                  disabled={!orgSettings.pushEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <div>
                    <Label>New Measurements</Label>
                    <p className="text-xs text-muted-foreground">Notify athletes when data is recorded</p>
                  </div>
                </div>
                <Switch
                  checked={orgSettings.newMeasurementsEnabled}
                  onCheckedChange={(checked) => handleToggle('newMeasurementsEnabled', checked)}
                  disabled={!orgSettings.pushEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-blue-500" />
                  <div>
                    <Label>Team Announcements</Label>
                    <p className="text-xs text-muted-foreground">Coach messages to teams</p>
                  </div>
                </div>
                <Switch
                  checked={orgSettings.teamAnnouncementsEnabled}
                  onCheckedChange={(checked) => handleToggle('teamAnnouncementsEnabled', checked)}
                  disabled={!orgSettings.pushEnabled}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Digest Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle>Daily Digest</CardTitle>
          </div>
          <CardDescription>
            Configure when coaches receive daily wellness summaries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="digest-time">Delivery Time</Label>
              <Input
                id="digest-time"
                type="time"
                value={orgSettings.digestTime}
                onChange={(e) => handleChange('digestTime', e.target.value)}
                disabled={!orgSettings.wellnessDigestEnabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="digest-timezone">Timezone</Label>
              <Select
                value={orgSettings.digestTimezone}
                onValueChange={(value) => handleChange('digestTimezone', value)}
                disabled={!orgSettings.wellnessDigestEnabled}
              >
                <SelectTrigger id="digest-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="space-y-0.5">
              <Label htmlFor="skip-weekends">Skip Weekends</Label>
              <p className="text-sm text-muted-foreground">
                Don't send digest on Saturdays and Sundays
              </p>
            </div>
            <Switch
              id="skip-weekends"
              checked={orgSettings.digestSkipWeekends}
              onCheckedChange={(checked) => handleToggle('digestSkipWeekends', checked)}
              disabled={!orgSettings.wellnessDigestEnabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Default Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <CardTitle>Default Preferences</CardTitle>
          </div>
          <CardDescription>
            Default notification settings for new users joining this organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Default Push Preferences */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Default Push Notifications</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Wellness Surveys</Label>
                <Switch
                  checked={orgSettings.defaultPushWellnessSurveys}
                  onCheckedChange={(checked) => handleToggle('defaultPushWellnessSurveys', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Measurements</Label>
                <Switch
                  checked={orgSettings.defaultPushMeasurements}
                  onCheckedChange={(checked) => handleToggle('defaultPushMeasurements', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Announcements</Label>
                <Switch
                  checked={orgSettings.defaultPushAnnouncements}
                  onCheckedChange={(checked) => handleToggle('defaultPushAnnouncements', checked)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Default Email Preferences */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Default Email Notifications</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Wellness Surveys</Label>
                <Switch
                  checked={orgSettings.defaultEmailWellnessSurveys}
                  onCheckedChange={(checked) => handleToggle('defaultEmailWellnessSurveys', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Measurements</Label>
                <Switch
                  checked={orgSettings.defaultEmailMeasurements}
                  onCheckedChange={(checked) => handleToggle('defaultEmailMeasurements', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Announcements</Label>
                <Switch
                  checked={orgSettings.defaultEmailAnnouncements}
                  onCheckedChange={(checked) => handleToggle('defaultEmailAnnouncements', checked)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default OrgNotificationSettingsCard;
