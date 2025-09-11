import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Trash2, Mail, Phone, Users, Trophy } from "lucide-react";

interface AthleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  athlete: (User & { teams: Team[] }) | null;
  teams: Team[];
}

export default function AthleteModal({ isOpen, onClose, athlete, teams }: AthleteModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!athlete;

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
    }
  }, [athlete, form]);

  const createAthleteMutation = useMutation({
    mutationFn: async (data: InsertAthlete) => {
      const response = await apiRequest("POST", "/api/athletes", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create athlete");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/athletes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      toast({
        title: "Success",
        description: "Athlete created successfully",
      });
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

  const onSubmit = (data: InsertAthlete) => {
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
      // Convert empty birthDate to null for database compatibility
      birthDate: data.birthDate?.trim() === "" ? null : data.birthDate,
    };

    if (isEditing) {
      updateAthleteMutation.mutate(submissionData);
    } else {
      createAthleteMutation.mutate(submissionData);
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

            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="teamIds"
                render={() => (
                  <FormItem>
                    <FormLabel className="flex items-center">
                      <Users className="h-4 w-4 mr-2" />
                      Teams (optional)
                    </FormLabel>
                    <div className="space-y-2 border rounded-md p-3 max-h-40 overflow-y-auto">
                      <div className="flex justify-between items-center pb-2 border-b">
                        <span className="text-sm text-gray-600">
                          {form.watch("teamIds")?.length || 0} team(s) selected
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => form.setValue("teamIds", [])}
                          disabled={isPending}
                          data-testid="button-clear-teams"
                        >
                          Clear All
                        </Button>
                      </div>
                      {teams.map((team) => (
                        <FormField
                          key={team.id}
                          control={form.control}
                          name="teamIds"
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={team.id}
                                className="flex flex-row items-start space-x-3 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(team.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...(field.value || []), team.id])
                                        : field.onChange(
                                            (field.value || []).filter(
                                              (value: string) => value !== team.id
                                            )
                                          )
                                    }}
                                    data-testid={`checkbox-team-${team.id}`}
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal">
                                  {team.name}
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