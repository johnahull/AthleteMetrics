import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

type Organization = {
  id: string;
  name: string;
  description?: string;
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
    queryKey: ["/api/organizations"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
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

  const onCreateOrg = (data: z.infer<typeof organizationSchema>) => {
    createOrgMutation.mutate(data);
  };

  const onOrganizationClick = (orgId: string, orgName: string) => {
    // Site admins can switch to organization context
    if (user?.isSiteAdmin) {
      setOrganizationContext(orgId);
      setLocation('/');  // Go to dashboard in org context
      toast({ 
        title: `Switched to ${orgName}`,
        description: "Now viewing organization-specific data. Use 'Back to Site' to return to site view.",
      });
    } else {
      // Other users go directly to organization profile
      setLocation(`/organizations/${orgId}`);
    }
  };

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
                  <h3 
                    className="font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer" 
                    data-testid={`organization-link-${org.id}`}
                    onClick={() => onOrganizationClick(org.id, org.name)}
                  >
                    {org.name}
                  </h3>
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