/**
 * Training Assignments Page (Coach / Org Admin)
 * Route: /training/assignments
 *
 * Active assignments list + AssignProgramDialog trigger.
 */

import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useEffect } from "react";
import { Dumbbell, Plus, User, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTrainingAccess } from "@/hooks/use-training-access";
import {
  useTrainingAssignments,
  useCreateAssignment,
  useUpdateAssignmentStatus,
  type AthleteProgram,
} from "@/hooks/useAthleteProgram";
import { useTrainingPrograms } from "@/hooks/useTrainingPrograms";
import { AssignProgramDialog } from "@/components/training/AssignProgramDialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import type { User as UserType } from "@shared/schema";

interface OrgAthlete {
  id: string;
  name: string;
}

export default function TrainingAssignmentsPage() {
  const { isEnabled, isLoading, organizationId } = useTrainingAccess();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showAssignDialog, setShowAssignDialog] = useState(false);

  useEffect(() => {
    if (!isLoading && !isEnabled) {
      navigate("/");
    }
  }, [isEnabled, isLoading, navigate]);

  const { data: assignments = [], isLoading: assignmentsLoading } = useTrainingAssignments(organizationId);
  const { data: programs = [] } = useTrainingPrograms(organizationId);
  const createAssignment = useCreateAssignment();
  const updateStatus = useUpdateAssignmentStatus();

  // Fetch org athletes for the assign dialog
  const { data: orgAthletes = [] } = useQuery<OrgAthlete[]>({
    queryKey: ["/api/organizations", organizationId, "athletes"],
    queryFn: async () => {
      if (!organizationId) return [];
      const response = await fetch(`/api/organizations/${organizationId}/users?role=athlete`, {
        credentials: "include",
      });
      if (!response.ok) return [];
      const users = await response.json();
      return users.map((u: UserType & { fullName?: string; firstName?: string; lastName?: string }) => ({
        id: u.id,
        name: u.fullName ?? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ?? u.id,
      }));
    },
    enabled: !!organizationId,
  });

  if (isLoading || !isEnabled) return null;

  const activePrograms = programs.filter((p) => p.isActive);
  const activeAssignments = assignments.filter((a) => a.status === "active");
  const pastAssignments = assignments.filter((a) => a.status !== "active");

  async function handleAssign(values: { athleteId: string; programId: string; startDate: string }) {
    try {
      await createAssignment.mutateAsync(values);
      setShowAssignDialog(false);
      toast({ title: "Program assigned", description: "Training program has been assigned to the athlete." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to assign program.";
      const isConflict = message.toLowerCase().includes("active") || message.includes("409");
      toast({
        title: "Assignment failed",
        description: isConflict
          ? "This athlete already has an active training program. Cancel it first."
          : message,
        variant: "destructive",
      });
    }
  }

  async function handleCancel(assignment: AthleteProgram) {
    if (!window.confirm("Cancel this assignment? The athlete will no longer have an active program.")) return;
    try {
      await updateStatus.mutateAsync({ assignmentId: assignment.id, status: "cancelled" });
      toast({ title: "Assignment cancelled" });
    } catch {
      toast({ title: "Error", description: "Failed to cancel assignment.", variant: "destructive" });
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Dumbbell className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold">Program Assignments</h1>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
            Experimental
          </span>
        </div>
        <Button
          onClick={() => setShowAssignDialog(true)}
          data-testid="assign-program-button"
          disabled={activePrograms.length === 0}
        >
          <Plus className="h-4 w-4 mr-2" />
          Assign Program
        </Button>
      </div>

      {activePrograms.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-800">
          No active programs available.{" "}
          <Link href="/training/programs" className="underline font-medium">Create a program first.</Link>
        </div>
      )}

      {assignmentsLoading ? (
        <p className="text-sm text-muted-foreground">Loading assignments...</p>
      ) : assignments.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No assignments yet</p>
          <p className="text-muted-foreground text-sm mt-1">Assign a training program to an athlete to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeAssignments.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Active ({activeAssignments.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeAssignments.map((assignment) => (
                  <Card key={assignment.id} data-testid={`assignment-card-${assignment.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">
                          <Link
                            href={`/training/athletes/${assignment.athleteId}`}
                            className="hover:underline text-primary"
                          >
                            {assignment.athleteId}
                          </Link>
                        </CardTitle>
                        <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <Dumbbell className="h-3.5 w-3.5" />
                          <span>{assignment.program?.name ?? "Unknown program"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Started {formatDate(assignment.startDate)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{assignment.program?.durationWeeks ?? "?"} weeks</span>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Link href={`/training/athletes/${assignment.athleteId}`} className="flex-1">
                          <Button variant="outline" size="sm" className="w-full">
                            View Schedule
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleCancel(assignment)}
                          data-testid={`cancel-assignment-${assignment.id}`}
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {pastAssignments.length > 0 && (
            <div className="opacity-60">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Past ({pastAssignments.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pastAssignments.map((assignment) => (
                  <Card key={assignment.id} data-testid={`assignment-card-past-${assignment.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <span className="font-medium">{assignment.athleteId}</span>
                          <p className="text-muted-foreground">{assignment.program?.name}</p>
                        </div>
                        <Badge variant="outline" className="capitalize">{assignment.status}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <AssignProgramDialog
        open={showAssignDialog}
        onOpenChange={setShowAssignDialog}
        athletes={orgAthletes}
        programs={activePrograms.map((p) => ({
          id: p.id,
          name: p.name,
          durationWeeks: p.durationWeeks,
        }))}
        onSubmit={handleAssign}
        isSubmitting={createAssignment.isPending}
      />
    </div>
  );
}
