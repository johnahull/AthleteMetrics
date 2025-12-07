/**
 * Organization Admin Settings Page
 * Allows org admins to manage their organization settings including:
 * - AI Coaching Insights (if enabled by site admin)
 * - Wellness Module (if enabled by site admin)
 * - Coaches & Administrators management
 * - User invitations and role management
 * - Metrics Configuration
 */

import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SiteSettings } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Settings, AlertCircle, UserCog, Mail, Heart, UserPlus, Clock, Link as LinkIcon, Trash2, Users, Copy, RefreshCw, Globe, CheckCircle, Pencil, X, Dices } from "lucide-react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useOrganization, useUpdateOrgAdminSettings } from "@/lib/organization-api";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { InvitationModal } from "@/components/invitation-modal";
import OrganizationMetricsCard from "@/components/organization-metrics-card";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";

type OrganizationUser = {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    email: string;
    emails?: string[];
    firstName: string;
    lastName: string;
    role: string;
    isActive: boolean;
  };
};

type PendingInvitation = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  isUsed: boolean;
  expiresAt: string;
  createdAt: string;
  token: string;
};

type OrganizationProfile = {
  organization: {
    id: string;
    name: string;
    description?: string;
    aiEnabled?: boolean;
    aiEnabledBySiteAdmin?: boolean;
  };
  coaches: OrganizationUser[];
  athletes: OrganizationUser[];
  invitations: PendingInvitation[];
};

// Schema for org admin settable fields
const orgAdminSettingsSchema = z.object({
  aiEnabled: z.boolean().default(false),
  wellnessEnabled: z.boolean().default(true),
});

type OrgAdminSettings = z.infer<typeof orgAdminSettingsSchema>;

// Loading spinner component
const LoadingSpinner = ({ text }: { text: string }) => (
  <div className="flex items-center justify-center py-12">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      <p className="mt-2 text-muted-foreground">{text}</p>
    </div>
  </div>
);

