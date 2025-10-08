import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertAthleteSchema, Gender, SoccerPosition, type InsertAthlete, type User, type Team } from "@shared/schema";
import { Plus, Trash2, Mail, Phone, Trophy, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface AthleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  athlete: (User & { teams: Team[] }) | null;
}

export default function AthleteModal({ isOpen, onClose, athlete }: AthleteModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, organizationContext } = useAuth();
  const isEditing = !!athlete;
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamLevel, setNewTeamLevel] = useState<"Club" | "HS" | "College">("Club");

  const form = useForm<InsertAthlete>({
    resolver: zodResolver(insertAthleteSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      emails: [],
      birthDate: "",
      graduationYear: new Date().getFullYear() + 3,
      school: "",
      sports: [],
      positions: [],
      phoneNumbers: [],
      gender: undefined,
    },
  });

  const {
    fields: emailFields,
    append: appendEmail,
    remove: removeEmail,
  } = useFieldArray({
    control: form.control,
    name: "emails" as never,
  });
  
  const {
    fields: phoneFields,
    append: appendPhone,
    remove: removePhone,
  } = useFieldArray({
    control: form.control,
    name: "phoneNumbers" as never,
  });
  
  const {
    fields: sportsFields,
    append: appendSport,
    remove: removeSport,
  } = useFieldArray({
    control: form.control,
    name: "sports" as never,
  });

  // Fetch teams for the user's organization
  const { data: teams = [] } = useQuery({
    queryKey: ["/api/teams", organizationContext],
    queryFn: async () => {
      const url = organizationContext
        ? `/api/teams?organizationId=${organizationContext}`
        : `/api/teams`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch teams');
      return response.json();
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (athlete) {
      form.reset({
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        emails: athlete.emails || [],
        birthDate: athlete.birthDate || "",
        graduationYear: athlete.graduationYear || undefined,
        school: athlete.school || "",
        sports: (athlete.sports || []).filter((s): s is "Soccer" => s === "Soccer"),
        positions: (athlete.positions || []).filter((p): p is "F" | "M" | "D" | "GK" =>
          ["F", "M", "D", "GK"].includes(p)
        ),
        phoneNumbers: athlete.phoneNumbers || [],
        gender: athlete.gender || undefined,
      });
      setSelectedTeamIds(athlete.teams?.map(t => t.id) || []);
    } else {
      form.reset({
        firstName: "",
        lastName: "",
        emails: [],
        birthDate: "",
        graduationYear: new Date().getFullYear() + 3,
        school: "",
        sports: [],
        positions: [],
        phoneNumbers: [],
        gender: undefined,
      });
      setSelectedTeamIds([]);
    }
    setShowCreateTeam(false);
    setNewTeamName("");
  }, [athlete, form]);

  const createTeamMutation = useMutation({
    mutationFn: async (teamData: { name: string; level: string; organizationId: string }) => {
      const response = await apiRequest("POST", "/api/teams", teamData);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create team");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    },
  });

  const createAthleteMutation = useMutation({
    mutationFn: async (data: { athleteData: InsertAthlete; teamIds: string[] }) => {
      // Create athlete
      const response = await apiRequest("POST", "/api/athletes", data.athleteData);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create athlete");
      }
      const athlete = await response.json();

      // BUGFIX: Explicitly add athlete to organization when assigning to teams
      // This ensures organization membership is not solely reliant on team assignment
      if (data.teamIds.length > 0 && organizationContext) {
        try {
          const orgResponse = await apiRequest("POST", `/api/organizations/${organizationContext}/add-users`, {
            userIds: [athlete.id],
            role: "athlete"
          });
          if (!orgResponse.ok) {
            console.error(`Failed to add athlete to organization ${organizationContext}`);
          }
        } catch (error) {
          console.error(`Error adding athlete to organization:`, error);
          // Don't fail - the server-side POST /api/athletes already adds to org
        }
      }

      // Add athlete to teams - collect errors for better reporting
      const teamErrors: string[] = [];
      if (data.teamIds.length > 0) {
        for (const teamId of data.teamIds) {
          try {
            const teamResponse = await apiRequest("POST", `/api/teams/${teamId}/add-athletes`, {
              athleteIds: [athlete.id]
            });
            if (!teamResponse.ok) {
              const errorData = await teamResponse.json();
              teamErrors.push(`Team assignment failed: ${errorData.message || 'Unknown error'}`);
            }
          } catch (error) {
            teamErrors.push(`Error adding athlete to team: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      // Return athlete with any team assignment errors
      if (teamErrors.length > 0) {
        return { ...athlete, teamErrors };
      }
      return athlete;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/athletes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });

      // IMPROVED ERROR HANDLING: Show team assignment warnings if present
      if (data.teamErrors && data.teamErrors.length > 0) {
        toast({
          title: "Athlete created with warnings",
          description: `Athlete created successfully, but some team assignments failed: ${data.teamErrors.join(', ')}`,
          variant: "default",
        });
      } else {
        toast({
          title: "Success",
          description: "Athlete created successfully",
        });
      }

      onClose();
      form.reset({
        firstName: "",
        lastName: "",
        emails: [],
        birthDate: "",
        graduationYear: new Date().getFullYear() + 3,
        school: "",
        sports: [],
        positions: [],
        phoneNumbers: [],
        gender: undefined,
      });
      setSelectedTeamIds([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create athlete",
        variant: "destructive",
      });
    },
  });

  const updateAthleteMutation = useMutation({
    mutationFn: async (data: InsertAthlete) => {
      const response = await apiRequest("PATCH", `/api/athletes/${athlete!.id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update athlete");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/athletes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/athletes", athlete?.id] });
      toast({
        title: "Success",
        description: "Athlete updated successfully",
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update athlete",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: InsertAthlete) => {
    // Validate birth date is required
    if (!data.birthDate || data.birthDate.trim() === "") {
      toast({
        title: "Error",
        description: "Birth date is required",
        variant: "destructive",
      });
      return;
    }

    // Filter out empty emails and ensure at least one email exists
    const filteredEmails = data.emails?.filter(email => email.trim() !== "") || [];
    if (filteredEmails.length === 0) {
      toast({
        title: "Error",
        description: "At least one email address is required",
        variant: "destructive",
      });
      return;
    }

    // Filter out empty phone numbers
    const filteredPhones = data.phoneNumbers?.filter(phone => phone.trim() !== "") || [];

    const submissionData = {
      ...data,
      emails: filteredEmails,
      phoneNumbers: filteredPhones,
    };

    if (isEditing) {
      updateAthleteMutation.mutate(submissionData);
    } else {
      // Handle new team creation if needed
      let teamIdsToAssign = [...selectedTeamIds];

      if (showCreateTeam && newTeamName.trim()) {
        if (!organizationContext) {
          toast({
            title: "Error",
            description: "Organization context required to create team",
            variant: "destructive",
          });
          return;
        }

        try {
          const newTeam = await createTeamMutation.mutateAsync({
            name: newTeamName.trim(),
            level: newTeamLevel,
            organizationId: organizationContext,
          });
          teamIdsToAssign.push(newTeam.id);
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to create new team",
            variant: "destructive",
          });
          return;
        }
      }

      createAthleteMutation.mutate({
        athleteData: submissionData,
        teamIds: teamIdsToAssign,
      });
    }
  };

  const isPending = createAthleteMutation.isPending || updateAthleteMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full p-0 h-[90vh] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Athlete" : "Add New Athlete"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Update athlete information below." : "Add a new athlete to your team by filling out the form below."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 min-h-0 flex-col">
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-4">
              <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      First Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="First name"
                        disabled={isPending}
                        data-testid="input-athlete-firstname"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Last Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Last name"
                        disabled={isPending}
                        data-testid="input-athlete-lastname"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>


            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Birth Date <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="date"
                        disabled={isPending}
                        data-testid="input-athlete-birthdate"
                        value={field.value || ""}
                        placeholder="YYYY-MM-DD"
                        max={new Date().toISOString().split('T')[0]} // Prevent future dates
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="graduationYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Graduation Year</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number"
                        min="2020"
                        max="2035"
                        disabled={isPending}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        data-testid="input-athlete-graduationyear"
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select 
                      value={field.value || ""} 
                      onValueChange={field.onChange}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-athlete-gender" aria-label="Select athlete gender">
                          <SelectValue placeholder="Select gender..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={Gender.MALE}>{Gender.MALE}</SelectItem>
                        <SelectItem value={Gender.FEMALE}>{Gender.FEMALE}</SelectItem>
                        <SelectItem value={Gender.NOT_SPECIFIED}>{Gender.NOT_SPECIFIED}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>


            <FormField
              control={form.control}
              name="school"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>School</FormLabel>
                  <FormControl>
                    <Input 
                      {...field}
                      value={field.value || ""}
                      placeholder="School name (optional)"
                      disabled={isPending}
                      data-testid="input-athlete-school"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sports */}
            <FormItem>
              <FormLabel className="flex items-center">
                <Trophy className="h-4 w-4 mr-2" />
                Sports
              </FormLabel>
              <div className="space-y-2">
                {sportsFields.map((field: any, index: number) => (
                  <div key={field.id} className="flex space-x-2">
                    <FormField
                      control={form.control}
                      name={`sports.${index}`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Select 
                              value={field.value || ""} 
                              onValueChange={field.onChange}
                              disabled={isPending}
                            >
                              <SelectTrigger data-testid={`select-sport-${index}`}>
                                <SelectValue placeholder="Select sport" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Soccer">Soccer</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeSport(index)}
                      disabled={isPending}
                      data-testid={`button-remove-sport-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendSport("")}
                  disabled={isPending}
                  data-testid="button-add-sport"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Sport
                </Button>
              </div>
            </FormItem>

            {/* Soccer Positions */}
            {sportsFields.some((field: any) => field.value === "Soccer") && (
              <FormItem>
                <FormLabel className="flex items-center">
                  <Trophy className="h-4 w-4 mr-2" />
                  Soccer Positions
                </FormLabel>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(SoccerPosition).map(([key, value]) => (
                    <FormField
                      key={key}
                      control={form.control}
                      name="positions"
                      render={({ field }) => {
                        return (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(value) || false}
                                onCheckedChange={(checked) => {
                                  const currentPositions = field.value || [];
                                  if (checked) {
                                    field.onChange([...currentPositions, value]);
                                  } else {
                                    field.onChange(
                                      currentPositions.filter((pos: string) => pos !== value)
                                    );
                                  }
                                }}
                                data-testid={`checkbox-position-${value}`}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              {value} - {key === 'FORWARD' ? 'Forward' : 
                                      key === 'MIDFIELDER' ? 'Midfielder' :
                                      key === 'DEFENDER' ? 'Defender' : 'Goalkeeper'}
                            </FormLabel>
                          </FormItem>
                        )
                      }}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}

            {/* Email Addresses */}
            <FormItem>
              <FormLabel className="flex items-center">
                <Mail className="h-4 w-4 mr-2" />
                Email Addresses <span className="text-red-500">*</span>
              </FormLabel>
              <div className="space-y-2">
                {emailFields.map((field: any, index: number) => (
                  <div key={field.id} className="flex space-x-2">
                    <FormField
                      control={form.control}
                      name={`emails.${index}`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input 
                              {...field}
                              type="email"
                              placeholder="Enter email address"
                              disabled={isPending}
                              data-testid={`input-email-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeEmail(index)}
                      disabled={isPending}
                      data-testid={`button-remove-email-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendEmail("")}
                  disabled={isPending}
                  data-testid="button-add-email"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Email
                </Button>
              </div>
            </FormItem>

            {/* Phone Numbers */}
            <FormItem>
              <FormLabel className="flex items-center">
                <Phone className="h-4 w-4 mr-2" />
                Phone Numbers
              </FormLabel>
              <div className="space-y-2">
                {phoneFields.map((field: any, index: number) => (
                  <div key={field.id} className="flex space-x-2">
                    <FormField
                      control={form.control}
                      name={`phoneNumbers.${index}`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              {...field}
                              type="tel"
                              placeholder="Enter phone number"
                              disabled={isPending}
                              data-testid={`input-phone-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removePhone(index)}
                      disabled={isPending}
                      data-testid={`button-remove-phone-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendPhone("")}
                  disabled={isPending}
                  data-testid="button-add-phone"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Phone
                </Button>
              </div>
            </FormItem>

            {/* Team Assignment */}
            {!isEditing && (
              <FormItem>
                <FormLabel className="flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  Team Assignment
                </FormLabel>
                <div className="space-y-3">
                  {/* Existing Teams */}
                  <div className="space-y-2">
                    {teams.filter((t: Team) => !t.isArchived).map((team: Team) => (
                      <div key={team.id} className="flex items-center space-x-2">
                        <Checkbox
                          checked={selectedTeamIds.includes(team.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedTeamIds([...selectedTeamIds, team.id]);
                            } else {
                              setSelectedTeamIds(selectedTeamIds.filter(id => id !== team.id));
                            }
                          }}
                          disabled={isPending}
                          data-testid={`checkbox-team-${team.id}`}
                        />
                        <label className="text-sm font-normal cursor-pointer">
                          {team.name} ({team.level})
                        </label>
                      </div>
                    ))}
                    {teams.filter((t: Team) => !t.isArchived).length === 0 && !showCreateTeam && (
                      <p className="text-sm text-gray-500">No teams available</p>
                    )}
                  </div>

                  {/* Create New Team Option */}
                  {!showCreateTeam ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCreateTeam(true)}
                      disabled={isPending}
                      data-testid="button-show-create-team"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create New Team
                    </Button>
                  ) : (
                    <div className="space-y-2 p-3 border rounded-lg bg-gray-50">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">New Team</label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowCreateTeam(false);
                            setNewTeamName("");
                          }}
                          disabled={isPending || createTeamMutation.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Team name"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        disabled={isPending || createTeamMutation.isPending}
                        data-testid="input-new-team-name"
                      />
                      <Select
                        value={newTeamLevel}
                        onValueChange={(value: "Club" | "HS" | "College") => setNewTeamLevel(value)}
                        disabled={isPending || createTeamMutation.isPending}
                      >
                        <SelectTrigger data-testid="select-new-team-level">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Club">Club</SelectItem>
                          <SelectItem value="HS">High School</SelectItem>
                          <SelectItem value="College">College</SelectItem>
                        </SelectContent>
                      </Select>
                      {createTeamMutation.isPending && (
                        <p className="text-sm text-gray-500">Creating team...</p>
                      )}
                    </div>
                  )}
                </div>
              </FormItem>
            )}
            </div>
            </div>
          </ScrollArea>

          <div className="px-6 py-4 border-t bg-white flex-shrink-0">
            <div className="flex justify-end space-x-3">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={isPending}
                data-testid="button-cancel-athlete"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isPending}
                data-testid="button-save-athlete"
              >
                {isPending ? "Saving..." : isEditing ? "Update Athlete" : "Add Athlete"}
              </Button>
            </div>
          </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}