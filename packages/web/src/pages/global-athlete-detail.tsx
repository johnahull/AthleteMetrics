import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useGlobalAthleteDetails,
  useForceUnlink,
  useAdminUpdatePrivacy,
} from "@/hooks/useAdminGlobalAthletes";
import { ArrowLeft, Mail, Calendar, Shield, Users, Unlink, Activity } from "lucide-react";
import { format } from "date-fns";

export default function GlobalAthleteDetail() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/global-athletes/:id");
  const { toast } = useToast();
  const { confirm, ConfirmationComponent } = useConfirmation();

  const athleteId = params?.id;

  // Redirect non-site-admins
  useEffect(() => {
    if (!user?.isSiteAdmin) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const { data, isLoading } = useGlobalAthleteDetails(athleteId || "");
  const forceUnlinkMutation = useForceUnlink();
  const updatePrivacyMutation = useAdminUpdatePrivacy();

  const handleUnlink = (userId: string, userName: string) => {
    confirm({
      title: "Force Unlink User",
      description: `Are you sure you want to unlink this user from the global athlete profile? This action cannot be undone.`,
      confirmText: "Unlink",
      onConfirm: async () => {
        try {
          await forceUnlinkMutation.mutateAsync({
            globalAthleteId: athleteId!,
            userId,
          });
          toast({
            title: "User unlinked",
            description: "The user has been unlinked from this global athlete profile.",
          });
        } catch (error: any) {
          toast({
            title: "Error",
            description: error.message || "Failed to unlink user",
            variant: "destructive",
          });
        }
      },
    });
  };

  const handlePrivacyToggle = (newValue: boolean) => {
    confirm({
      title: "Update Privacy Settings",
      description: newValue
        ? "Enabling cross-org linking will allow this athlete to be linked across multiple organizations."
        : "Disabling cross-org linking will prevent new cross-organization links. Existing links will not be affected.",
      confirmText: "Update Settings",
      onConfirm: async () => {
        try {
          await updatePrivacyMutation.mutateAsync({
            globalAthleteId: athleteId!,
            allowCrossOrgLinking: newValue,
          });
          toast({
            title: "Privacy settings updated",
            description: `Cross-organization linking has been ${newValue ? "enabled" : "disabled"}.`,
          });
        } catch (error: any) {
          toast({
            title: "Error",
            description: error.message || "Failed to update privacy settings",
            variant: "destructive",
          });
        }
      },
    });
  };

  if (!user?.isSiteAdmin) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 text-gray-500">Global athlete not found</div>
      </div>
    );
  }

  const { globalAthlete, linkedUsers, auditLog } = data;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/global-athletes")}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to List
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{globalAthlete.canonicalFullName}</h1>
          <p className="text-gray-600 mt-1">Global Athlete Profile</p>
        </div>
      </div>

      {/* Global Athlete Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Global Athlete Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-600 text-sm">Full Name</Label>
              <div className="font-medium">{globalAthlete.canonicalFullName}</div>
            </div>

            <div>
              <Label className="text-gray-600 text-sm">Primary Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{globalAthlete.primaryEmail}</span>
              </div>
            </div>

            <div>
              <Label className="text-gray-600 text-sm">Verified Emails</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {globalAthlete.verifiedEmails.map((email) => (
                  <Badge key={email} variant="secondary" className="bg-blue-50 text-blue-700">
                    {email}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-gray-600 text-sm">Birth Date</Label>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="font-medium">
                  {globalAthlete.birthDate
                    ? format(new Date(globalAthlete.birthDate), "MMM d, yyyy")
                    : "Not set"}
                </span>
              </div>
            </div>

            <div>
              <Label className="text-gray-600 text-sm">Created</Label>
              <div className="font-medium">
                {format(new Date(globalAthlete.createdAt), "MMM d, yyyy h:mm a")}
              </div>
            </div>

            <div>
              <Label className="text-gray-600 text-sm">Cross-Organization Linking</Label>
              <div className="flex items-center gap-2 mt-2">
                <Switch
                  checked={globalAthlete.allowCrossOrgLinking}
                  onCheckedChange={handlePrivacyToggle}
                  disabled={updatePrivacyMutation.isPending}
                  data-testid="privacy-toggle"
                />
                <Label className="text-sm">
                  {globalAthlete.allowCrossOrgLinking ? "Enabled" : "Disabled"}
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked Users Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Linked Users ({linkedUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {linkedUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No linked users</div>
          ) : (
            <div className="space-y-4">
              {linkedUsers.map((link) => (
                <div
                  key={link.userId}
                  className="p-4 border border-gray-200 rounded-lg flex items-start justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">User ID: {link.userId}</span>
                      <Badge variant="secondary" className="text-xs">
                        {link.linkType}
                      </Badge>
                      {link.shareMeasurements && (
                        <Badge variant="secondary" className="bg-green-50 text-green-700 text-xs">
                          Sharing Measurements
                        </Badge>
                      )}
                    </div>

                    {link.organizations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {link.organizations.map((org) => (
                          <Badge key={org.id} variant="outline" className="text-xs">
                            {org.name} ({org.role})
                          </Badge>
                        ))}
                      </div>
                    )}

                    {link.confirmedAt && (
                      <div className="text-xs text-gray-500 mt-2">
                        Confirmed: {format(new Date(link.confirmedAt), "MMM d, yyyy h:mm a")}
                      </div>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleUnlink(link.userId, link.userId)}
                    disabled={forceUnlinkMutation.isPending}
                    data-testid={`unlink-${link.userId}`}
                  >
                    <Unlink className="h-4 w-4 mr-2" />
                    Unlink
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Log Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditLog.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No audit log entries</div>
          ) : (
            <div className="space-y-3">
              {auditLog.map((log) => (
                <div key={log.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {log.action}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {log.actorType}
                        </Badge>
                      </div>
                      {Object.keys(log.details || {}).length > 0 && (
                        <div className="mt-2 text-xs text-gray-600">
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {format(new Date(log.createdAt), "MMM d, yyyy h:mm a")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {ConfirmationComponent}
    </div>
  );
}
