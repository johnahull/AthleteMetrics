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
import { Building2, Users, UserCog, MapPin, Mail, Phone, Plus, UserPlus, Send } from "lucide-react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Form schemas
const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  roles: z.array(z.enum(["org_admin", "coach", "athlete"])).min(1, "At least one role must be selected"),
});

const invitationSchema = z.object({
  email: z.string().email("Invalid email format"),
  roles: z.array(z.enum(["org_admin", "coach", "athlete"])).min(1, "At least one role must be selected"),
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
};

// User Management Modal Component
function UserManagementModal({ organizationId }: { organizationId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const createUserForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema.refine((data) => {
      // Athletes cannot have other roles
      if (data.roles.includes("athlete") && data.roles.length > 1) {
        return false;
      }
      return true;
    }, {
      message: "Athletes cannot have additional roles",
      path: ["roles"],
    })),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      roles: ["athlete"],
    },
  });

  const invitationForm = useForm<InvitationForm>({
    resolver: zodResolver(invitationSchema.refine((data) => {
      // Athletes cannot have other roles
      if (data.roles.includes("athlete") && data.roles.length > 1) {
        return false;
      }
      return true;
    }, {
      message: "Athletes cannot have additional roles",
      path: ["roles"],
    })),
    defaultValues: {
      email: "",
      roles: ["athlete"],
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
      const response = await fetch(`/api/organizations/${organizationId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send invitation");
      }
      return response.json();
    },
    onSuccess: () => {
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

  // Only show for org admins and site admins
  if (user?.role !== "org_admin" && user?.role !== "site_admin") {
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
                          { value: "athlete", label: "Athlete" },
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
                                  // If selecting athlete, clear other roles
                                  if (role.value === "athlete") {
                                    field.onChange(["athlete"]);
                                  } else {
                                    // If selecting other role while athlete is selected, replace athlete
                                    const newRoles = currentRoles.includes("athlete") 
                                      ? [role.value] 
                                      : [...currentRoles, role.value];
                                    field.onChange(newRoles);
                                  }
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
                          { value: "athlete", label: "Athlete" },
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
                                  // If selecting athlete, clear other roles
                                  if (role.value === "athlete") {
                                    field.onChange(["athlete"]);
                                  } else {
                                    // If selecting other role while athlete is selected, replace athlete
                                    const newRoles = currentRoles.includes("athlete") 
                                      ? [role.value] 
                                      : [...currentRoles, role.value];
                                    field.onChange(newRoles);
                                  }
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

  const { data: organization, isLoading, error } = useQuery<OrganizationProfile>({
    queryKey: [`/api/organizations/${id}/profile`],
  });

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

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
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
        
        <UserManagementModal organizationId={id!} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              {organization.coaches.length === 0 ? (
                <p className="text-gray-500 text-sm">No coaches assigned</p>
              ) : (
                organization.coaches.map((coach, index) => (
                  <div key={`${coach.user.id}-${index}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {coach.user.firstName} {coach.user.lastName}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="h-3 w-3" />
                        <span>{coach.user.email}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {coach.roles.map((role) => (
                        <Badge 
                          key={role} 
                          variant={role === 'org_admin' ? 'default' : 'secondary'}
                        >
                          {role === 'org_admin' ? 'Admin' : role === 'coach' ? 'Coach' : 'Athlete'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Players Section - Second */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Athletes ({organization.players.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {organization.players.length === 0 ? (
                <p className="text-gray-500 text-sm">No athletes assigned</p>
              ) : (
                organization.players.map((player) => (
                  <div key={player.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <Link href={`/athletes/${player.id}`} className="hover:text-primary">
                          <p className="font-medium text-gray-900 hover:underline">
                            {player.fullName}
                          </p>
                        </Link>
                        {player.school && (
                          <p className="text-sm text-gray-600">{player.school}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Born {player.birthYear}</p>
                        {player.sports.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {player.sports.slice(0, 2).map((sport, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {sport}
                              </Badge>
                            ))}
                            {player.sports.length > 2 && (
                              <span className="text-xs text-gray-500">+{player.sports.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Contact Info */}
                    {(player.emails.length > 0 || player.phoneNumbers.length > 0) && (
                      <div className="text-xs text-gray-600 space-y-1">
                        {player.emails.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            <span>{player.emails[0]}</span>
                          </div>
                        )}
                        {player.phoneNumbers.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            <span>{player.phoneNumbers[0]}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Teams */}
                    {player.teams.length > 0 && (
                      <>
                        <Separator className="my-2" />
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Teams: </span>
                          {player.teams.map((team, index) => (
                            <span key={team.id}>
                              {team.name}
                              {team.level && ` (${team.level})`}
                              {index < player.teams.length - 1 && ', '}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}