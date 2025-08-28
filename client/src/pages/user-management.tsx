import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, Link } from "lucide-react";

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
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      isActive: string;
      createdAt: string;
    };
  }[];
};

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["athlete", "coach", "org_admin", "site_admin"]),
  organizationId: z.string().optional(),
});

export default function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/organizations-with-users"],
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

  const onSendInvite = (data: z.infer<typeof inviteSchema>) => {
    sendInviteMutation.mutate(data);
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    updateUserRoleMutation.mutate({ userId, role: newRole });
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    if (confirm(`Are you sure you want to delete ${userName}? This action cannot be undone.`)) {
      deleteUserMutation.mutate(userId);
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
                        render={({ field }) => (
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
                                <SelectItem value="site_admin">Site Admin</SelectItem>
                              </SelectContent>
                            </Select>
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
                                <select
                                  value={userOrg.user.role}
                                  onChange={(e) => handleRoleChange(userOrg.user.id, e.target.value)}
                                  className="text-sm border border-gray-300 rounded px-2 py-1"
                                  data-testid={`user-role-select-${userOrg.user.id}`}
                                >
                                  <option value="athlete">Athlete</option>
                                  <option value="coach">Coach</option>
                                  <option value="org_admin">Org Admin</option>
                                  <option value="site_admin">Site Admin</option>
                                </select>
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
                <p className="text-gray-500 text-center py-8">No organizations available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}