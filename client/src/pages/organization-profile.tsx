import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Building2, Users, UserCog, MapPin, Mail, Phone, Plus, UserPlus, Send, Clock, CheckCircle, AlertCircle, Trash2, Copy, RefreshCw, ArrowLeft, Eye, EyeOff, Edit } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { validateUsername } from "@shared/username-validation";

// Mock components and types (replace with actual imports if available)
const LoadingSpinner = ({ text }: { text: string }) => (
  <div className="flex items-center justify-center py-12">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      <p className="mt-2 text-gray-600">{text}</p>
    </div>
  </div>
);

const OrganizationDisplay = ({ organization, isLoading, error }: any) => {
  if (isLoading) return <LoadingSpinner text="Loading organization details..." />;
  if (error) return <p className="text-red-600">Error loading organization details: {error.message}</p>;
  if (!organization) return <p className="text-gray-500">No organization data available.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Building2 className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold text-gray-900">{organization.name}</h1>
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
  );
};

// Form schemas
const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  username: z.string().refine(
    (username) => validateUsername(username).valid,
    (username) => ({
      message: validateUsername(username).errors[0] || "Invalid username"
    })
  ),
  role: z.enum(["org_admin", "coach", "athlete"]),
});

const invitationSchema = z.object({
  email: z.string().email("Invalid email format"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["org_admin", "coach", "athlete"]),
  organizationId: z.string().min(1, "Organization is required"),
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
      username?: string; // Added username to user type
    };
    role: string;
  }>;
  athletes: Array<{
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
    // Added potential fields for athlete details
    dateOfBirth?: string;
    gender?: string;
    email?: string;
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
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();


  const createUserForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      username: "",
      role: "coach",
    },
  });

  const invitationForm = useForm<InvitationForm>({
    resolver: zodResolver(invitationSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "coach" as const,
      organizationId,
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
      // Sanitize error messages to avoid exposing internal details
      let userMessage = "Failed to create user. Please try again.";

      if (error.message?.toLowerCase().includes('unique') ||
          error.message?.toLowerCase().includes('already exists')) {
        userMessage = "Username already exists. Please choose a different username.";
      } else if (error.message?.toLowerCase().includes('validation') ||
                 error.message?.toLowerCase().includes('invalid')) {
        userMessage = "Invalid input. Please check your entries and try again.";
      } else if (error.message?.toLowerCase().includes('permission') ||
                 error.message?.toLowerCase().includes('unauthorized')) {
        userMessage = "You don't have permission to perform this action.";
      }

      toast({
        title: "Error",
        description: userMessage,
        variant: "destructive"
      });
    },
  });

  const invitationMutation = useMutation({
    mutationFn: async (data: InvitationForm) => {
      const response = await fetch(`/api/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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
      // Sanitize error messages to avoid exposing internal details
      let userMessage = "Failed to send invitation. Please try again.";

      if (error.message?.toLowerCase().includes('already') ||
          error.message?.toLowerCase().includes('exists')) {
        userMessage = "An invitation for this email already exists or user already registered.";
      } else if (error.message?.toLowerCase().includes('invalid email')) {
        userMessage = "Invalid email address. Please check and try again.";
      } else if (error.message?.toLowerCase().includes('permission') ||
                 error.message?.toLowerCase().includes('unauthorized')) {
        userMessage = "You don't have permission to send invitations.";
      }

      toast({
        title: "Error",
        description: userMessage,
        variant: "destructive"
      });
    },
  });

  // Show for org admins, coaches, and site admins
  // Get user's organizations to check their role
  const { data: userOrganizations = [] } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id && !user?.isSiteAdmin,
  }) as { data: any[] };

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

                {/* Username Field */}
                <FormField
                  control={createUserForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-username" placeholder="Enter unique username" />
                      </FormControl>
                      <p className="text-xs text-gray-500">
                        Username must be unique and can contain letters, numbers, hyphens, and underscores
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                        <div className="relative">
                          <Input 
                            type={showPassword ? "text" : "password"} 
                            {...field} 
                            data-testid="input-password"
                            className="pr-10"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 focus:text-gray-600 focus:outline-none"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createUserForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="coach" id="role-coach" data-testid="radio-role-coach" />
                            <label
                              htmlFor="role-coach"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Coach
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="org_admin" id="role-org-admin" data-testid="radio-role-org-admin" />
                            <label
                              htmlFor="role-org-admin"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Organization Admin
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="athlete" id="role-athlete" data-testid="radio-role-athlete" />
                            <label
                              htmlFor="role-athlete"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Athlete
                            </label>
                          </div>
                        </RadioGroup>
                      </FormControl>
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
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={invitationForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-invite-first-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={invitationForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-invite-last-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <FormControl>
                        <select 
                          {...field} 
                          className="w-full p-2 border border-gray-300 rounded-md"
                          data-testid="select-invite-role"
                        >
                          <option value="coach">Coach</option>
                          <option value="org_admin">Organization Admin</option>
                          <option value="athlete">Athlete</option>
                        </select>
                      </FormControl>
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
  const { data: userOrganizations = [] } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id && !user?.isSiteAdmin,
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache at all
    refetchOnMount: true,
    refetchOnWindowFocus: true, // Enable refetch on focus
  }) as { data: any[] };

  // State for athletes
  const [athletes, setAthletes] = useState<OrganizationProfile["athletes"]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [athletesError, setAthletesError] = useState<Error | null>(null);
  const [isAddAthleteOpen, setIsAddAthleteOpen] = useState(false);

  const canEdit = user?.isSiteAdmin || (Array.isArray(userOrganizations) && userOrganizations.some((org: any) => org.organizationId === id && org.role === "org_admin"));
  const handleEdit = () => { /* implement edit logic */ };
  const totalAthletes = athletes?.length || 0;

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

  // Fetch athletes data
  useEffect(() => {
    const fetchAthletes = async () => {
      if (!id || !userHasAccessToOrg) {
        setLoadingAthletes(false);
        return;
      }
      setLoadingAthletes(true);
      try {
        const response = await fetch(`/api/athletes?organizationId=${id}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch athletes: ${response.statusText}`);
        }
        const data = await response.json();
        setAthletes(data);
        setAthletesError(null);
      } catch (err: any) {
        setAthletesError(err);
        setAthletes([]);
      } finally {
        setLoadingAthletes(false);
      }
    };
    fetchAthletes();
  }, [id, userHasAccessToOrg]);


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
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${id}`] }); // Assuming this fetches teams or related data
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
        coaches: organization.coaches?.length ?? 0,
        athletes: organization.athletes?.length ?? 0
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
        <LoadingSpinner text="Loading organization profile..." />
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">{organization?.name}</CardTitle>
              <CardDescription>
                Organization Profile and Settings
              </CardDescription>
            </div>
            {canEdit && (
              <Button onClick={handleEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Profile
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <OrganizationDisplay
            organization={organization}
            isLoading={isLoading}
            error={error}
          />
        </CardContent>
      </Card>

      {/* Athletes Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Athletes ({totalAthletes})</CardTitle>
            {canEdit && (
              <Button onClick={() => setIsAddAthleteOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Athlete
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingAthletes ? (
            <LoadingSpinner text="Loading athletes..." />
          ) : athletesError ? (
            <div className="text-destructive">Error loading athletes: {athletesError.message}</div>
          ) : athletes && athletes.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {athletes.map((athlete) => (
                <Card key={athlete.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {athlete.firstName} {athlete.lastName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Email:</span> {athlete.email || 'Not provided'}
                      </div>
                      {athlete.dateOfBirth && (
                        <div>
                          <span className="font-medium">Date of Birth:</span>{' '}
                          {new Date(athlete.dateOfBirth).toLocaleDateString()}
                        </div>
                      )}
                      {athlete.gender && (
                        <div>
                          <span className="font-medium">Gender:</span> {athlete.gender}
                        </div>
                      )}
                      {athlete.teams && athlete.teams.length > 0 && (
                        <div>
                          <span className="font-medium">Teams:</span>{' '}
                          {athlete.teams.map(t => t.name).join(', ')}
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => window.location.href = `/athletes/${athlete.id}`}
                      >
                        View Profile
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No athletes found. Add your first athlete to get started.
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}