export default function OrgAdminSettings() {
  const params = useParams();
  const organizationId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { confirm, ConfirmationComponent } = useConfirmation();

  // Modal state for inviting users
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<"athlete" | "coach" | "org_admin">("coach");

  // Join code edit mode state
  const [isEditingJoinCode, setIsEditingJoinCode] = useState(false);
  const [customJoinCode, setCustomJoinCode] = useState("");

  // Fetch organization data
  const { data: organization, isLoading, error } = useOrganization(organizationId);

  // Fetch organization profile for users list
  const { data: organizationProfile, refetch: refetchProfile } = useQuery<OrganizationProfile>({
    queryKey: [`/api/organizations/${organizationId}/profile`],
    enabled: !!organizationId,
  });

  // Fetch site settings to check wellness module status
  const { data: siteSettings } = useQuery<SiteSettings>({
    queryKey: ["/api/site-settings/public"],
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Update mutation for org settings
  const updateMutation = useUpdateOrgAdminSettings(organizationId!);

  // Update user role mutation (organization-scoped)
  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PUT", `/api/organizations/${organizationId}/users/${userId}/role`, { role });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update role");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/profile`] });
      toast({ title: "Role updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating role",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Remove user from organization mutation
  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/organizations/${organizationId}/users/${userId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to remove user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/profile`] });
      toast({ title: "User removed from organization" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error removing user",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Delete invitation mutation
  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("DELETE", `/api/invitations/${invitationId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to delete invitation");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/profile`] });
      toast({ title: "Invitation deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting invitation",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Update membership settings mutation
  const updateMembershipSettingsMutation = useMutation({
    mutationFn: async (settings: { isPublicDirectory?: boolean; allowMembershipRequests?: boolean; autoApproveRequests?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/organizations/${organizationId}/membership-settings`, settings);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update membership settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', organizationId] });
      toast({ title: "Membership settings updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating settings",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Regenerate or set custom join code mutation
  const regenerateJoinCodeMutation = useMutation({
    mutationFn: async (customCode?: string) => {
      const res = await apiRequest("POST", `/api/organizations/${organizationId}/regenerate-join-code`,
        customCode ? { customCode } : undefined
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update join code");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organization', organizationId] });
      setIsEditingJoinCode(false);
      setCustomJoinCode("");
      toast({
        title: data.message || "Join code updated",
        description: "The old join code will no longer work."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating join code",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Handle role change with confirmation for certain transitions
  const handleRoleChange = (userId: string, currentRole: string, newRole: string) => {
    if (currentRole === newRole) return;

    // Warn about role transitions between athlete and coach/admin
    if ((currentRole === 'athlete' && (newRole === 'coach' || newRole === 'org_admin')) ||
        ((currentRole === 'coach' || currentRole === 'org_admin') && newRole === 'athlete')) {
      confirm({
        title: "Role Change Warning",
        description: "Athletes cannot be coaches or admins, and coaches/admins cannot be athletes. Are you sure you want to change this role?",
        confirmText: "Change Role",
        onConfirm: () => updateUserRoleMutation.mutate({ userId, role: newRole }),
      });
    } else {
      updateUserRoleMutation.mutate({ userId, role: newRole });
    }
  };

  // Handle user removal with confirmation
  const handleRemoveUser = (userId: string, userName: string) => {
    confirm({
      title: "Remove User",
      description: `Are you sure you want to remove ${userName} from this organization?`,
      confirmText: "Remove",
      onConfirm: () => removeUserMutation.mutate(userId),
    });
  };

  // Handle invitation deletion with confirmation
  const handleDeleteInvitation = (invitationId: string, email: string) => {
    confirm({
      title: "Delete Invitation",
      description: `Are you sure you want to delete the invitation for ${email}?`,
      confirmText: "Delete",
      onConfirm: () => deleteInvitationMutation.mutate(invitationId),
    });
  };

  // Copy invitation link to clipboard
  const copyInviteLink = async (token: string) => {
    const inviteLink = `${window.location.protocol}//${window.location.host}/accept-invitation?token=${token}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast({ title: "Invitation link copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  // Open invite modal for specific role
  const openInviteModal = (role: "athlete" | "coach" | "org_admin") => {
    setInviteRole(role);
    setInviteModalOpen(true);
  };

  // Copy join code to clipboard
  const copyJoinCode = async () => {
    if (!organization?.joinCode) return;
    try {
      await navigator.clipboard.writeText(organization.joinCode);
      toast({ title: "Join code copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy code", variant: "destructive" });
    }
  };

  // Copy join link to clipboard
  const copyJoinLink = async () => {
    if (!organization?.joinCode) return;
    const joinLink = `${window.location.protocol}//${window.location.host}/join/${organization.joinCode}`;
    try {
      await navigator.clipboard.writeText(joinLink);
      toast({ title: "Join link copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  // Handle regenerate join code with confirmation
  const handleRegenerateJoinCode = () => {
    confirm({
      title: "Generate Random Code",
      description: "This will invalidate the current join code. Anyone with the old code will no longer be able to use it. Are you sure?",
      confirmText: "Generate",
      onConfirm: () => regenerateJoinCodeMutation.mutate(undefined),
    });
  };

  // Handle save custom join code
  const handleSaveCustomJoinCode = () => {
    const trimmed = customJoinCode.trim().toUpperCase();
    if (trimmed.length < 4) {
      toast({
        title: "Invalid code",
        description: "Join code must be at least 4 characters",
        variant: "destructive"
      });
      return;
    }
    if (trimmed.length > 20) {
      toast({
        title: "Invalid code",
        description: "Join code must be 20 characters or less",
        variant: "destructive"
      });
      return;
    }
    if (!/^[A-Z0-9]+$/.test(trimmed)) {
      toast({
        title: "Invalid code",
        description: "Join code can only contain letters and numbers",
        variant: "destructive"
      });
      return;
    }

    confirm({
      title: "Set Custom Join Code",
      description: `This will change your join code to "${trimmed}". The old code will no longer work. Are you sure?`,
      confirmText: "Save Code",
      onConfirm: () => regenerateJoinCodeMutation.mutate(trimmed),
    });
  };

  // Enter edit mode for join code
  const startEditingJoinCode = () => {
    setCustomJoinCode(organization?.joinCode || "");
    setIsEditingJoinCode(true);
  };

  // Cancel editing join code
  const cancelEditingJoinCode = () => {
    setIsEditingJoinCode(false);
    setCustomJoinCode("");
  };

  // Form setup with React Hook Form + Zod validation
  // If site admin has disabled features, force the values to false
  const form = useForm<OrgAdminSettings>({
    resolver: zodResolver(orgAdminSettingsSchema),
    values: organization ? {
      aiEnabled: organization.aiEnabledBySiteAdmin ? (organization.aiEnabled || false) : false,
      wellnessEnabled: siteSettings?.wellnessModuleEnabled ? (organization.wellnessEnabled ?? true) : false,
    } : undefined,
  });

  // Handle form submission
  const onSubmit = async (data: OrgAdminSettings) => {
    try {
      await updateMutation.mutateAsync({
        aiEnabled: data.aiEnabled,
        wellnessEnabled: data.wellnessEnabled,
      });

      toast({
        title: "Settings updated",
        description: "Organization settings have been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update organization settings",
        variant: "destructive",
      });
    }
  };

  // Org admin access check
  const isOrgAdmin = user?.role === 'org_admin' || user?.isSiteAdmin;

  if (!isOrgAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Only organization administrators can access these settings.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate(`/organizations/${organizationId}`)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Organization
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <LoadingSpinner text="Loading organization settings..." />
      </div>
    );
  }

  // Error state
  if (error || !organization) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : "Failed to load organization settings."}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate('/organizations')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Organizations
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const aiEnabledBySiteAdmin = organization.aiEnabledBySiteAdmin || false;
  const wellnessModuleEnabled = siteSettings?.wellnessModuleEnabled ?? true;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href={`/organizations/${organizationId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Settings className="h-6 w-6" />
              <h1 className="text-3xl font-bold">Organization Settings</h1>
            </div>
            <p className="text-muted-foreground mt-1">{organization.name}</p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Coaching Insights */}
          <Card>
            <CardHeader>
              <CardTitle>Coaching Insights</CardTitle>
              <CardDescription>
                Enable AI-powered coaching insights in reports for your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!aiEnabledBySiteAdmin && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Coaching Insights feature must be enabled by your administrator before you can use it.
                    Please contact your site administrator to enable this feature for your organization.
                  </AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="aiEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Coaching Insights</FormLabel>
                      <FormDescription>
                        Use AI-powered coaching insights in reports
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!aiEnabledBySiteAdmin}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Wellness Module */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Wellness Module
              </CardTitle>
              <CardDescription>
                Enable wellness questionnaires and tracking for your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!wellnessModuleEnabled && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Wellness module must be enabled by your administrator before you can use it.
                    Please contact your site administrator to enable this feature for your organization.
                  </AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="wellnessEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Wellness Module</FormLabel>
                      <FormDescription>
                        Allow users to create and complete wellness questionnaires
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!wellnessModuleEnabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-4">
            <Link href={`/organizations/${organizationId}`}>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>

      {/* Membership Settings Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Membership Settings
          </CardTitle>
          <CardDescription>
            Configure how athletes can discover and join your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Join Code */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Join Code</h4>
                <p className="text-sm text-muted-foreground">
                  Share this code with athletes to let them request membership
                </p>
              </div>
            </div>

            {isEditingJoinCode ? (
              /* Edit Mode */
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={customJoinCode}
                    onChange={(e) => setCustomJoinCode(e.target.value.toUpperCase())}
                    placeholder="Enter custom code (e.g., MYTEAM2024)"
                    className="font-mono text-lg tracking-wider flex-1"
                    maxLength={20}
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="default"
                    onClick={handleSaveCustomJoinCode}
                    disabled={regenerateJoinCodeMutation.isPending || customJoinCode.trim().length < 4}
                  >
                    {regenerateJoinCodeMutation.isPending ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span className="ml-2">Save</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancelEditingJoinCode}
                    disabled={regenerateJoinCodeMutation.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRegenerateJoinCode}
                    disabled={regenerateJoinCodeMutation.isPending}
                    title="Generate random code"
                  >
                    <Dices className="h-4 w-4" />
                    <span className="ml-2 hidden sm:inline">Random</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  4-20 characters, letters and numbers only
                </p>
              </div>
            ) : (
              /* Display Mode */
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    value={organization?.joinCode || 'Not generated'}
                    readOnly
                    className="font-mono text-lg tracking-wider pr-20"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={copyJoinCode}
                      disabled={!organization?.joinCode}
                      title="Copy code"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={copyJoinLink}
                      disabled={!organization?.joinCode}
                      title="Copy join link"
                    >
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={startEditingJoinCode}
                  title="Edit or customize join code"
                >
                  <Pencil className="h-4 w-4" />
                  <span className="ml-2">Edit</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRegenerateJoinCode}
                  disabled={regenerateJoinCodeMutation.isPending}
                  title="Generate random code"
                >
                  {regenerateJoinCodeMutation.isPending ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                  ) : (
                    <Dices className="h-4 w-4" />
                  )}
                  <span className="ml-2 hidden sm:inline">Random</span>
                </Button>
              </div>
            )}
          </div>

          {/* Membership Toggles */}
          <div className="space-y-4">
            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-base font-medium">Accept Membership Requests</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Allow athletes to request to join your organization
                </p>
              </div>
              <Switch
                checked={organization?.allowMembershipRequests ?? true}
                onCheckedChange={(checked) => updateMembershipSettingsMutation.mutate({ allowMembershipRequests: checked })}
                disabled={updateMembershipSettingsMutation.isPending}
              />
            </div>

            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-base font-medium">Public Directory</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  List your organization in the public browse directory
                </p>
              </div>
              <Switch
                checked={organization?.isPublicDirectory ?? false}
                onCheckedChange={(checked) => updateMembershipSettingsMutation.mutate({ isPublicDirectory: checked })}
                disabled={updateMembershipSettingsMutation.isPending || !organization?.allowMembershipRequests}
              />
            </div>

            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  <span className="text-base font-medium">Auto-Approve Requests</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Automatically approve all membership requests (open enrollment)
                </p>
              </div>
              <Switch
                checked={organization?.autoApproveRequests ?? false}
                onCheckedChange={(checked) => updateMembershipSettingsMutation.mutate({ autoApproveRequests: checked })}
                disabled={updateMembershipSettingsMutation.isPending || !organization?.allowMembershipRequests}
              />
            </div>
          </div>

          {/* Status Summary */}
          <div className="rounded-lg bg-muted p-4">
            <h4 className="text-sm font-medium mb-2">Current Status</h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant={organization?.allowMembershipRequests ? "default" : "secondary"}>
                {organization?.allowMembershipRequests ? "Accepting Requests" : "Not Accepting Requests"}
              </Badge>
              {organization?.allowMembershipRequests && (
                <>
                  <Badge variant={organization?.isPublicDirectory ? "default" : "outline"}>
                    {organization?.isPublicDirectory ? "Listed in Directory" : "Private"}
                  </Badge>
                  <Badge variant={organization?.autoApproveRequests ? "default" : "outline"}>
                    {organization?.autoApproveRequests ? "Auto-Approve On" : "Manual Approval"}
                  </Badge>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Management Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Team Members
              </CardTitle>
              <CardDescription>
                Manage coaches and administrators in your organization
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openInviteModal("coach")}
                data-testid="invite-coach-button"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Coach
              </Button>
              <Button
                size="sm"
                onClick={() => openInviteModal("org_admin")}
                data-testid="invite-admin-button"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Admin
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Coaches & Admins List */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                Coaches & Administrators ({organizationProfile?.coaches?.length ?? 0})
              </h4>
              {organizationProfile?.coaches && organizationProfile.coaches.length > 0 ? (
                organizationProfile.coaches.map((member) => (
                  <div
                    key={member.user.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    data-testid={`user-row-${member.user.id}`}
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {member.user.firstName} {member.user.lastName}
                      </p>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span>{member.user.email || member.user.emails?.[0] || 'No email'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={member.role}
                        onValueChange={(newRole) => handleRoleChange(member.user.id, member.role, newRole)}
                        disabled={member.user.id === user?.id}
                      >
                        <SelectTrigger className="w-32" data-testid={`role-select-${member.user.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="org_admin">Admin</SelectItem>
                          <SelectItem value="coach">Coach</SelectItem>
                        </SelectContent>
                      </Select>
                      {member.user.id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveUser(member.user.id, `${member.user.firstName} ${member.user.lastName}`)}
                          data-testid={`remove-user-${member.user.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  No coaches or administrators found
                </p>
              )}
            </div>

            {/* Pending Invitations */}
            {organizationProfile?.invitations && organizationProfile.invitations.filter(inv => !inv.isUsed && (inv.role === 'coach' || inv.role === 'org_admin')).length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Pending Invitations
                </h4>
                {organizationProfile.invitations
                  .filter(inv => !inv.isUsed && (inv.role === 'coach' || inv.role === 'org_admin'))
                  .map((invitation) => {
                    const isExpired = new Date() > new Date(invitation.expiresAt);
                    return (
                      <div
                        key={invitation.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${isExpired ? 'bg-destructive/10' : 'bg-yellow-50 dark:bg-yellow-900/20'}`}
                        data-testid={`invitation-row-${invitation.id}`}
                      >
                        <div className="flex-1">
                          <p className="font-medium">
                            {invitation.firstName} {invitation.lastName}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            <span>{invitation.email}</span>
                            <Badge variant={isExpired ? 'destructive' : 'secondary'} className="text-xs">
                              {isExpired ? 'Expired' : invitation.role === 'org_admin' ? 'Admin' : 'Coach'}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isExpired && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyInviteLink(invitation.token)}
                              title="Copy invitation link"
                              data-testid={`copy-invite-${invitation.id}`}
                            >
                              <LinkIcon className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteInvitation(invitation.id, invitation.email)}
                            data-testid={`delete-invite-${invitation.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metrics Configuration Section */}
      <OrganizationMetricsCard
        organizationId={organizationId!}
        canEdit={true}
      />

      {/* Invitation Modal */}
      {organizationId && (
        <InvitationModal
          open={inviteModalOpen}
          onOpenChange={setInviteModalOpen}
          organizationId={organizationId}
          role={inviteRole}
          onSuccess={() => {
            refetchProfile();
          }}
        />
      )}

      {/* Confirmation Dialog */}
      {ConfirmationComponent}
    </div>
  );
}
