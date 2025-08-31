import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, Link as LinkIcon, User, CheckCircle, XCircle, Clock } from "lucide-react";
import { Link } from "wouter";

type Organization = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  users: {
    id: string;
    userId: string;
    organizationId: string;
    role: string;
    createdAt: string;
    user: {
      id: string;
      username: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      isActive: string;
      createdAt: string;
    };
  }[];
  invitations: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
    isUsed: string;
    expiresAt: string;
    createdAt: string;
    token: string;
  }[];
};

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["athlete", "coach", "org_admin", "site_admin"]),
  organizationId: z.string().optional(),
});

const siteAdminSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  password: z.string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character"),
});

type SiteAdmin = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: string;
  createdAt: string;
};


export default function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [siteAdminDialogOpen, setSiteAdminDialogOpen] = useState(false);

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/organizations-with-users"],
  });

  const { data: siteAdmins = [] } = useQuery<SiteAdmin[]>({
    queryKey: ["/api/site-admins"],
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
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

  const siteAdminForm = useForm({
    resolver: zodResolver(siteAdminSchema),
    defaultValues: {
      username: "",
      firstName: "",
      lastName: "",
      password: "",
    },
  });

  // Auto-select first organization when data loads
  useEffect(() => {
    if (organizations && organizations.length > 0) {
      inviteForm.setValue("organizationId", organizations[0].id);
    }
  }, [organizations, inviteForm]);

  const sendInviteMutation = useMutation({
    mutationFn: async (data: z.infer<typeof inviteSchema>) => {
      const res = await apiRequest("POST", "/api/invitations", data);
      return res.json();
    },
    onSuccess: (data) => {
      // Refresh the organizations and users list
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
      
      if (data.inviteLink) {
        navigator.clipboard.writeText(data.inviteLink);
        toast({ 
          title: "Invitation sent successfully!", 
          description: `Invitation link copied to clipboard. ${data.email} will receive access once they accept the invitation.`
        });
      } else {
        toast({ 
          title: "Invitation created successfully!", 
          description: `Invitation sent to ${data.email}. They will appear in the user list once they accept the invitation.`
        });
      }
      setUserDialogOpen(false);
      inviteForm.reset();
      
      // Reset form to first organization
      if (organizations && organizations.length > 0) {
        inviteForm.setValue("organizationId", organizations[0].id);
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "Error sending invitation", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const createSiteAdminMutation = useMutation({
    mutationFn: async (data: z.infer<typeof siteAdminSchema>) => {
      const res = await apiRequest("POST", "/api/site-admins", data);
      return res.json();
    },
    onSuccess: (data) => {
      // Refresh the site admins list
      queryClient.invalidateQueries({ queryKey: ["/api/site-admins"] });
      
      toast({ 
        title: "Site admin created successfully!", 
        description: `${data.user.firstName} ${data.user.lastName} has been created as a site admin.`
      });
      setSiteAdminDialogOpen(false);
      siteAdminForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error creating site admin", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

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

  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/users/${userId}/status`, { isActive });
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
      toast({ 
        title: "User status updated!", 
        description: `User has been ${variables.isActive ? 'activated' : 'deactivated'}`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error updating user status", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const onSendInvite = (data: z.infer<typeof inviteSchema>) => {
    sendInviteMutation.mutate(data);
  };

  const onCreateSiteAdmin = (data: z.infer<typeof siteAdminSchema>) => {
    createSiteAdminMutation.mutate(data);
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    updateUserRoleMutation.mutate({ userId, role: newRole });
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    if (confirm(`Are you sure you want to delete ${userName}? This action cannot be undone.`)) {
      deleteUserMutation.mutate(userId);
    }
  };

  const handleToggleUserStatus = (userId: string, userName: string, currentStatus: string) => {
    const isCurrentlyActive = currentStatus === "true";
    const action = isCurrentlyActive ? "deactivate" : "activate";
    
    if (confirm(`Are you sure you want to ${action} ${userName}?`)) {
      toggleUserStatusMutation.mutate({ userId, isActive: !isCurrentlyActive });
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
      
      // Refresh the user list
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
      
      if (data.inviteLink) {
        await navigator.clipboard.writeText(data.inviteLink);
        toast({
          title: "New invitation link generated!",
          description: `Link for ${firstName} ${lastName} copied to clipboard. They will appear in the user list once they accept.`,
        });
      } else {
        toast({
          title: "New invitation created",
          description: `Invitation sent to ${firstName} ${lastName}. They will appear once they accept.`,
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

  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("DELETE", `/api/invitations/${invitationId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
      toast({
        title: "Invitation deleted",
        description: "The invitation has been removed successfully."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting invitation",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const handleDeleteInvitation = (invitationId: string, email: string) => {
    if (window.confirm(`Are you sure you want to delete the invitation for ${email}?`)) {
      deleteInvitationMutation.mutate(invitationId);
    }
  };

  const copyExistingInviteLink = async (invitation: any) => {
    try {
      // Get the invitation details to build the link
      const inviteLink = `${window.location.protocol}//${window.location.host}/register?token=${invitation.token}`;
      
      await navigator.clipboard.writeText(inviteLink);
      toast({
        title: "Invitation link copied!",
        description: `Link for ${invitation.email} copied to clipboard.`,
      });
    } catch (error: any) {
      toast({
        title: "Error copying invite link",
        description: error.message,
        variant: "destructive"
      });
    }
  };



  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-1">Manage users and send invitations</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Send Invitation */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <CardTitle>Send Invitation</CardTitle>
              </div>
              <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="send-invitation-button">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Send Invitation
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Send User Invitation</DialogTitle>
                    <DialogDescription>
                      Send an invitation link to a new user
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
                                <Input placeholder="John" {...field} data-testid="invite-firstname-input" />
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
                                <Input placeholder="Doe" {...field} data-testid="invite-lastname-input" />
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
                            <FormLabel>Email Address</FormLabel>
                            <FormControl>
                              <Input placeholder="john.doe@example.com" {...field} data-testid="invite-email-input" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={inviteForm.control}
                        name="role"
                        render={({ field }) => {
                          const selectedOrgId = inviteForm.watch("organizationId");
                          const isOrgUser = selectedOrgId && selectedOrgId.length > 0;
                          
                          return (
                            <FormItem>
                              <FormLabel>Role</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="invite-role-select">
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="athlete">Athlete</SelectItem>
                                  <SelectItem value="coach">Coach</SelectItem>
                                  <SelectItem value="org_admin">Org Admin</SelectItem>
                                  {/* Site Admin only available for users not tied to organizations */}
                                  {!isOrgUser && (
                                    <SelectItem value="site_admin">Site Admin</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                              {isOrgUser && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Note: Each user can only have one role. Athletes cannot be coaches/admins.
                                </p>
                              )}
                            </FormItem>
                          );
                        }}
                      />
                      <FormField
                        control={inviteForm.control}
                        name="organizationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organization</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="invite-org-select">
                                  <SelectValue placeholder="Select organization" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {organizations?.map((org) => (
                                  <SelectItem key={org.id} value={org.id}>
                                    {org.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end space-x-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setUserDialogOpen(false)}
                          data-testid="cancel-invite-button"
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={sendInviteMutation.isPending}
                          data-testid="submit-invite-button"
                        >
                          {sendInviteMutation.isPending ? "Sending..." : "Send Invitation"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Site Administrators Section */}
              <div className="space-y-3 border-b pb-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Site
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      {siteAdmins.length} site admins
                    </span>
                    <Dialog open={siteAdminDialogOpen} onOpenChange={setSiteAdminDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" data-testid="add-site-admin-button">
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add new site admin
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Site Administrator</DialogTitle>
                          <DialogDescription>
                            Create a new site administrator account
                          </DialogDescription>
                        </DialogHeader>
                        <Form {...siteAdminForm}>
                          <form onSubmit={siteAdminForm.handleSubmit(onCreateSiteAdmin)} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={siteAdminForm.control}
                                name="firstName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>First Name</FormLabel>
                                    <FormControl>
                                      <Input placeholder="John" {...field} data-testid="site-admin-firstname-input" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={siteAdminForm.control}
                                name="lastName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Last Name</FormLabel>
                                    <FormControl>
                                      <Input placeholder="Doe" {...field} data-testid="site-admin-lastname-input" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <FormField
                              control={siteAdminForm.control}
                              name="username"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Username</FormLabel>
                                  <FormControl>
                                    <Input placeholder="johndoe" {...field} data-testid="site-admin-username-input" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={siteAdminForm.control}
                              name="password"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Password</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="password" 
                                      placeholder="Min 12 chars, uppercase, lowercase, number, special char" 
                                      {...field} 
                                      data-testid="site-admin-password-input" 
                                    />
                                  </FormControl>
                                  <div className="text-xs text-gray-500 mt-1">
                                    Password must be at least 12 characters and include:
                                    <br />• Uppercase letter (A-Z) • Lowercase letter (a-z) • Number (0-9) • Special character (!@#$%^&*)
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className="flex justify-end space-x-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setSiteAdminDialogOpen(false)}
                                data-testid="cancel-site-admin-button"
                              >
                                Cancel
                              </Button>
                              <Button 
                                type="submit" 
                                disabled={createSiteAdminMutation.isPending}
                                data-testid="submit-site-admin-button"
                              >
                                {createSiteAdminMutation.isPending ? "Creating..." : "Create Site Admin"}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {/* Active Site Admins */}
                  {siteAdmins.map((admin) => (
                    <div 
                      key={admin.id} 
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <div>
                            <p className="font-medium text-gray-900" data-testid={`site-admin-name-${admin.id}`}>
                              <Link href={`/profile`} className="hover:text-primary">
                                {admin.firstName} {admin.lastName}
                              </Link>
                            </p>
                            <p className="text-sm text-gray-600" data-testid={`site-admin-email-${admin.id}`}>
                              {admin.email.replace('@admin.local', '')} • <span className="text-green-600">Active</span>
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 px-2 py-1 bg-gray-200 rounded">
                          Site Admin
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteUser(admin.id, `${admin.firstName} ${admin.lastName}`)}
                          data-testid={`site-admin-delete-${admin.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {siteAdmins.length === 0 && (
                    <p className="text-gray-500 text-sm py-4">No site administrators</p>
                  )}
                </div>
              </div>

              {/* All Users */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">All Users</h3>
                  <span className="text-sm text-gray-500">
                    {allUsers.length} total users
                  </span>
                </div>
                
                <div className="space-y-2">
                  {allUsers.map((user) => {
                    // Find organization associations for this user
                    const userOrgs = organizations?.flatMap(org => 
                      org.users?.filter(userOrg => userOrg.user.id === user.id) || []
                    ) || [];
                    
                    return (
                      <div 
                        key={user.id} 
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            {user.isActive === "true" ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <div>
                              <p className="font-medium text-gray-900" data-testid={`user-name-${user.id}`}>
                                <Link href={`/users/${user.id}`} className="hover:text-primary">
                                  {user.firstName} {user.lastName}
                                </Link>
                              </p>
                              <p className="text-sm text-gray-600" data-testid={`user-details-${user.id}`}>
                                @{user.username} • {user.email}
                              </p>
                              {userOrgs.length > 0 && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Organizations: {userOrgs.map(uo => uo.role).join(', ')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className={`text-sm px-2 py-1 rounded ${
                            user.isSiteAdmin === "true" 
                              ? "bg-purple-100 text-purple-800" 
                              : userOrgs.length > 0 
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                          }`}>
                            {user.isSiteAdmin === "true" 
                              ? "Site Admin" 
                              : userOrgs.length > 0 
                                ? `${userOrgs[0].role}` 
                                : "Unassigned"}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const isActive = user.isActive === "true";
                              handleToggleUserStatus(user.id, !isActive);
                            }}
                            data-testid={`user-toggle-${user.id}`}
                          >
                            {user.isActive === "true" ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteUser(user.id, `${user.firstName} ${user.lastName}`)}
                            data-testid={`user-delete-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {allUsers.length === 0 && (
                    <p className="text-gray-500 text-sm py-4">No users found</p>
                  )}
                </div>
              </div>

              {/* Users by Organization */}
              {organizations?.map((org: Organization) => (
                <div key={org.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">{org.name}</h3>
                    <span className="text-sm text-gray-500">
                      {org.users?.length || 0} users
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    {/* Active Users */}
                    {org.users?.map((userOrg) => (
                      <div 
                        key={userOrg.id} 
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            {userOrg.user.isActive === "true" ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <div>
                              <p className="font-medium text-gray-900" data-testid={`user-name-${userOrg.user.id}`}>
                                {userOrg.user.firstName} {userOrg.user.lastName}
                              </p>
                              <p className="text-sm text-gray-600" data-testid={`user-username-${userOrg.user.id}`}>
                                @{userOrg.user.username} • <span className={userOrg.user.isActive === "true" ? "text-green-600" : "text-red-600"}>
                                  {userOrg.user.isActive === "true" ? "Active" : "Inactive"}
                                </span>
                              </p>
                            </div>
                            <div className="ml-4">
                              <select
                                value={userOrg.user.role}
                                onChange={(e) => {
                                  const newRole = e.target.value;
                                  const currentRole = userOrg.user.role;
                                  
                                  // Validate role transitions
                                  if ((currentRole === 'athlete' && (newRole === 'coach' || newRole === 'org_admin')) ||
                                      ((currentRole === 'coach' || currentRole === 'org_admin') && newRole === 'athlete')) {
                                    if (!confirm('Athletes cannot be coaches or admins, and coaches/admins cannot be athletes. Are you sure you want to change this role?')) {
                                      return;
                                    }
                                  }
                                  
                                  handleRoleChange(userOrg.user.id, newRole);
                                }}
                                className="text-sm border border-gray-300 rounded px-2 py-1"
                                data-testid={`user-role-select-${userOrg.user.id}`}
                              >
                                <option value="athlete">Athlete</option>
                                <option value="coach">Coach</option>
                                <option value="org_admin">Org Admin</option>
                                {/* Site Admin not available for organization users */}
                              </select>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleUserStatus(
                              userOrg.user.id,
                              `${userOrg.user.firstName} ${userOrg.user.lastName}`,
                              userOrg.user.isActive
                            )}
                            className={userOrg.user.isActive === "true" ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"}
                            data-testid={`user-toggle-status-${userOrg.user.id}`}
                          >
                            {userOrg.user.isActive === "true" ? (
                              <XCircle className="h-4 w-4" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
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

                    {/* Pending Invitations */}
                    {org.invitations?.map((invitation) => {
                      const isExpired = new Date() > new Date(invitation.expiresAt);
                      const isUsed = invitation.isUsed === "true";
                      
                      return (
                        <div 
                          key={invitation.id} 
                          className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              {isUsed ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : isExpired ? (
                                <XCircle className="h-4 w-4 text-red-600" />
                              ) : (
                                <Clock className="h-4 w-4 text-yellow-600" />
                              )}
                              <div>
                                <p className="font-medium text-gray-900" data-testid={`invitation-email-${invitation.id}`}>
                                  {invitation.email}
                                </p>
                                <p className="text-sm text-gray-600">
                                  {invitation.role} • 
                                  {isUsed ? (
                                    <span className="text-green-600 ml-1">Accepted</span>
                                  ) : isExpired ? (
                                    <span className="text-red-600 ml-1">Expired</span>
                                  ) : (
                                    <span className="text-yellow-600 ml-1">Pending</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {!isUsed && !isExpired && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyExistingInviteLink(invitation)}
                                data-testid={`invitation-copy-link-${invitation.id}`}
                              >
                                <LinkIcon className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteInvitation(invitation.id, invitation.email)}
                              data-testid={`invitation-delete-${invitation.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    {(!org.users || org.users.length === 0) && (!org.invitations || org.invitations.length === 0) && (
                      <p className="text-gray-500 text-sm py-4">No users or pending invitations in this organization</p>
                    )}
                  </div>
                </div>
              ))}

              {!organizations?.length && (
                <p className="text-gray-500 text-center py-8">No organizations available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}