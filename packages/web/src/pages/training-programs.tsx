/**
 * Training Programs Page (Coach / Org Admin)
 * Route: /training/programs
 *
 * Program list with cards, "New Program" button.
 * Links to program builder for each program.
 */

import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useEffect } from "react";
import { Dumbbell, Plus, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTrainingAccess } from "@/hooks/use-training-access";
import { useTrainingPrograms, useCreateProgram, useArchiveProgram } from "@/hooks/useTrainingPrograms";
import { ProgramMetaForm, type ProgramMetaValues } from "@/components/training/ProgramMetaForm";
import { useToast } from "@/hooks/use-toast";

export default function TrainingProgramsPage() {
  const { isEnabled, isLoading, organizationId } = useTrainingAccess();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    if (!isLoading && !isEnabled) {
      navigate("/");
    }
  }, [isEnabled, isLoading, navigate]);

  const { data: programs = [], isLoading: programsLoading } = useTrainingPrograms(organizationId);
  const createProgram = useCreateProgram();
  const archiveProgram = useArchiveProgram();

  if (isLoading || !isEnabled) return null;

  const activePrograms = programs.filter((p) => p.isActive);
  const archivedPrograms = programs.filter((p) => !p.isActive);

  async function handleCreate(values: ProgramMetaValues) {
    try {
      const newProgram = await createProgram.mutateAsync(values);
      setShowCreateDialog(false);
      toast({ title: "Program created" });
      navigate(`/training/programs/${newProgram.id}`);
    } catch {
      toast({ title: "Error", description: "Failed to create program.", variant: "destructive" });
    }
  }

  async function handleArchive(programId: string, name: string) {
    if (!window.confirm(`Archive "${name}"? Athletes with active assignments will not be affected.`)) return;
    try {
      await archiveProgram.mutateAsync(programId);
      toast({ title: "Program archived" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to archive program.";
      const isConflict = message.includes("409") || message.toLowerCase().includes("active");
      toast({
        title: "Cannot archive",
        description: isConflict
          ? "This program has active athlete assignments. Complete or cancel them first."
          : message,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Dumbbell className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold">Training Programs</h1>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
            Experimental
          </span>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="new-program-button">
          <Plus className="h-4 w-4 mr-2" />
          New Program
        </Button>
      </div>

      {programsLoading ? (
        <p className="text-sm text-muted-foreground">Loading programs...</p>
      ) : programs.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No programs yet</p>
          <p className="text-muted-foreground text-sm mt-1">Create your first training program to get started.</p>
          <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create First Program
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {activePrograms.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Active ({activePrograms.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activePrograms.map((program) => (
                  <Card key={program.id} data-testid={`program-card-${program.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{program.name}</CardTitle>
                          {program.sport && (
                            <CardDescription className="text-xs mt-0.5 capitalize">
                              {program.sport}
                            </CardDescription>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0 ml-2">
                          Active
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {program.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{program.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {program.durationWeeks} week{program.durationWeeks !== 1 ? "s" : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(program.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/training/programs/${program.id}`} className="flex-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            data-testid={`program-edit-button-${program.id}`}
                          >
                            Edit Program
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleArchive(program.id, program.name)}
                          data-testid={`program-archive-button-${program.id}`}
                        >
                          Archive
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {archivedPrograms.length > 0 && (
            <div className="opacity-60">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Archived ({archivedPrograms.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedPrograms.map((program) => (
                  <Card key={program.id} data-testid={`program-card-archived-${program.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{program.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Link href={`/training/programs/${program.id}`}>
                        <Button variant="outline" size="sm" data-testid={`program-view-button-${program.id}`}>
                          View
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Training Program</DialogTitle>
          </DialogHeader>
          <ProgramMetaForm
            onSubmit={handleCreate}
            isSubmitting={createProgram.isPending}
            submitLabel="Create Program"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
