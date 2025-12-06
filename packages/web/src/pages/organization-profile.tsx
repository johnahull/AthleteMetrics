import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Building2, Users, UserCog, MapPin, Mail, MailCheck, Phone, Plus, UserPlus, Send, Clock, CheckCircle, AlertCircle, Trash2, Copy, RefreshCw, ArrowLeft, Eye, EyeOff, Edit, Settings, XCircle, UserCheck, Loader2, Link2, Search } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { mutations } from "@/lib/api";
import { validateUsername } from "@shared/username-validation";
import OrganizationMetricsCard from "@/components/organization-metrics-card";
import { getInvitationStatusMessage } from "@/lib/invitation-helpers";
import { formatDistanceToNow } from "date-fns";

// Constants
const EMAIL_SENT_NO_TIMESTAMP_FALLBACK = 'recently';

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
    emailSent: boolean;
    emailSentAt?: string;
  }>;
};

// Membership request type
interface MembershipRequest {
  id: string;
  userId: string;
  organizationId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requestedRole: string;
  discoveryMethod: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    fullName: string;
  };
}

// Type for unlinked athlete
interface UnlinkedAthlete {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  school: string | null;
}

// Pending Membership Requests Component
function PendingMembershipRequests({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [linkingRequestId, setLinkingRequestId] = useState<string | null>(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [athleteSearch, setAthleteSearch] = useState('');

  // Fetch pending membership requests
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/organizations/${organizationId}/membership-requests`, 'pending'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${organizationId}/membership-requests?status=pending`);
      return res.json();
    },
  });

  const requests = data?.requests as MembershipRequest[] | undefined;

  // Fetch unlinked athletes (only when linking dialog is open)
  const { data: unlinkedAthletesData, isLoading: loadingUnlinkedAthletes } = useQuery({
    queryKey: [`/api/organizations/${organizationId}/unlinked-athletes`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${organizationId}/unlinked-athletes`);
      return res.json();
    },
    enabled: linkingRequestId !== null,
  });

  const unlinkedAthletes = unlinkedAthletesData?.athletes as UnlinkedAthlete[] | undefined;

  // Filter athletes based on search
  const filteredAthletes = unlinkedAthletes?.filter((athlete) => {
    if (!athleteSearch) return true;
    const searchLower = athleteSearch.toLowerCase();
    return (
      athlete.fullName?.toLowerCase().includes(searchLower) ||
      athlete.firstName?.toLowerCase().includes(searchLower) ||
      athlete.lastName?.toLowerCase().includes(searchLower) ||
      athlete.school?.toLowerCase().includes(searchLower) ||
      athlete.birthYear?.toString().includes(searchLower)
    );
  });

  // Approve mutation (without linking)
  const approveMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("POST", `/api/membership-requests/${requestId}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/membership-requests`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/profile`] });
      toast({
        title: "Request Approved",
        description: "The membership request has been approved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Approve with athlete linking mutation
  const approveWithLinkingMutation = useMutation({
    mutationFn: async ({ requestId, linkToAthleteId }: { requestId: string; linkToAthleteId: string }) => {
      const res = await apiRequest("POST", `/api/membership-requests/${requestId}/approve`, { linkToAthleteId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/membership-requests`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/profile`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/unlinked-athletes`] });
      setLinkingRequestId(null);
      setSelectedAthleteId(null);
      setAthleteSearch('');
      toast({
        title: "Request Approved & Linked",
        description: "The membership request has been approved and linked to the existing athlete profile.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLinkAndApprove = () => {
    if (linkingRequestId && selectedAthleteId) {
      approveWithLinkingMutation.mutate({
        requestId: linkingRequestId,
        linkToAthleteId: selectedAthleteId,
      });
    }
  };

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason?: string }) => {
      const res = await apiRequest("POST", `/api/membership-requests/${requestId}/reject`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/membership-requests`] });
      setRejectingId(null);
      setRejectionReason('');
      toast({
        title: "Request Rejected",
        description: "The membership request has been rejected.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReject = (requestId: string) => {
    rejectMutation.mutate({ requestId, reason: rejectionReason || undefined });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Pending Membership Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return null; // Don't show errors for missing permissions
  }

  if (!requests || requests.length === 0) {
    return null; // Don't show section if no pending requests
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          Pending Membership Requests ({requests.length})
        </CardTitle>
        <CardDescription>
          Review and approve athletes requesting to join your organization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {requests.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg"
            >
              <div className="flex-1">
                <div className="font-medium">{request.user.fullName}</div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Mail className="h-3 w-3" />
                  {request.user.email}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Requested {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                  {request.discoveryMethod && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      via {request.discoveryMethod === 'join_code' ? 'join code' : 'directory'}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {rejectingId === request.id ? (
                  <div className="flex items-center gap-2">
                    <Textarea
                      placeholder="Reason (optional)"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-48 h-16 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(request.id)}
                      disabled={rejectMutation.isPending}
                    >
                      {rejectMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Confirm'
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRejectingId(null);
                        setRejectionReason('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => approveMutation.mutate(request.id)}
                      disabled={approveMutation.isPending}
                      data-testid={`approve-request-${request.id}`}
                    >
                      {approveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-1" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      onClick={() => {
                        setLinkingRequestId(request.id);
                        setSelectedAthleteId(null);
                        setAthleteSearch('');
                      }}
                      data-testid={`link-request-${request.id}`}
                    >
                      <Link2 className="h-4 w-4 mr-1" />
                      Link to Existing
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setRejectingId(request.id)}
                      data-testid={`reject-request-${request.id}`}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Link to Existing Athlete Dialog */}
        <Dialog open={linkingRequestId !== null} onOpenChange={(open) => {
          if (!open) {
            setLinkingRequestId(null);
            setSelectedAthleteId(null);
            setAthleteSearch('');
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Link to Existing Athlete
              </DialogTitle>
              <DialogDescription>
                Select an existing athlete profile to link with this membership request.
                The requester's account will inherit the existing athlete's data (measurements, team memberships).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search athletes by name, school, or birth year..."
                  className="pl-9"
                  value={athleteSearch}
                  onChange={(e) => setAthleteSearch(e.target.value)}
                />
              </div>

              {/* Athletes list */}
              <div className="max-h-60 overflow-y-auto border rounded-md">
                {loadingUnlinkedAthletes ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredAthletes && filteredAthletes.length > 0 ? (
                  <div className="divide-y">
                    {filteredAthletes.map((athlete) => (
                      <div
                        key={athlete.id}
                        className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                          selectedAthleteId === athlete.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                        }`}
                        onClick={() => setSelectedAthleteId(athlete.id)}
                      >
                        <div className="font-medium">{athlete.fullName}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                          {athlete.birthYear && (
                            <span>Born {athlete.birthYear}</span>
                          )}
                          {athlete.school && (
                            <>
                              {athlete.birthYear && <span>•</span>}
                              <span>{athlete.school}</span>
                            </>
                          )}
                          {!athlete.birthYear && !athlete.school && (
                            <span className="italic">No additional info</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      {athleteSearch
                        ? 'No athletes match your search'
                        : 'No unlinked athletes found'}
                    </p>
                    <p className="text-xs mt-1">
                      {!athleteSearch && 'All athletes in this organization have login credentials'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setLinkingRequestId(null);
                  setSelectedAthleteId(null);
                  setAthleteSearch('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleLinkAndApprove}
                disabled={!selectedAthleteId || approveWithLinkingMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {approveWithLinkingMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Link & Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

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
      const res = await apiRequest("POST", `/api/organizations/${organizationId}/users`, data);
      return res.json();
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
      return await mutations.createInvitation(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/profile`] });
      invitationForm.reset();

      // Type narrowing: this form creates single invitations
      if ('email' in data && 'emailSent' in data) {
        // Show different messages based on email delivery status
        const { title, description } = getInvitationStatusMessage(data.emailSent, data.email, 'created');

        toast({ title, description });
      } else {
        // Fallback for unexpected response type
        toast({
          title: "Success",
          description: data.message
        });
      }
    },
    onError: (error: any) => {
      // Sanitize error messages to avoid exposing internal details
      // NOTE: This uses string matching on error.message which is fragile.
      // Future improvement: Backend should return structured error codes
      // (e.g., { code: 'USER_EXISTS', message: '...' }) for more reliable error handling
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
        <Button className="flex items-center gap-2" data-testid="button-manage-users">
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

  const canEdit = user?.isSiteAdmin || (Array.isArray(userOrganizations) && userOrganizations.some((org: any) => org.organizationId === id && org.role === "org_admin"));
  const handleEdit = () => { /* implement edit logic */ };

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
      document.title = `${organization.name} - AthleteMetrics`;
    }
    return () => {
      document.title = "AthleteMetrics";
    };
  }, [organization?.name]);

  // Force refresh organization data when component mounts
  useEffect(() => {
    if (id) {
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

  // Function to delete a pending invitation
  const deletePendingUser = async (invitationId: string, email: string) => {
    try {
      await apiRequest("DELETE", `/api/invitations/${invitationId}`);

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
      const inviteUrl = `${window.location.origin}/accept-invitation?token=${encodeURIComponent(token)}`;
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

  // Function to resend invitation using the proper resend endpoint
  const resendInvitation = async (invitationId: string, email: string) => {
    try {
      const res = await apiRequest("POST", `/api/invitations/${invitationId}/resend`);
      const data = await res.json();

      await queryClient.invalidateQueries({ queryKey: [`/api/organizations/${id}/profile`] });

      // Show different messages based on email delivery status
      const { title, description } = getInvitationStatusMessage(data.emailSent, email, 'resent');

      toast({
        title,
        description,
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
            <div className="flex gap-2">
              {user?.isSiteAdmin && (
                <Link href={`/organizations/${id}/settings`}>
                  <Button variant="outline">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                </Link>
              )}
              {canEdit && (
                <Button onClick={handleEdit}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Profile
                </Button>
              )}
            </div>
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

      {/* Coaches & Administrators Section - Only visible to Site Admins and Org Admins */}
      {(user?.isSiteAdmin || isOrgAdmin) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Coaches & Administrators ({organization.coaches?.length ?? 0})
              </CardTitle>
              <UserManagementModal organizationId={id!} />
            </div>
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
                            {/* Email status indicator */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className="flex items-center"
                                    data-testid={invitation.emailSent ? `email-status-sent-${invitation.id}` : `email-status-not-sent-${invitation.id}`}
                                  >
                                    {invitation.emailSent ? (
                                      <MailCheck className="h-4 w-4 text-green-600" />
                                    ) : (
                                      <Mail className="h-4 w-4 text-gray-400" />
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent data-testid={`email-status-tooltip-${invitation.id}`}>
                                  {invitation.emailSent
                                    ? `Email sent ${invitation.emailSentAt ? new Date(invitation.emailSentAt).toLocaleString() : EMAIL_SENT_NO_TIMESTAMP_FALLBACK}`
                                    : 'Email not sent - use copy button to share link'}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

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
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => resendInvitation(invitation.id, invitation.email)}
                                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                          data-testid={`resend-invitation-${invitation.id}`}
                                        >
                                          <RefreshCw className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Resend invitation</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}

                                {/* Copy invitation URL button - now visible for ALL invitations */}
                                {!isExpired && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => copyInvitationUrl(invitation.token, invitation.email)}
                                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                          data-testid={`copy-invitation-${invitation.id}`}
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {invitation.emailSent
                                          ? 'Copy invitation link (already sent via email)'
                                          : 'Copy invitation link to share manually'}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
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
                                      <AlertDialogTitle>Delete Pending Invitation</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete the invitation for {invitation.email}? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deletePendingUser(invitation.id, invitation.email)}
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        Delete
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

              {/* Active Coaches */}
              {!organization.coaches || organization.coaches.length === 0 ? (
                <p className="text-gray-500 text-sm">No coaches assigned</p>
              ) : (
                organization.coaches.map((coach) => (
                  <div key={coach.user.id} className="p-3 bg-gray-50 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Link
                          to={`/users/${coach.user.id}`}
                          className="font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                        >
                          {coach.user.firstName} {coach.user.lastName}
                        </Link>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="h-3 w-3" />
                          <span>{coach.user.email}</span>
                        </div>
                      </div>
                      <Badge variant={coach.role === 'org_admin' ? 'default' : 'secondary'}>
                        {coach.role === 'org_admin' ? 'Admin' : 'Coach'}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Membership Requests Section - Visible to Site Admins, Org Admins, and Coaches */}
      {(user?.isSiteAdmin || isOrgAdmin || isCoach) && (
        <PendingMembershipRequests organizationId={id!} />
      )}

      {/* Metrics Configuration Section - Visible to Site Admins and Org Admins */}
      {(user?.isSiteAdmin || isOrgAdmin) && (
        <OrganizationMetricsCard organizationId={id!} canEdit={canEdit} />
      )}

    </div>
  );
}