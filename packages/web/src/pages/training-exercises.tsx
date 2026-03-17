/**
 * Training Exercises Page (Coach / Org Admin)
 * Route: /training/exercises
 *
 * Exercise library CRUD: view, add, edit, archive exercises.
 * Filter by category. Uses ExerciseCard grid + ExerciseForm dialog.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Dumbbell, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTrainingAccess } from "@/hooks/use-training-access";
import { useExercises, useCreateExercise, useUpdateExercise, useArchiveExercise } from "@/hooks/useExercises";
import { ExerciseCard, type Exercise } from "@/components/training/ExerciseCard";
import { ExerciseForm, type ExerciseFormValues } from "@/components/training/ExerciseForm";
import { useToast } from "@/hooks/use-toast";

export default function TrainingExercisesPage() {
  const { isEnabled, isLoading, organizationId } = useTrainingAccess();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  useEffect(() => {
    if (!isLoading && !isEnabled) {
      navigate("/");
    }
  }, [isEnabled, isLoading, navigate]);

  const { data: exercises = [], isLoading: exercisesLoading } = useExercises(organizationId);
  const createExercise = useCreateExercise();
  const updateExercise = useUpdateExercise();
  const archiveExercise = useArchiveExercise();

  if (isLoading || !isEnabled) return null;

  const categories = Array.from(
    new Set(exercises.map((e) => e.category).filter(Boolean) as string[])
  ).sort();

  const filtered = exercises.filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !categoryFilter || ex.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const activeFiltered = filtered.filter((e) => e.isActive);
  const archivedFiltered = filtered.filter((e) => !e.isActive);

  function toMutationPayload(values: ExerciseFormValues): Partial<Exercise> {
    return {
      name: values.name,
      category: values.category,
      exerciseType: values.exerciseType,
      defaultSets: values.defaultSets === "" ? null : (values.defaultSets as number | undefined) ?? null,
      defaultReps: values.defaultReps === "" ? null : (values.defaultReps as string | undefined) ?? null,
      defaultWeightLbs: values.defaultWeightLbs === "" ? null : String(values.defaultWeightLbs ?? ""),
      defaultDurationSeconds: values.defaultDurationSeconds === "" ? null : (values.defaultDurationSeconds as number | undefined) ?? null,
      notes: values.notes ?? null,
      videoUrl: values.videoUrl === "" ? null : (values.videoUrl ?? null),
    };
  }

  async function handleCreate(values: ExerciseFormValues) {
    try {
      await createExercise.mutateAsync(toMutationPayload(values));
      setShowCreateForm(false);
      toast({ title: "Exercise added", description: `${values.name} has been added to your library.` });
    } catch {
      toast({ title: "Error", description: "Failed to add exercise.", variant: "destructive" });
    }
  }

  async function handleEdit(values: ExerciseFormValues) {
    if (!editingExercise) return;
    try {
      await updateExercise.mutateAsync({ id: editingExercise.id, ...toMutationPayload(values) });
      setEditingExercise(null);
      toast({ title: "Exercise updated" });
    } catch {
      toast({ title: "Error", description: "Failed to update exercise.", variant: "destructive" });
    }
  }

  async function handleArchive(exercise: Exercise) {
    if (!window.confirm(`Archive "${exercise.name}"? It will no longer be available for new programs.`)) return;
    try {
      await archiveExercise.mutateAsync(exercise.id);
      toast({ title: "Exercise archived", description: `${exercise.name} has been archived.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to archive exercise.";
      const isConflict = message.includes("409") || message.toLowerCase().includes("conflict") || message.toLowerCase().includes("referenced");
      toast({
        title: "Cannot archive",
        description: isConflict
          ? "This exercise is used in an active program. Remove it from all programs first."
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
          <h1 className="text-3xl font-bold">Exercise Library</h1>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
            Experimental
          </span>
        </div>
        <Button onClick={() => setShowCreateForm(true)} data-testid="add-exercise-button">
          <Plus className="h-4 w-4 mr-2" />
          Add Exercise
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
            data-testid="exercise-search-input"
          />
        </div>
        {categories.length > 0 && (
          <select
            className="border rounded-md px-3 text-sm bg-background h-10"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            data-testid="exercise-category-filter"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}
      </div>

      {/* Exercise grid */}
      {exercisesLoading ? (
        <p className="text-muted-foreground text-sm">Loading exercises...</p>
      ) : activeFiltered.length === 0 && archivedFiltered.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No exercises found</p>
          <p className="text-muted-foreground text-sm mt-1">
            {searchQuery || categoryFilter
              ? "Try a different search or filter."
              : "Add your first exercise to get started."}
          </p>
          {!searchQuery && !categoryFilter && (
            <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Exercise
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {activeFiltered.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Active ({activeFiltered.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeFiltered.map((exercise) => (
                  <ExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    onEdit={setEditingExercise}
                    onArchive={handleArchive}
                  />
                ))}
              </div>
            </div>
          )}

          {archivedFiltered.length > 0 && (
            <div className="opacity-60">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Archived ({archivedFiltered.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedFiltered.map((exercise) => (
                  <ExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    onEdit={setEditingExercise}
                    onArchive={handleArchive}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create dialog */}
      <ExerciseForm
        open={showCreateForm}
        onOpenChange={setShowCreateForm}
        onSubmit={handleCreate}
        isSubmitting={createExercise.isPending}
        mode="create"
      />

      {/* Edit dialog */}
      <ExerciseForm
        open={!!editingExercise}
        onOpenChange={(open) => { if (!open) setEditingExercise(null); }}
        onSubmit={handleEdit}
        defaultValues={editingExercise ?? undefined}
        isSubmitting={updateExercise.isPending}
        mode="edit"
      />
    </div>
  );
}
