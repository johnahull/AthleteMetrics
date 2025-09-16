import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { archiveTeamSchema, type ArchiveTeam, type Team } from "@shared/schema";
import { getCurrentSeason } from "@shared/season-utils";
import { AlertTriangle } from "lucide-react";

interface ArchiveTeamModalProps {
  team: Team;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ArchiveTeam) => void;
  isLoading?: boolean;
}


export default function ArchiveTeamModal({ 
  team, 
  isOpen, 
  onClose, 
  onConfirm, 
  isLoading = false 
}: ArchiveTeamModalProps) {
  const form = useForm<ArchiveTeam>({
    resolver: zodResolver(archiveTeamSchema),
    defaultValues: {
      teamId: team?.id || "",
      season: team?.season || getCurrentSeason(),
      archiveDate: new Date(),
    },
  });

  // Early return if team is null
  if (!team) {
    return null;
  }

  const handleSubmit = (data: ArchiveTeam) => {
    onConfirm(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Archive Team: {team.name}</DialogTitle>
          <DialogDescription>
            Archiving will freeze this team's roster and analytics. 
            Future measurements won't appear in this team's data.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="season"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Season Designation</FormLabel>
                  <FormControl>
                    <Input 
                      {...field}
                      placeholder="e.g., 2024-Fall Soccer"
                      disabled={isLoading}
                      data-testid="input-archive-season"
                    />
                  </FormControl>
                  <FormDescription>
                    This will be saved as the team's final season
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="archiveDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Archive Date</FormLabel>
                  <FormControl>
                    <Input 
                      type="date"
                      disabled={isLoading}
                      data-testid="input-archive-date"
                      value={field.value?.toISOString().split('T')[0] || ""}
                      onChange={(e) => field.onChange(new Date(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Measurements after this date won't count for this team
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Archive Effects</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1 mt-2">
                  <li>Team roster will be frozen as of the archive date</li>
                  <li>Analytics will exclude measurements taken after archive date</li>
                  <li>Team can be unarchived later if needed</li>
                  <li>Current team members will be marked as inactive</li>
                </ul>
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={isLoading}
                data-testid="button-cancel-archive"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="destructive"
                disabled={isLoading}
                data-testid="button-confirm-archive"
              >
                {isLoading ? "Archiving..." : "Archive Team"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}