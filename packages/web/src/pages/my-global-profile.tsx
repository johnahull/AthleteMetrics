/**
 * My Global Profile Page
 *
 * Allows athletes to manage their cross-organization identity:
 * - View linked accounts
 * - Control privacy settings (allow/deny cross-org linking)
 * - Control data sharing preferences
 * - View audit log of identity changes
 */

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  useGlobalAthleteProfile,
  useGlobalAthleteAuditLog,
  useUpdatePrivacySettings,
  useUpdateSharingSettings,
} from '@/hooks/useGlobalAthlete';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { OrgBadge } from '@/components/athlete/OrgBadge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2,
  Shield,
  Link2,
  Building2,
  Eye,
  EyeOff,
  History,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import { Redirect, Link } from 'wouter';
import { formatDistanceToNow, format } from 'date-fns';

export default function MyGlobalProfilePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useGlobalAthleteProfile();
  const { data: auditLog, isLoading: auditLoading } = useGlobalAthleteAuditLog();
  const updatePrivacy = useUpdatePrivacySettings();
  const updateSharing = useUpdateSharingSettings();

  const [showDisableDialog, setShowDisableDialog] = useState(false);

  // Redirect if not logged in
  if (!authLoading && !user) {
    return <Redirect to="/login" />;
  }

  // Loading state
  if (authLoading || profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading profile...</p>
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
              <Shield className="h-5 w-5" />
              Global Athlete Profile
            </CardTitle>
            <CardDescription>
              Manage your cross-organization identity and privacy settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Global Profile Yet</h3>
              <p className="text-muted-foreground mb-4">
                Your global athlete profile will be created when you verify your email address.
                This allows you to link accounts across multiple organizations.
              </p>
              <Link href="/my-dashboard">
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { globalAthlete, currentLink, linkedAccounts, linkedAccountCount } = profile;

  const handleToggleCrossOrgLinking = () => {
    if (globalAthlete?.allowCrossOrgLinking) {
      // Show warning dialog before disabling
      setShowDisableDialog(true);
    } else {
      // Enable directly
      updatePrivacy.mutate(true);
    }
  };

  const handleConfirmDisable = () => {
    updatePrivacy.mutate(false);
    setShowDisableDialog(false);
  };

  const handleToggleSharing = (value: boolean) => {
    updateSharing.mutate(value);
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/my-dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Global Athlete Profile
          </h1>
          <p className="text-muted-foreground">
            Manage your cross-organization identity and privacy
          </p>
        </div>
      </div>

      {/* Identity Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Your Identity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Canonical Name</Label>
              <p className="font-medium">{globalAthlete?.canonicalFullName}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Primary Email</Label>
              <p className="font-medium">{globalAthlete?.primaryEmail}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Linked Accounts</Label>
              <p className="font-medium">{linkedAccountCount}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Profile Created</Label>
              <p className="font-medium">
                {globalAthlete?.createdAt
                  ? formatDistanceToNow(new Date(globalAthlete.createdAt), { addSuffix: true })
                  : 'Unknown'}
              </p>
            </div>
          </div>

          {globalAthlete?.verifiedEmails && globalAthlete.verifiedEmails.length > 1 && (
            <div>
              <Label className="text-muted-foreground">All Verified Emails</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {globalAthlete.verifiedEmails.map((email: string) => (
                  <Badge key={email} variant="secondary">
                    {email}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linked Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Linked Accounts
          </CardTitle>
          <CardDescription>
            These accounts share the same verified email and are linked to your global identity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkedAccounts.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No linked accounts found.
            </p>
          ) : (
            <div className="space-y-3">
              {linkedAccounts.map((account) => (
                <div
                  key={account.userId}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {account.organizations.map((org) => (
                        <OrgBadge key={org.id} organizationName={org.name} size="md" />
                      ))}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span>Link type: {account.linkType.replace('_', ' ')}</span>
                      <span>&bull;</span>
                      <span>Role: {account.organizations[0]?.role || 'athlete'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {account.linkStatus === 'confirmed' && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    )}
                    {account.linkStatus === 'revoked' && (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        <XCircle className="h-3 w-3 mr-1" />
                        Revoked
                      </Badge>
                    )}
                    <span title={account.shareMeasurements ? "Sharing measurements" : "Not sharing measurements"}>
                      {account.shareMeasurements ? (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Privacy Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy Settings
          </CardTitle>
          <CardDescription>
            Control how your data is shared across organizations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cross-Org Linking */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Allow Cross-Organization Linking</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, new accounts with the same verified email will automatically link to your profile.
              </p>
            </div>
            <Switch
              checked={globalAthlete?.allowCrossOrgLinking || false}
              onCheckedChange={handleToggleCrossOrgLinking}
              disabled={updatePrivacy.isPending}
            />
          </div>

          <Separator />

          {/* Measurement Sharing */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Share Measurements</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, your measurements from this account are visible in your unified dashboard.
              </p>
            </div>
            <Switch
              checked={currentLink?.shareMeasurements || false}
              onCheckedChange={handleToggleSharing}
              disabled={updateSharing.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Activity Log
          </CardTitle>
          <CardDescription>
            History of changes to your global athlete profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !auditLog?.auditLog || auditLog.auditLog.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No activity recorded.
            </p>
          ) : (
            <div className="space-y-2">
              {auditLog.auditLog.slice(0, 10).map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-2 rounded text-sm"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {log.action === 'created' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    {log.action === 'privacy_changed' && (
                      <Shield className="h-4 w-4 text-blue-500" />
                    )}
                    {log.action === 'link_confirmed' && (
                      <Link2 className="h-4 w-4 text-purple-500" />
                    )}
                    {!['created', 'privacy_changed', 'link_confirmed'].includes(log.action) && (
                      <History className="h-4 w-4 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium capitalize">
                      {log.action.replace(/_/g, ' ')}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {format(new Date(log.createdAt), 'PPp')} &bull; by {log.actorType}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disable Cross-Org Linking Dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Disable Cross-Organization Linking?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Disabling cross-organization linking will:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Revoke access from other linked accounts</li>
                <li>Prevent new accounts from automatically linking</li>
                <li>Keep your current account's data intact</li>
              </ul>
              <p className="font-medium">
                You can re-enable linking at any time.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDisable}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Disable Linking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
