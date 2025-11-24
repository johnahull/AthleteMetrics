/**
 * Organization Admin Settings Page
 * Allows org admins to manage their organization settings including:
 * - AI Coaching Insights (if enabled by site admin)
 * - Wellness Module (if enabled by site admin)
 * - Coaches & Administrators management
 * - Metrics Configuration
 */

import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Settings, AlertCircle, UserCog, Mail, Heart } from "lucide-react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useOrganization, useUpdateOrgAdminSettings } from "@/lib/organization-api";
import OrganizationMetricsCard from "@/components/organization-metrics-card";
import { z } from "zod";

type OrganizationProfile = {
  id: string;
  name: string;
  description?: string;
  aiEnabled?: boolean;
  aiEnabledBySiteAdmin?: boolean;
  coaches: Array<{
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    role: string;
  }>;
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

  // Fetch organization data
  const { data: organization, isLoading, error } = useOrganization(organizationId);

  // Fetch organization profile for coaches/admins list
  const { data: organizationProfile } = useQuery<OrganizationProfile>({
    queryKey: [`/api/organizations/${organizationId}/profile`],
    enabled: !!organizationId,
  });

  // Fetch site settings to check wellness module status
  const { data: siteSettings } = useQuery({
    queryKey: ["/api/site-settings/public"],
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Update mutation
  const updateMutation = useUpdateOrgAdminSettings(organizationId!);

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

      {/* Coaches & Administrators Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Coaches & Administrators ({organizationProfile?.coaches?.length ?? 0})
          </CardTitle>
          <CardDescription>
            View coaches and administrators in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {organizationProfile?.coaches && organizationProfile.coaches.length > 0 ? (
              organizationProfile.coaches.map((coach) => (
                <div
                  key={coach.user.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium">
                      {coach.user.firstName} {coach.user.lastName}
                    </p>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      <span>{coach.user.email}</span>
                    </div>
                  </div>
                  <Badge variant={coach.role === 'org_admin' ? 'default' : 'secondary'}>
                    {coach.role === 'org_admin' ? 'Admin' : 'Coach'}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No coaches or administrators found
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metrics Configuration Section */}
      <OrganizationMetricsCard
        organizationId={organizationId!}
        canEdit={true}
      />
    </div>
  );
}
