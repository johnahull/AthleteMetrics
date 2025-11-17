/**
 * Organization Admin Settings Page
 * Allows org admins to manage their organization settings including:
 * - AI Coaching Insights (if enabled by site admin)
 */

import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Save, Settings, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useOrganization, useUpdateOrganization } from "@/lib/organization-api";
import { z } from "zod";

// Schema for org admin settable fields
const orgAdminSettingsSchema = z.object({
  aiEnabled: z.boolean().default(false),
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

  // Update mutation
  const updateMutation = useUpdateOrganization(organizationId!);

  // Form setup with React Hook Form + Zod validation
  const form = useForm<OrgAdminSettings>({
    resolver: zodResolver(orgAdminSettingsSchema),
    values: organization ? {
      aiEnabled: organization.aiEnabled || false,
    } : undefined,
  });

  // Handle form submission
  const onSubmit = async (data: OrgAdminSettings) => {
    try {
      await updateMutation.mutateAsync({ aiEnabled: data.aiEnabled });

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
    </div>
  );
}
