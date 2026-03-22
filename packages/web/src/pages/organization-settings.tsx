/**
 * Organization Settings Page (Site Admin Only)
 * Allows site admins to manage organization settings including:
 * - Basic organization info (name, description, location)
 * - Feature flags (benchmarksEnabled, allowCustomBenchmarks)
 * - Organization status (isActive)
 */

import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, Settings } from "lucide-react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useOrganization, useUpdateOrganization } from "@/lib/organization-api";
import { updateOrganizationSchema } from "@shared/schema";
import type { UpdateOrganization } from "@shared/schema";
import { OrganizationTypeSelector } from "@/components/organization-type-selector";

// Loading spinner component
const LoadingSpinner = ({ text }: { text: string }) => (
  <div className="flex items-center justify-center py-12">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      <p className="mt-2 text-muted-foreground">{text}</p>
    </div>
  </div>
);

export default function OrganizationSettings() {
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
  const form = useForm<UpdateOrganization>({
    resolver: zodResolver(updateOrganizationSchema),
    values: organization ? {
      name: organization.name,
      description: organization.description || '',
      location: organization.location || '',
      orgType: organization.orgType || 'club',
      isActive: organization.isActive,
      benchmarksEnabled: organization.benchmarksEnabled || false,
      allowCustomBenchmarks: organization.allowCustomBenchmarks || false,
      aiEnabledBySiteAdmin: organization.aiEnabledBySiteAdmin || false,
      aiPromptContext: organization.aiPromptContext || '',
      wellnessEnabled: organization.wellnessEnabled ?? true,
      customMetricsEnabled: organization.customMetricsEnabled || false,
    } : undefined,
  });

  // Handle form submission
  const onSubmit = async (data: UpdateOrganization) => {
    try {
      // Only send fields that have changed
      const changedFields: UpdateOrganization = {};

      if (data.name !== organization?.name) {
        changedFields.name = data.name;
      }
      if (data.description !== organization?.description) {
        changedFields.description = data.description;
      }
      if (data.location !== organization?.location) {
        changedFields.location = data.location;
      }
      if (data.orgType !== organization?.orgType) {
        changedFields.orgType = data.orgType;
      }
      if (data.isActive !== organization?.isActive) {
        changedFields.isActive = data.isActive;
      }
      if (data.benchmarksEnabled !== organization?.benchmarksEnabled) {
        changedFields.benchmarksEnabled = data.benchmarksEnabled;
      }
      if (data.allowCustomBenchmarks !== organization?.allowCustomBenchmarks) {
        changedFields.allowCustomBenchmarks = data.allowCustomBenchmarks;
      }
      if (data.aiEnabledBySiteAdmin !== organization?.aiEnabledBySiteAdmin) {
        changedFields.aiEnabledBySiteAdmin = data.aiEnabledBySiteAdmin;
      }
      if (data.aiPromptContext !== (organization?.aiPromptContext || '')) {
        changedFields.aiPromptContext = data.aiPromptContext || null;
      }
      if (data.wellnessEnabled !== organization?.wellnessEnabled) {
        changedFields.wellnessEnabled = data.wellnessEnabled;
      }
      if (data.customMetricsEnabled !== organization?.customMetricsEnabled) {
        changedFields.customMetricsEnabled = data.customMetricsEnabled;
      }
      // If no changes, don't make API call
      if (Object.keys(changedFields).length === 0) {
        toast({
          title: "No changes",
          description: "No settings were modified.",
        });
        return;
      }

      await updateMutation.mutateAsync(changedFields);

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

  // Site admin access check
  if (!user?.isSiteAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Only site administrators can access organization settings.
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
          {/* Basic Organization Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Update organization name, description, and location
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter organization name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Enter organization description (optional)"
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter location (optional)"
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Organization Type */}
          <Card>
            <CardHeader>
              <CardTitle>Organization Type</CardTitle>
              <CardDescription>
                Affects which metrics and benchmarks are available to your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div role="group" aria-label="Organization Type">
                <FormField
                  control={form.control}
                  name="orgType"
                  render={({ field }) => (
                    <OrganizationTypeSelector field={field} />
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Feature Flags */}
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>
                Control which features are enabled for this organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="benchmarksEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Benchmarks Feature</FormLabel>
                      <FormDescription>
                        Enable benchmark management for this organization
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowCustomBenchmarks"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Custom Benchmarks</FormLabel>
                      <FormDescription>
                        Allow organization to create custom benchmarks (requires Benchmarks Feature enabled)
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!form.watch('benchmarksEnabled')}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="aiEnabledBySiteAdmin"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Coaching Insights</FormLabel>
                      <FormDescription>
                        Allow coaches to generate AI insights in reports (Site Admin Only)
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="aiPromptContext"
                render={({ field }) => (
                  <FormItem className="rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">AI Prompt Context</FormLabel>
                      <FormDescription>
                        Customize how AI generates coaching insights for your reports. Describe your training philosophy, methodology, or any context the AI should consider.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="e.g., Our organization focuses on speed development and injury prevention for youth athletes..."
                        value={field.value || ''}
                        maxLength={2000}
                        rows={4}
                        disabled={!form.watch('aiEnabledBySiteAdmin')}
                      />
                    </FormControl>
                    <div className="flex justify-end">
                      <span className="text-xs text-muted-foreground">
                        {(field.value || '').length} / 2000
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="wellnessEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Wellness Module</FormLabel>
                      <FormDescription>
                        Enable wellness questionnaires and health tracking for this organization
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customMetricsEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Custom Metrics</FormLabel>
                      <FormDescription>
                        Allow organization to create custom performance metrics (org-specific, not shared)
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Organization Status */}
          <Card>
            <CardHeader>
              <CardTitle>Organization Status</CardTitle>
              <CardDescription>
                Deactivating an organization will prevent users from accessing it
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active Status</FormLabel>
                      <FormDescription>
                        {field.value
                          ? "Organization is currently active"
                          : "Organization is currently deactivated"
                        }
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
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
