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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertPlayerSchema, type InsertPlayer, type Player, type Team } from "@shared/schema";
import { Plus, Trash2, Mail, Phone, Users, Trophy } from "lucide-react";

interface PlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: (Player & { teams: Team[] }) | null;
  teams: Team[];
}

export default function PlayerModal({ isOpen, onClose, player, teams }: PlayerModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!player;

  const form = useForm<InsertPlayer>({
    resolver: zodResolver(insertPlayerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      birthday: "",
      graduationYear: new Date().getFullYear() + 3,
      teamIds: [],
      school: "",
      sports: [],
      emails: [],
      phoneNumbers: [],
    },
  });

  const { fields: emailFields, append: appendEmail, remove: removeEmail } = useFieldArray({
    control: form.control,
    name: "emails"
  }) as any;

  const { fields: phoneFields, append: appendPhone, remove: removePhone } = useFieldArray({
    control: form.control,
    name: "phoneNumbers"
  }) as any;

  const { fields: sportsFields, append: appendSport, remove: removeSport } = useFieldArray({
    control: form.control,
    name: "sports"
  }) as any;

  useEffect(() => {
    if (player) {
      form.reset({
        firstName: player.firstName,
        lastName: player.lastName,
        birthday: player.birthday || "",
        graduationYear: player.graduationYear,
        teamIds: player.teams?.map(team => team.id) || [],
        school: player.school || "",
        sports: player.sports || [],
        emails: player.emails || [],
        phoneNumbers: player.phoneNumbers || [],
      });
    } else {
      form.reset({
        firstName: "",
        lastName: "",
        birthday: "",
        graduationYear: new Date().getFullYear() + 3,
        teamIds: [],
        school: "",
        sports: [],
        emails: [],
        phoneNumbers: [],
      });
    }
  }, [player, form]);

  const createPlayerMutation = useMutation({
    mutationFn: async (data: InsertPlayer) => {
      const response = await apiRequest("POST", "/api/players", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      toast({
        title: "Success",
        description: "Player created successfully",
      });
      onClose();
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create player",
        variant: "destructive",
      });
    },
  });

  const updatePlayerMutation = useMutation({
    mutationFn: async (data: InsertPlayer) => {
      const response = await apiRequest("PATCH", `/api/players/${player!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      toast({
        title: "Success",
        description: "Player updated successfully",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update player",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertPlayer) => {
    if (isEditing) {
      updatePlayerMutation.mutate(data);
    } else {
      createPlayerMutation.mutate(data);
    }
  };

  const isPending = createPlayerMutation.isPending || updatePlayerMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full p-0" style={{ 
        height: '90vh', 
        display: 'grid', 
        gridTemplateRows: 'auto 1fr auto',
        gridTemplateAreas: '"header" "content" "footer"'
      }}>
        <div className="px-6 pt-6 pb-4 border-b" style={{ gridArea: 'header' }}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Player" : "Add New Player"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Update player information below." : "Add a new player to your team by filling out the form below."}
            </DialogDescription>
          </DialogHeader>
        </div>
        
        <Form {...form}>
          <div className="px-6 py-4 overflow-y-auto" style={{ gridArea: 'content', minHeight: 0 }}>
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
                        data-testid="input-player-firstname"
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
                        data-testid="input-player-lastname"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="birthday"
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
                        data-testid="input-player-birthday"
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
                        data-testid="input-player-graduationyear"
                        value={field.value || ""}
                      />
                    </FormControl>
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
                                              (value) => value !== team.id
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
                      data-testid="input-player-school"
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
                {sportsFields.map((field, index) => (
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
                                <SelectItem value="Track & Field">Track & Field</SelectItem>
                                <SelectItem value="Basketball">Basketball</SelectItem>
                                <SelectItem value="Football">Football</SelectItem>
                                <SelectItem value="Tennis">Tennis</SelectItem>
                                <SelectItem value="Baseball">Baseball</SelectItem>
                                <SelectItem value="Volleyball">Volleyball</SelectItem>
                                <SelectItem value="Cross Country">Cross Country</SelectItem>
                                <SelectItem value="Swimming">Swimming</SelectItem>
                                <SelectItem value="Wrestling">Wrestling</SelectItem>
                                <SelectItem value="Golf">Golf</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
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

            {/* Email Addresses */}
            <FormItem>
              <FormLabel className="flex items-center">
                <Mail className="h-4 w-4 mr-2" />
                Email Addresses
              </FormLabel>
              <div className="space-y-2">
                {emailFields.map((field, index) => (
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
                {phoneFields.map((field, index) => (
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
          
          <div className="px-6 py-4 border-t bg-white" style={{ gridArea: 'footer' }}>
            <div className="flex justify-end space-x-3">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={isPending}
                data-testid="button-cancel-player"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isPending}
                data-testid="button-save-player"
                onClick={form.handleSubmit(onSubmit)}
              >
                {isPending ? "Saving..." : isEditing ? "Update Player" : "Add Player"}
              </Button>
            </div>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
