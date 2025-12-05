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
import { normalizeString } from "@/lib/form-utils";
import { useContextualLabels } from "@/hooks/useContextualLabels";
import { useSports } from "@/lib/sports-api";

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
  organizationId?: string; // Required for creating new teams
}

export default function TeamModal({ isOpen, onClose, team, organizationId }: TeamModalProps) {
  const labels = useContextualLabels();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!team;

  // Fetch available sports from the API
  const { data: sports = [], isLoading: sportsLoading } = useSports();

  const form = useForm<InsertTeam>({
    resolver: zodResolver(insertTeamSchema),
    defaultValues: {
      name: "",
      level: undefined,
      sport: "",
      notes: "",
      season: "",
      organizationId: organizationId || undefined,
    },
  });

  useEffect(() => {
    if (team) {
      // Validate level is one of the allowed enum values before casting
      const validLevels = ["Club", "HS", "College"];
      const level = team.level && validLevels.includes(team.level)
        ? (team.level as "Club" | "HS" | "College")
        : undefined;

      form.reset({
        name: team.name,
        level,
        sport: team.sport || "",
        notes: team.notes || "",
        season: team.season || "",
        organizationId: team.organizationId,
      });
    } else {
      form.reset({
        name: "",
        level: undefined,
        sport: "",
        notes: "",
        season: "",
        organizationId: organizationId || undefined, // Use the prop for new teams
      });
    }
  }, [team, form, organizationId]);

  const createTeamMutation = useMutation({
    mutationFn: async (data: InsertTeam) => {
      const response = await apiRequest("POST", "/api/teams", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/search/global"] });
      toast({
        title: "Success",
        description: `${labels.team} created successfully`,
      });
      onClose();
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: `Failed to create ${labels.team.toLowerCase()}`,
        variant: "destructive",
      });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (data: InsertTeam) => {
      // Exclude organizationId from updates - it cannot be changed
      const { organizationId, ...formData } = data;

      // Only send fields that have actually changed to avoid unique constraint issues
      // OPTIMIZATION TRADEOFF: This prevents unnecessary API calls but introduces a potential
      // race condition if another user updates the team between when this modal opened and
      // when the update is submitted. The cached `team!` object may be stale.
      // Alternative: Always send all fields or implement optimistic concurrency control.
      const updateData: Partial<InsertTeam> = {};

      // Note: Zod schema handles .trim(), so no need to manually trim in updateData
      if (normalizeString(formData.name) !== normalizeString(team!.name)) {
        updateData.name = formData.name;
      }
      if (formData.level !== team!.level) updateData.level = formData.level;
      if (normalizeString(formData.sport) !== normalizeString(team!.sport)) updateData.sport = formData.sport;
      if (normalizeString(formData.notes) !== normalizeString(team!.notes)) updateData.notes = formData.notes;
      if (normalizeString(formData.season) !== normalizeString(team!.season)) updateData.season = formData.season;

      // If no fields have changed, just close the modal without making an API call
      if (Object.keys(updateData).length === 0) {
        onClose();
        return;
      }

      const response = await apiRequest("PATCH", `/api/teams/${team!.id}`, updateData);
      if (!response.ok) {
        const error = await response.json();
        // Check for specific error codes to provide targeted feedback
        if (error.errorCode === 'DUPLICATE_TEAM_NAME') {
          // Re-throw with error code so onError can handle it
          interface ApiError extends Error {
            errorCode?: string;
          }
          const duplicateError = new Error(error.message || "Duplicate team name") as ApiError;
          duplicateError.errorCode = 'DUPLICATE_TEAM_NAME';
          throw duplicateError;
        }
        throw new Error(error.message || "Failed to update team");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/search/global"] });
      toast({
        title: "Success",
        description: `${labels.team} updated successfully`,
      });
      onClose();
    },
    onError: (error: Error | { message?: string }) => {
      console.error("Team update error:", error);

      // Handle duplicate team name error by highlighting the name field
      if ((error as any).errorCode === 'DUPLICATE_TEAM_NAME') {
        form.setError('name', {
          type: 'manual',
          message: error instanceof Error ? error.message : `A ${labels.team.toLowerCase()} with this name already exists`,
        });
        return; // Don't show toast for form field errors
      }

      const errorMessage = error instanceof Error
        ? error.message
        : error?.message || `Failed to update ${labels.team.toLowerCase()}`;
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
          <DialogTitle>{isEditing ? `Edit ${labels.team}` : `Add New ${labels.team}`}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Update ${labels.team.toLowerCase()} information below.` : `Create a new ${labels.team.toLowerCase()} by filling out the form below.`}
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
                      {labels.team} Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={`Enter ${labels.team.toLowerCase()} name`}
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Level</FormLabel>
                    <Select
                      value={field.value || undefined}
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
                name="sport"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sport</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ""}
                      disabled={isPending || sportsLoading}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-team-sport">
                          <SelectValue placeholder={sportsLoading ? "Loading sports..." : "Select sport"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sports.map((sport) => (
                          <SelectItem key={sport.code} value={sport.code}>{sport.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                      placeholder={`Optional notes about this ${labels.team.toLowerCase()}...`}
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
                {isPending ? "Saving..." : isEditing ? `Update ${labels.team}` : `Add ${labels.team}`}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
