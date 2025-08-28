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
import { Plus, Building2, Users, UserPlus } from "lucide-react";

const organizationSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  description: z.string().optional(),
});

const inviteSchema = z.object({
  email: z.string().email("Invalid email"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["site_admin", "org_admin", "coach", "athlete"]),
  organizationId: z.string().optional(),
});

type Organization = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
};

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  const { data: organizations } = useQuery({
    queryKey: ["/api/organizations"],
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

  const sendInviteMutation = useMutation({
    mutationFn: async (data: z.infer<typeof inviteSchema>) => {
      const res = await apiRequest("POST", "/api/invitations", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Invitation sent successfully!", 
        description: `Invitation link generated for ${data.email}` 
      });
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
                <div key={org.id} className="p-3 border rounded-lg">
                  <h3 className="font-semibold" data-testid={`org-name-${org.id}`}>{org.name}</h3>
                  {org.description && (
                    <p className="text-sm text-gray-600" data-testid={`org-description-${org.id}`}>
                      {org.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    Created: {new Date(org.createdAt).toLocaleDateString()}
                  </p>
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
                          <FormLabel>Organization (Optional)</FormLabel>
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
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-900">Getting Started</h3>
                <ol className="mt-2 text-sm text-blue-800 space-y-1">
                  <li>1. Create organizations for different schools, clubs, or teams</li>
                  <li>2. Add users and assign them to organizations</li>
                  <li>3. Create teams within organizations</li>
                  <li>4. Invite athletes or let coaches manage their teams</li>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}