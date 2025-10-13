import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Trash2, Power, PowerOff } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { mutations } from "@/lib/api";

type Organization = {
  id: string;
  name: string;
  description?: string;
  isActive?: boolean;
  createdAt: string;
};

const organizationSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  description: z.string().optional(),
});

export default function Organizations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { user, setOrganizationContext } = useAuth();

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/my-organizations"],
  });

  const orgForm = useForm({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createOrgMutation = useMutation({
    mutationFn: async (data: z.infer<typeof organizationSchema>) => {
      const res = await apiRequest("POST", "/api/organizations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-organizations"] });
      toast({ title: "Organization created successfully!" });
      setOrgDialogOpen(false);
      orgForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error creating organization", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await mutations.updateOrganizationStatus(id, isActive);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-organizations"] });
      toast({
        title: variables.isActive ? "Organization activated" : "Organization deactivated",
        description: variables.isActive
          ? "Users can now log into this organization."
          : "Users will no longer be able to log into this organization."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating organization status",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async (id: string) => {
      return await mutations.deleteOrganization(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-organizations"] });
      toast({
        title: "Organization deleted",
        description: "The organization and all related data have been permanently deleted."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting organization",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const onCreateOrg = (data: z.infer<typeof organizationSchema>) => {
    createOrgMutation.mutate(data);
  };

  const onOrganizationClick = (orgId: string, orgName: string) => {
    // Site admins can switch to organization context
    if (user?.isSiteAdmin) {
      setOrganizationContext(orgId);
      setLocation('/'); // Redirect to dashboard in org context
      toast({ 
        title: `Switched to ${orgName}`,
        description: "Now viewing organization-specific data. Use 'Back to Site' to return to site view.",
      });
    } else {
      // Check if user belongs to this organization before allowing access
      const userBelongsToOrg = organizations?.some(org => org.id === orgId);
      if (userBelongsToOrg) {
        setLocation(`/organizations/${orgId}`);
      } else {
        toast({ 
          title: "Access Denied",
          description: "You can only access organizations you belong to.",
          variant: "destructive"
        });
      }
    }
  };

  // Auto-redirect non-site admins to their primary organization if they only have one
  useEffect(() => {
    if (!user?.isSiteAdmin && organizations && organizations.length === 1) {
      const primaryOrg = organizations[0];
      console.log(`Auto-redirecting user to their primary organization: ${primaryOrg.name}`);
      setLocation(`/organizations/${primaryOrg.id}`);
    }
  }, [user, organizations, setLocation]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-600 mt-1">Manage your organizations and settings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organization Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle>Organizations</CardTitle>
              </div>
              <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="create-organization-button">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Organization
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Organization</DialogTitle>
                    <DialogDescription>
                      Add a new organization to the system
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...orgForm}>
                    <form onSubmit={orgForm.handleSubmit(onCreateOrg)} className="space-y-4">
                      <FormField
                        control={orgForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organization Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter organization name" {...field} data-testid="org-name-input" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={orgForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description (Optional)</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Enter organization description" {...field} data-testid="org-description-input" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end space-x-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setOrgDialogOpen(false)}
                          data-testid="cancel-org-button"
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={createOrgMutation.isPending}
                          data-testid="submit-org-button"
                        >
                          {createOrgMutation.isPending ? "Creating..." : "Create Organization"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {organizations?.map((org) => (
                <div
                  key={org.id}
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                  data-testid={`organization-${org.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3
                          className="font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                          data-testid={`organization-link-${org.id}`}
                          onClick={() => onOrganizationClick(org.id, org.name)}
                        >
                          {org.name}
                        </h3>
                        {org.isActive === false && (
                          <Badge variant="secondary" className="bg-gray-200 text-gray-700">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      {user?.isSiteAdmin && (
                        <p className="text-xs text-blue-500 mt-1">Click to switch to organization view</p>
                      )}
                      {org.description && (
                        <p className="text-sm text-gray-600 mt-1">{org.description}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        Created: {new Date(org.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Site Admin Actions */}
                    {user?.isSiteAdmin && (
                      <div className="flex items-center gap-2 ml-4">
                        {/* Deactivate/Activate Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({
                            id: org.id,
                            isActive: org.isActive === false
                          })}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`toggle-status-${org.id}`}
                        >
                          {org.isActive === false ? (
                            <Power className="h-4 w-4" />
                          ) : (
                            <PowerOff className="h-4 w-4" />
                          )}
                        </Button>

                        {/* Delete Button */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              data-testid={`delete-org-${org.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Organization</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to permanently delete <strong>{org.name}</strong>?
                                <br /><br />
                                This will also delete:
                                <ul className="list-disc list-inside mt-2 space-y-1">
                                  <li>All teams in this organization</li>
                                  <li>All user-organization relationships</li>
                                  <li>All pending invitations</li>
                                </ul>
                                <br />
                                <strong>This action cannot be undone.</strong>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteOrgMutation.mutate(org.id)}
                                className="bg-red-600 hover:bg-red-700"
                                data-testid={`confirm-delete-${org.id}`}
                              >
                                Delete Organization
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {!organizations?.length && (
                <p className="text-gray-500 text-center py-8">No organizations created yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-900">Organization Management</h3>
                <ol className="mt-2 text-sm text-blue-800 space-y-1">
                  <li>1. Create organizations for different schools, clubs, or teams</li>
                  <li>2. Assign org admins to manage each organization</li>
                  <li>3. Org admins can create teams and manage users within their organization</li>
                  <li>4. Use the User Management section to invite and manage users</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}