import { useState, useEffect } from "react";
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
import { useAuth } from "@/lib/auth";
import { Plus, Building2, Users, UserPlus, Trash2, Edit3, Link, Ban, RotateCcw } from "lucide-react";
import DeleteOrganizationModal from "@/components/delete-organization-modal";
import { mutations } from "@/lib/api";

const organizationSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  description: z.string().optional(),
});

const inviteSchema = z.object({
  email: z.string().email("Invalid email"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["site_admin", "org_admin", "coach", "athlete"]),
  organizationId: z.string().min(1, "Organization is required"),
});

type Organization = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt: string;
  users: {
    id: string;
    userId: string;
    organizationId: string;
    role: string;
    createdAt: string;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      isActive: boolean;
      isSiteAdmin: boolean;
      createdAt: string;
    };
  }[];
};

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/organizations-with-users"],
  });

  const orgForm = useForm({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const inviteForm = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "athlete" as const,
      organizationId: "",
    },
  });

  // Update organizationId when organizations load
  useEffect(() => {
    if (organizations && organizations.length > 0 && !inviteForm.getValues("organizationId")) {
      inviteForm.setValue("organizationId", organizations[0].id);
    }
  }, [organizations, inviteForm]);

  const createOrgMutation = useMutation({
    mutationFn: async (data: z.infer<typeof organizationSchema>) => {
      const res = await apiRequest("POST", "/api/organizations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
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

  const sendInviteMutation = useMutation({
    mutationFn: async (data: z.infer<typeof inviteSchema>) => {
      const res = await apiRequest("POST", "/api/invitations", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.inviteLink) {
        navigator.clipboard.writeText(data.inviteLink);
        toast({ 
          title: "Invitation sent successfully!", 
          description: `Link for ${data.email} copied to clipboard`
        });
      } else {
        toast({ 
          title: "Invitation created successfully!", 
          description: `Invitation token: ${data.token || 'generated'}`
        });
      }
      setUserDialogOpen(false);
      inviteForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error sending invitation", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const onCreateOrg = (data: z.infer<typeof organizationSchema>) => {
    createOrgMutation.mutate(data);
  };

  const onSendInvite = (data: z.infer<typeof inviteSchema>) => {
    sendInviteMutation.mutate(data);
  };

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PUT", `/api/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
      toast({ title: "User role updated successfully!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error updating user role", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/users/${userId}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
      toast({ title: "User deleted successfully!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error deleting user", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleRoleChange = (userId: string, newRole: string) => {
    updateUserRoleMutation.mutate({ userId, role: newRole });
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    if (confirm(`Are you sure you want to delete ${userName}? This action cannot be undone.`)) {
      deleteUserMutation.mutate(userId);
    }
  };

  const deactivateOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      return mutations.deactivateOrganization(orgId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({ title: "Organization deactivated successfully!" });
    },
    onError: (error: any) => {
      toast({
        title: "Error deactivating organization",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const reactivateOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      return mutations.reactivateOrganization(orgId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({ title: "Organization reactivated successfully!" });
    },
    onError: (error: any) => {
      toast({
        title: "Error reactivating organization",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async ({ orgId, confirmationName }: { orgId: string; confirmationName: string }) => {
      return mutations.deleteOrganization(orgId, confirmationName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({ title: "Organization deleted successfully!" });
      setDeleteModalOpen(false);
      setSelectedOrganization(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting organization",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const handleDeactivateOrg = (org: Organization) => {
    if (confirm(`Are you sure you want to deactivate ${org.name}? This can be undone later.`)) {
      deactivateOrgMutation.mutate(org.id);
    }
  };

  const handleReactivateOrg = (org: Organization) => {
    reactivateOrgMutation.mutate(org.id);
  };

  const handleDeleteOrg = (org: Organization) => {
    setSelectedOrganization(org);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = (confirmationName: string) => {
    if (selectedOrganization) {
      deleteOrgMutation.mutate({ orgId: selectedOrganization.id, confirmationName });
    }
  };

  const generateInviteLink = async (email: string, firstName: string, lastName: string, role: string, organizationId?: string) => {
    try {
      const res = await apiRequest("POST", "/api/invitations", {
        email,
        firstName,
        lastName,
        role,
        organizationId
      });
      const data = await res.json();

      if (data.inviteLink) {
        await navigator.clipboard.writeText(data.inviteLink);
        toast({
          title: "Invitation link copied!",
          description: `Link copied: ${data.inviteLink.substring(0, 50)}...`,
        });
      } else {
        toast({
          title: "Invitation created",
          description: `Token: ${data.token}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error generating invite link",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Site Administration</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Organizations Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organizations
            </CardTitle>
            <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-create-organization">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Organization
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Organization</DialogTitle>
                  <DialogDescription>
                    Add a new organization to the system. Organizations can contain multiple teams and users.
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
                            <Input 
                              placeholder="Enter organization name" 
                              {...field} 
                              data-testid="input-org-name"
                            />
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
                            <Textarea 
                              placeholder="Enter organization description" 
                              {...field} 
                              data-testid="input-org-description"
                            />
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
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createOrgMutation.isPending}
                        data-testid="button-submit-organization"
                      >
                        {createOrgMutation.isPending ? "Creating..." : "Create Organization"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {organizations?.map((org: Organization) => (
                <div
                  key={org.id}
                  className={`p-3 border rounded-lg ${org.isActive ? '' : 'bg-gray-100 opacity-60'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold" data-testid={`org-name-${org.id}`}>
                          {org.name}
                        </h3>
                        {!org.isActive && (
                          <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded border border-yellow-300">
                            Deactivated
                          </span>
                        )}
                      </div>
                      {org.description && (
                        <p className="text-sm text-gray-600 mt-1" data-testid={`org-description-${org.id}`}>
                          {org.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Created: {new Date(org.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {org.isActive ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeactivateOrg(org)}
                            disabled={deactivateOrgMutation.isPending}
                            data-testid={`deactivate-org-${org.id}`}
                            className="text-yellow-600 hover:text-yellow-700"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteOrg(org)}
                            disabled={deleteOrgMutation.isPending}
                            data-testid={`delete-org-${org.id}`}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReactivateOrg(org)}
                          disabled={reactivateOrgMutation.isPending}
                          data-testid={`reactivate-org-${org.id}`}
                          className="text-green-600 hover:text-green-700"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!organizations?.length && (
                <p className="text-gray-500 text-center py-4">No organizations created yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Users Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>
            <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-send-invitation">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Send Invitation
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send User Invitation</DialogTitle>
                  <DialogDescription>
                    Send an invitation email to a new user. They will receive a secure link to set their password and join the system.
                  </DialogDescription>
                </DialogHeader>
                <Form {...inviteForm}>
                  <form onSubmit={inviteForm.handleSubmit(onSendInvite)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={inviteForm.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="John" 
                                {...field} 
                                data-testid="input-user-first-name"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={inviteForm.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Doe" 
                                {...field} 
                                data-testid="input-user-last-name"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={inviteForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input 
                              type="email"
                              placeholder="john@example.com" 
                              {...field} 
                              data-testid="input-user-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={inviteForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <FormControl>
                            <select 
                              {...field} 
                              className="w-full p-2 border border-gray-300 rounded-md"
                              data-testid="select-user-role"
                            >
                              <option value="athlete">Athlete</option>
                              <option value="coach">Coach</option>
                              <option value="org_admin">Organization Admin</option>
                              <option value="site_admin">Site Admin</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={inviteForm.control}
                      name="organizationId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Organization</FormLabel>
                          <FormControl>
                            <select 
                              {...field} 
                              className="w-full p-2 border border-gray-300 rounded-md"
                              data-testid="select-user-organization"
                            >
                              <option value="">Select organization...</option>
                              {organizations?.map((org: Organization) => (
                                <option key={org.id} value={org.id}>
                                  {org.name}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setUserDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={sendInviteMutation.isPending}
                        data-testid="button-send-invitation"
                      >
                        {sendInviteMutation.isPending ? "Sending..." : "Send Invitation"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Users by Organization */}
              {organizations?.map((org: Organization) => (
                <div key={org.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">{org.name}</h3>
                    <span className="text-sm text-gray-500">
                      {org.users?.length || 0} users
                    </span>
                  </div>
                  
                  {org.users && org.users.length > 0 ? (
                    <div className="space-y-2">
                      {org.users.map((userOrg) => (
                        <div 
                          key={userOrg.user.id} 
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <div>
                                <p className="font-medium text-gray-900" data-testid={`user-name-${userOrg.user.id}`}>
                                  {userOrg.user.firstName} {userOrg.user.lastName}
                                </p>
                                <p className="text-sm text-gray-600" data-testid={`user-email-${userOrg.user.id}`}>
                                  {userOrg.user.email}
                                </p>
                              </div>
                              <div className="ml-4">
                                {userOrg.user.isSiteAdmin === true ? (
                                  <span className="text-sm px-3 py-1 bg-purple-100 text-purple-800 rounded border border-purple-300 font-medium">
                                    Site Admin
                                  </span>
                                ) : (
                                  <select
                                    value={userOrg.role}
                                    onChange={(e) => handleRoleChange(userOrg.user.id, e.target.value)}
                                    disabled={userOrg.user.id === currentUser?.id}
                                    className="text-sm border border-gray-300 rounded px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                    data-testid={`user-role-select-${userOrg.user.id}`}
                                    title={userOrg.user.id === currentUser?.id ? "Cannot change your own role" : ""}
                                  >
                                    <option value="athlete">Athlete</option>
                                    <option value="coach">Coach</option>
                                    <option value="org_admin">Org Admin</option>
                                  </select>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => generateInviteLink(
                                userOrg.user.email,
                                userOrg.user.firstName,
                                userOrg.user.lastName,
                                userOrg.user.role,
                                org.id
                              )}
                              data-testid={`user-invite-link-${userOrg.user.id}`}
                            >
                              <Link className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteUser(
                                userOrg.user.id,
                                `${userOrg.user.firstName} ${userOrg.user.lastName}`
                              )}
                              data-testid={`user-delete-${userOrg.user.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm py-4">No users in this organization</p>
                  )}
                </div>
              ))}

              {!organizations?.length && (
                <p className="text-gray-500 text-center py-8">No organizations created yet</p>
              )}

              <div className="space-y-4 pt-6 border-t">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="font-semibold text-blue-900">Getting Started</h3>
                  <ol className="mt-2 text-sm text-blue-800 space-y-1">
                    <li>1. Create organizations for different schools, clubs, or teams</li>
                    <li>2. Send invitations to users via email</li>
                    <li>3. Manage user roles and permissions</li>
                    <li>4. Create teams within organizations</li>
                  </ol>
                </div>
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h4 className="font-semibold text-green-900">Default Admin Account</h4>
                  <p className="text-sm text-green-800 mt-1">
                    <strong>Email:</strong> admin@athleteperformancehub.com<br />
                    <strong>Password:</strong> admin123
                  </p>
                  <p className="text-xs text-green-700 mt-2">
                    Use this account to log in with the new email-based system
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Organization Modal */}
      {selectedOrganization && (
        <DeleteOrganizationModal
          organization={selectedOrganization}
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setSelectedOrganization(null);
          }}
          onConfirm={handleConfirmDelete}
          isLoading={deleteOrgMutation.isPending}
        />
      )}
    </div>
  );
}