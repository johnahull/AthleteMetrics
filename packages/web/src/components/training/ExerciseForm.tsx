/**
 * ExerciseForm
 *
 * Dialog form for creating or editing an exercise in the library.
 * Fields: name (required), category (required), exerciseType (required),
 *         defaultSets, defaultReps, defaultWeightLbs, defaultRestSeconds, notes, videoUrl.
 * Uses React Hook Form + Zod validation.
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Exercise } from "./ExerciseCard";

const EXERCISE_TYPES = [
  { value: "weighted", label: "Weighted" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "speed", label: "Speed" },
  { value: "plyometric", label: "Plyometric" },
  { value: "timed", label: "Timed" },
] as const;

const exerciseFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  category: z.string().min(1, "Category is required").max(100),
  exerciseType: z.enum(["weighted", "bodyweight", "speed", "plyometric", "timed"], {
    required_error: "Exercise type is required",
  }),
  defaultSets: z.coerce.number().int().positive().optional().or(z.literal("")),
  defaultReps: z.coerce.number().int().positive().optional().or(z.literal("")),
  defaultWeightLbs: z.coerce.number().positive().optional().or(z.literal("")),
  defaultDurationSeconds: z.coerce.number().int().positive().optional().or(z.literal("")),
  notes: z.string().optional(),
  videoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

export type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;

interface ExerciseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ExerciseFormValues) => Promise<void>;
  defaultValues?: Partial<Exercise>;
  isSubmitting?: boolean;
  mode: "create" | "edit";
}

export function ExerciseForm({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  isSubmitting = false,
  mode,
}: ExerciseFormProps) {
  const form = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      category: defaultValues?.category ?? "",
      exerciseType: (defaultValues?.exerciseType as ExerciseFormValues["exerciseType"]) ?? undefined,
      defaultSets: defaultValues?.defaultSets ?? "",
      defaultReps: defaultValues?.defaultReps ?? "",
      defaultWeightLbs: defaultValues?.defaultWeightLbs ? parseFloat(defaultValues.defaultWeightLbs) : "",
      defaultDurationSeconds: defaultValues?.defaultDurationSeconds ?? "",
      notes: defaultValues?.notes ?? "",
      videoUrl: defaultValues?.videoUrl ?? "",
    },
  });

  const exerciseType = form.watch("exerciseType");

  async function handleSubmit(values: ExerciseFormValues) {
    await onSubmit(values);
    form.reset();
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      form.reset();
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Exercise" : "Edit Exercise"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Barbell Squat" {...field} data-testid="exercise-name-input" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Strength, Speed, Plyometric" {...field} data-testid="exercise-category-input" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="exerciseType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Exercise Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="exercise-type-select">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {EXERCISE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="defaultSets"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Sets</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g. 3"
                        {...field}
                        value={field.value === "" ? "" : field.value}
                        data-testid="exercise-default-sets-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultReps"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Reps</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g. 8"
                        {...field}
                        value={field.value === "" ? "" : field.value}
                        data-testid="exercise-default-reps-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {exerciseType === "weighted" && (
              <FormField
                control={form.control}
                name="defaultWeightLbs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Weight (lbs)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={2.5}
                        placeholder="e.g. 135"
                        {...field}
                        value={field.value === "" ? "" : field.value}
                        data-testid="exercise-default-weight-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {exerciseType === "timed" && (
              <FormField
                control={form.control}
                name="defaultDurationSeconds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Duration (seconds)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g. 30"
                        {...field}
                        value={field.value === "" ? "" : field.value}
                        data-testid="exercise-default-duration-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="videoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Video URL (YouTube/Vimeo)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://youtube.com/..." {...field} data-testid="exercise-video-url-input" />
                  </FormControl>
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
                      placeholder="Coaching cues, technique notes..."
                      rows={3}
                      {...field}
                      data-testid="exercise-notes-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="exercise-form-submit"
              >
                {isSubmitting ? "Saving..." : mode === "create" ? "Add Exercise" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
