import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertTeamSchema, type InsertTeam, type Team } from "@shared/schema";

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
}

export default function TeamModal({ isOpen, onClose, team }: TeamModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!team;

  const form = useForm<InsertTeam>({
    resolver: zodResolver(insertTeamSchema),
    defaultValues: {
      name: "",
      level: "",
      notes: "",
      season: "",
      organizationId: undefined,
    },
  });

  useEffect(() => {
    if (team) {
      form.reset({
        name: team.name,
        level: team.level || "",
        notes: team.notes || "",
        season: team.season || "",
        organizationId: team.organizationId,
      });
    } else {
      form.reset({
        name: "",
        level: "",
        notes: "",
        season: "",
        organizationId: undefined,
      });
    }
  }, [team, form]);

  const createTeamMutation = useMutation({
    mutationFn: async (data: InsertTeam) => {
      const response = await apiRequest("POST", "/api/teams", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });
      toast({
        title: "Success",
        description: "Team created successfully",
      });
      onClose();
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create team",
        variant: "destructive",
      });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (data: InsertTeam) => {
      // Exclude organizationId from updates - it cannot be changed
      const { organizationId, ...formData } = data;

      // Normalize values for comparison (trim whitespace)
      const normalize = (val: string | null | undefined) => val?.trim() || null;

      // Only send fields that have actually changed to avoid unique constraint issues
      const updateData: Partial<InsertTeam> = {};
      if (normalize(formData.name) !== normalize(team!.name)) {
        updateData.name = formData.name.trim();
      }
      if (formData.level !== team!.level) updateData.level = formData.level;
      if (normalize(formData.notes) !== normalize(team!.notes)) updateData.notes = formData.notes;
      if (normalize(formData.season) !== normalize(team!.season)) updateData.season = formData.season;

      // If nothing changed, close modal without API call
      if (Object.keys(updateData).length === 0) {
        return { success: true, team: team! };
      }

      const response = await apiRequest("PATCH", `/api/teams/${team!.id}`, updateData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update team");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });
      toast({
        title: "Success",
        description: "Team updated successfully",
      });
      onClose();
    },
    onError: (error: Error | { message?: string }) => {
      console.error("Team update error:", error);
      const errorMessage = error instanceof Error
        ? error.message
        : error?.message || "Failed to update team";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertTeam) => {
    if (isEditing) {
      updateTeamMutation.mutate(data);
    } else {
      createTeamMutation.mutate(data);
    }
  };

  const isPending = createTeamMutation.isPending || updateTeamMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Team" : "Add New Team"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update team information below." : "Create a new team by filling out the form below."}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Team Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Enter team name"
                        disabled={isPending}
                        data-testid="input-team-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="season"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Season</FormLabel>
                    <FormControl>
                      <Input 
                        {...field}
                        value={field.value || ""}
                        placeholder="e.g., 2025-Spring"
                        disabled={isPending}
                        data-testid="input-team-season"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Level</FormLabel>
                  <Select 
                    value={field.value || ""} 
                    onValueChange={field.onChange}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-team-level">
                        <SelectValue placeholder="Select level..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Club">Club</SelectItem>
                      <SelectItem value="HS">High School</SelectItem>
                      <SelectItem value="College">College</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      value={field.value || ""}
                      placeholder="Optional notes about this team..."
                      disabled={isPending}
                      rows={3}
                      data-testid="textarea-team-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={isPending}
                data-testid="button-cancel-team"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isPending}
                data-testid="button-save-team"
              >
                {isPending ? "Saving..." : isEditing ? "Update Team" : "Add Team"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
