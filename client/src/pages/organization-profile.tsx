import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Building2, Users, UserCog, MapPin, Mail, Phone, Plus, UserPlus, Send, Clock, CheckCircle, AlertCircle, Trash2, Copy, RefreshCw, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Form schemas
const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  roles: z.array(z.enum(["org_admin", "coach"])).min(1, "At least one role must be selected"),
});

const invitationSchema = z.object({
  email: z.string().email("Invalid email format"),
  roles: z.array(z.enum(["org_admin", "coach"])).min(1, "At least one role must be selected"),
});

type CreateUserForm = z.infer<typeof createUserSchema>;
type InvitationForm = z.infer<typeof invitationSchema>;

type OrganizationProfile = {
  id: string;
  name: string;
  description?: string;
  location?: string;
  coaches: Array<{
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      isActive?: string;
    };
    roles: string[];
  }>;
  players: Array<{
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    birthYear: number;
    school?: string;
    sports: string[];
    emails: string[];
    phoneNumbers: string[];
    teams: Array<{
      id: string;
      name: string;
      level?: string;
      organization: {
        id: string;
        name: string;
      };
    }>;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    invitedBy: string;
    token: string;
    isUsed: string;
    expiresAt: string;
    createdAt: string;
  }>;
};

// User Management Modal Component
function UserManagementModal({ organizationId }: { organizationId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();


  const createUserForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      roles: ["coach"],
    },
  });

  const invitationForm = useForm<InvitationForm>({
    resolver: zodResolver(invitationSchema),
    defaultValues: {
      email: "",
      roles: ["coach"],
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserForm) => {
      const response = await fetch(`/api/organizations/${organizationId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create user");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/profile`] });
      createUserForm.reset();
      toast({ title: "Success", description: "User created successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create user",
        variant: "destructive" 
      });
    },
  });

  const invitationMutation = useMutation({
    mutationFn: async (data: InvitationForm) => {
      const response = await fetch(`/api/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          role: data.roles[0], // Take the first role from the array
          organizationId
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to send invitation";
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch (parseError) {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        return response.json();
      } else {
        throw new Error("Server returned non-JSON response");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/profile`] });
      invitationForm.reset();
      toast({ title: "Success", description: "Invitation sent successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to send invitation",
        variant: "destructive" 
      });
    },
  });

  // Show for org admins, coaches, and site admins
  // Get user's organizations to check their role
  const { data: userOrganizations } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id && !user?.isSiteAdmin,
  });

  const isOrgAdmin = Array.isArray(userOrganizations) && userOrganizations.some(org => org.organizationId === organizationId && org.role === "org_admin");
  const isCoach = Array.isArray(userOrganizations) && userOrganizations.some(org => org.organizationId === organizationId && org.role === "coach");
  const isSiteAdmin = user?.isSiteAdmin;

  if (!isOrgAdmin && !isCoach && !isSiteAdmin) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Manage Users
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>User Management</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="create" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create User</TabsTrigger>
            <TabsTrigger value="invite">Send Invitation</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4">
            <Form {...createUserForm}>
              <form onSubmit={createUserForm.handleSubmit((data) => createUserMutation.mutate(data))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createUserForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-first-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createUserForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-last-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={createUserForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createUserForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} data-testid="input-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createUserForm.control}
                  name="roles"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Roles</FormLabel>
                      <div className="space-y-2">
                        {[
                          { value: "coach", label: "Coach" },
                          { value: "org_admin", label: "Organization Admin" },
                        ].map((role) => (
                          <div key={role.value} className="flex items-center space-x-2">
                            <Checkbox
                              id={`role-${role.value}`}
                              checked={field.value?.includes(role.value as any)}
                              onCheckedChange={(checked) => {
                                const currentRoles = field.value || [];
                                if (checked) {
                                  field.onChange([...currentRoles, role.value]);
                                } else {
                                  field.onChange(currentRoles.filter((r: string) => r !== role.value));
                                }
                              }}
                              data-testid={`checkbox-role-${role.value}`}
                            />
                            <label
                              htmlFor={`role-${role.value}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {role.label}
                            </label>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={createUserMutation.isPending}
                  data-testid="button-create-user"
                >
                  {createUserMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="invite" className="space-y-4">
            <Form {...invitationForm}>
              <form onSubmit={invitationForm.handleSubmit((data) => invitationMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={invitationForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-invite-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={invitationForm.control}
                  name="roles"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Roles</FormLabel>
                      <div className="space-y-2">
                        {[
                          { value: "coach", label: "Coach" },
                          { value: "org_admin", label: "Organization Admin" },
                        ].map((role) => (
                          <div key={role.value} className="flex items-center space-x-2">
                            <Checkbox
                              id={`invite-role-${role.value}`}
                              checked={field.value?.includes(role.value as any)}
                              onCheckedChange={(checked) => {
                                const currentRoles = field.value || [];
                                if (checked) {
                                  field.onChange([...currentRoles, role.value]);
                                } else {
                                  field.onChange(currentRoles.filter((r: string) => r !== role.value));
                                }
                              }}
                              data-testid={`checkbox-invite-role-${role.value}`}
                            />
                            <label
                              htmlFor={`invite-role-${role.value}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {role.label}
                            </label>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={invitationMutation.isPending}
                  data-testid="button-send-invitation"
                >
                  {invitationMutation.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default function OrganizationProfile() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();


  // Get user's organizations to check if they're an org admin
  const { data: userOrganizations } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id && !user?.isSiteAdmin,
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache at all
    refetchOnMount: true,
    refetchOnWindowFocus: true, // Enable refetch on focus
  });

  const isOrgAdmin = Array.isArray(userOrganizations) && userOrganizations.some((org: any) => org.organizationId === id && org.role === "org_admin");
  const isCoach = Array.isArray(userOrganizations) && userOrganizations.some((org: any) => org.organizationId === id && org.role === "coach");
  const hasOrgAccess = isOrgAdmin || isCoach;

  // Check if user has access to this specific organization
  const userHasAccessToOrg = user?.isSiteAdmin || hasOrgAccess;

  // Fetch organization data - needs to be declared before useEffect hooks that use it
  const { data: organization, isLoading, error } = useQuery<OrganizationProfile>({
    queryKey: [`/api/organizations/${id}/profile`],
    enabled: !!id && userHasAccessToOrg,
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache at all (renamed from cacheTime in v5)
    refetchOnMount: true,
    refetchOnWindowFocus: true, // Enable refetch on focus to catch updates
    refetchInterval: false, // Disable automatic polling
    retry: 2, // Retry failed requests
  });

  // Auto-redirect non-site admins to their primary organization if they try to access a different one
  useEffect(() => {
    if (!user?.isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0 && id) {
      const userBelongsToRequestedOrg = userOrganizations.some((org: any) => org.organizationId === id);

      if (!userBelongsToRequestedOrg) {
        // Redirect to user's primary organization
        const primaryOrg = userOrganizations[0];
        console.log(`Redirecting user from org ${id} to their primary org ${primaryOrg.organizationId}`);
        setLocation(`/organizations/${primaryOrg.organizationId}`);
        return;
      }
    }
  }, [user, userOrganizations, id, setLocation]);

  // Invalidate organization queries when the ID changes to ensure fresh data
  useEffect(() => {
    if (id) {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${id}/profile`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${id}`] });
    }
  }, [id]);

  // Update document title when organization data loads
  useEffect(() => {
    if (organization?.name) {
      document.title = `${organization.name} - Performance Hub`;
    }
    return () => {
      document.title = "Performance Hub";
    };
  }, [organization?.name]);

  // Debug: Log organization data and compare with sidebar data
  useEffect(() => {
    if (organization) {
      console.log('=== ORGANIZATION DATA COMPARISON ===');
      console.log('Page title data (from /api/organizations/${id}/profile):', {
        id: organization.id,
        name: organization.name,
        description: organization.description,
        coaches: organization.coaches.length,
        players: organization.players.length
      });

      if (userOrganizations) {
        const matchingUserOrg = userOrganizations.find((userOrg: any) => userOrg.organizationId === id);
        if (matchingUserOrg) {
          console.log('Sidebar data (from /api/auth/me/organizations):', {
            organizationId: matchingUserOrg.organizationId,
            name: matchingUserOrg.organization.name,
            role: matchingUserOrg.role
          });

          if (matchingUserOrg.organization.name !== organization.name) {
            console.log('❌ DATA MISMATCH DETECTED:');
            console.log('  - Profile endpoint says:', organization.name);
            console.log('  - User orgs endpoint says:', matchingUserOrg.organization.name);
            console.log('  - This suggests the organization name in the database is actually:', organization.name);
          } else {
            console.log('✅ Data is consistent between endpoints');
          }
        }
      }
    }
  }, [organization, userOrganizations]);

  // Force refresh organization data when component mounts
  useEffect(() => {
    if (id) {
      console.log('Force refreshing organization data for ID:', id);
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${id}/profile`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${id}`] });
      // Also invalidate user organizations to sync sidebar data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me/organizations"] });
    }
  }, [id]);

  // Additional cache refresh when userOrganizations loads but organization name doesn't match
  useEffect(() => {
    if (organization && userOrganizations && id) {
      const matchingUserOrg = userOrganizations.find((userOrg: any) => userOrg.organizationId === id);
      if (matchingUserOrg && matchingUserOrg.organization.name !== organization.name) {
        console.log('Detected data mismatch, refreshing all organization caches...');
        // Force refresh both endpoints
        queryClient.invalidateQueries({ queryKey: [`/api/organizations/${id}/profile`] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me/organizations"] });
        // Refetch after a short delay to allow cache clear
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: [`/api/organizations/${id}/profile`] });
          queryClient.refetchQueries({ queryKey: ["/api/auth/me/organizations"] });
        }, 100);
      }
    }
  }, [organization, userOrganizations, id]);

  // Function to send invitation for a user
  const sendInvitation = async (email: string, roles: string[]) => {
    try {
      const response = await fetch(`/api/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email, 
          role: roles[0], // Take the first role from the array
          organizationId: id 
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send invitation");
      }

      await queryClient.invalidateQueries({ queryKey: [`/api/organizations/${id}/profile`] });
      toast({
        title: "Invitation sent",
        description: `Invitation sent to ${email}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Function to delete a user from the organization
  const deleteUser = async (userId: string, userName: string) => {
    try {
      const response = await fetch(`/api/organizations/${id}/users/${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete user");
      }

      await queryClient.invalidateQueries({ queryKey: [`/api/organizations/${id}/profile`] });
      toast({
        title: "User deleted",
        description: `${userName} has been removed from the organization`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Function to delete a pending invitation
  const deletePendingUser = async (invitationId: string, email: string) => {
    try {
      const response = await fetch(`/api/invitations/${invitationId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete invitation");
      }

      await queryClient.invalidateQueries({ queryKey: [`/api/organizations/${id}/profile`] });
      toast({
        title: "Invitation deleted",
        description: `Invitation for ${email} has been removed`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Function to copy invitation URL to clipboard
  const copyInvitationUrl = async (token: string, email: string) => {
    try {
      const inviteUrl = `${window.location.origin}/accept-invitation?token=${token}`;
      await navigator.clipboard.writeText(inviteUrl);
      toast({
        title: "Copied to clipboard",
        description: `Invitation link for ${email} copied successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to copy invitation link",
        variant: "destructive",
      });
    }
  };

  // Function to resend invitation
  const resendInvitation = async (email: string, role: string) => {
    try {
      const response = await fetch(`/api/invitations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          role: role,
          organizationId: id,
          teamIds: []
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to resend invitation");
      }

      await queryClient.invalidateQueries({ queryKey: [`/api/organizations/${id}/profile`] });
      toast({
        title: "Invitation resent",
        description: `New invitation sent to ${email}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Helper function to check if invitation is expired
  const isInvitationExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  // Helper function to format expiration date
  const formatExpirationDate = (expiresAt: string) => {
    const expDate = new Date(expiresAt);
    const now = new Date();
    const isExpired = expDate < now;

    if (isExpired) {
      return `Expired ${expDate.toLocaleDateString()}`;
    } else {
      const diffTime = expDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        return "Expires tomorrow";
      } else if (diffDays <= 7) {
        return `Expires in ${diffDays} days`;
      } else {
        return `Expires ${expDate.toLocaleDateString()}`;
      }
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading organization profile...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-red-600">Failed to load organization profile</p>
        </div>
      </div>
    );
  }

  // Check access control - non-site admins can only view their own organizations
  if (!userHasAccessToOrg) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-red-600">Access denied. You can only view organizations you belong to.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Exit button for site admins */}
      {user?.isSiteAdmin && (
        <div className="mb-2">
          <Link href="/organizations">
            <Button variant="outline" size="sm" data-testid="exit-organization-button">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Organizations
            </Button>
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-gray-900" data-testid="organization-title">{organization.name}</h1>
          </div>
          {organization.location && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="h-4 w-4" />
              <span>{organization.location}</span>
            </div>
          )}
          {organization.description && (
            <p className="text-gray-600 mt-2">{organization.description}</p>
          )}
        </div>

        <UserManagementModal organizationId={id!} />
      </div>

      <div className="space-y-6">
        {/* Coaches Section - First */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Coaches & Administrators ({organization.coaches.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Pending Invitations Section */}
              {organization.invitations && organization.invitations.filter(inv => inv.role !== 'athlete').length > 0 && (
                <div className="border-b pb-3 mb-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Pending Invitations ({organization.invitations.filter(inv => inv.role !== 'athlete').length})
                  </h4>
                  <div className="space-y-2">
                    {organization.invitations.filter(inv => inv.role !== 'athlete').map((invitation) => {
                      const isExpired = isInvitationExpired(invitation.expiresAt);
                      return (
                        <div key={invitation.id} className={`flex items-center justify-between p-2 rounded-lg border ${isExpired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 text-sm">{invitation.email}</p>
                            <div className="space-y-1">
                              <p className="text-xs text-gray-600">
                                Invited {new Date(invitation.createdAt).toLocaleDateString()}
                              </p>
                              <p className={`text-xs ${isExpired ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                {formatExpirationDate(invitation.expiresAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {invitation.role === 'org_admin' ? 'Admin' : 'Coach'} {isExpired ? '(Expired)' : '(Pending)'}
                            </Badge>
                            <div className={`flex items-center gap-1 text-xs ${isExpired ? 'text-red-600' : 'text-amber-600'}`}>
                              {isExpired ? (
                                <>
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Expired</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="h-3 w-3" />
                                  <span>Awaiting response</span>
                                </>
                              )}
                            </div>

                            {/* Action buttons for pending invitations */}
                            {(user?.isSiteAdmin || isOrgAdmin) && (
                              <div className="flex items-center gap-1 ml-2">
                                {/* Resend invitation button for expired invitations */}
                                {isExpired && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => resendInvitation(invitation.email, invitation.role)}
                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                    data-testid={`resend-invitation-${invitation.id}`}
                                  >
                                    <RefreshCw className="h-3 w-3" />
                                  </Button>
                                )}

                                {/* Copy invitation URL button (only for non-expired) */}
                                {!isExpired && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => copyInvitationUrl(invitation.token, invitation.email)}
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    data-testid={`copy-invitation-${invitation.id}`}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                )}

                                {/* Delete pending invitation button */}
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      data-testid={`delete-pending-${invitation.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete {isExpired ? 'Expired' : 'Pending'} Invitation</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete the {isExpired ? 'expired' : 'pending'} invitation for {invitation.email}? This will remove their access and they won't be able to join the organization.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deletePendingUser(invitation.id, invitation.email)}
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        Delete Invitation
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {organization.coaches.length === 0 ? (
                <p className="text-gray-500 text-sm">No coaches assigned</p>
              ) : (
                organization.coaches.map((coach, index) => {
                  // Check if there's a pending invitation for this user
                  const pendingInvitation = organization.invitations?.find(
                    inv => inv.email === coach.user.email && inv.isUsed === "false"
                  );

                  return (
                    <div key={coach.user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <Link 
                          href={`/users/${coach.user.id}`}
                          className="font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                          data-testid={`user-profile-link-${coach.user.id}`}
                        >
                          {coach.user.firstName} {coach.user.lastName}
                        </Link>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="h-3 w-3" />
                          <span>{coach.user.email}</span>
                        </div>

                        {/* Invitation Status */}
                        <div className="flex items-center gap-2 mt-1">
                          {pendingInvitation ? (
                            <div className="flex items-center gap-1 text-xs text-amber-600">
                              <Clock className="h-3 w-3" />
                              <span>Invitation pending</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle className="h-3 w-3" />
                              <span>Active user</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {coach.roles.map((role, roleIndex) => (
                            <Badge 
                              key={`${coach.user.id}-${role}-${roleIndex}`} 
                              variant={role === 'org_admin' ? 'default' : 'secondary'}
                            >
                              {role === 'org_admin' ? 'Admin' : role === 'coach' ? 'Coach' : 'Athlete'}
                            </Badge>
                          ))}
                        </div>

                        {/* Action Buttons - only for admin users */}
                        {(user?.isSiteAdmin || isOrgAdmin) && (
                          <div className="flex items-center gap-1">
                            {/* Send Invitation Button - only show if user is not active (no invitation needed for active users) */}
                            {!pendingInvitation && coach.user.isActive !== "true" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => sendInvitation(coach.user.email, coach.roles)}
                                data-testid={`send-invitation-${coach.user.id}`}
                              >
                                <Send className="h-3 w-3" />
                              </Button>
                            )}

                            {/* Delete User Button - hide for current user */}
                            {coach.user.id !== user?.id && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    data-testid={`delete-user-${coach.user.id}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete User</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to remove {coach.user.firstName} {coach.user.lastName} from this organization? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteUser(coach.user.id, `${coach.user.firstName} ${coach.user.lastName}`)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete User
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}