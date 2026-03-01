/**
 * AssignProgramDialog
 *
 * Dialog for assigning a training program to an athlete.
 * Fields: athlete selector (dropdown), program selector (dropdown), startDate.
 * Submits POST /api/training/assignments.
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
import { Button } from "@/components/ui/button";

const assignProgramSchema = z.object({
  athleteId: z.string().min(1, "Please select an athlete"),
  programId: z.string().min(1, "Please select a program"),
  startDate: z.string().min(1, "Please select a start date"),
});

type AssignProgramValues = z.infer<typeof assignProgramSchema>;

export interface AthleteOption {
  id: string;
  name: string;
}

export interface ProgramOption {
  id: string;
  name: string;
  durationWeeks: number;
}

interface AssignProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athletes: AthleteOption[];
  programs: ProgramOption[];
  onSubmit: (values: AssignProgramValues) => Promise<void>;
  isSubmitting?: boolean;
}

export function AssignProgramDialog({
  open,
  onOpenChange,
  athletes,
  programs,
  onSubmit,
  isSubmitting = false,
}: AssignProgramDialogProps) {
  const today = new Date().toISOString().split("T")[0];

  const form = useForm<AssignProgramValues>({
    resolver: zodResolver(assignProgramSchema),
    defaultValues: {
      athleteId: "",
      programId: "",
      startDate: today,
    },
  });

  async function handleSubmit(values: AssignProgramValues) {
    await onSubmit(values);
    form.reset({ athleteId: "", programId: "", startDate: today });
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      form.reset({ athleteId: "", programId: "", startDate: today });
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Training Program</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="athleteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Athlete *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="assign-athlete-select">
                        <SelectValue placeholder="Select athlete" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {athletes.map((athlete) => (
                        <SelectItem key={athlete.id} value={athlete.id}>
                          {athlete.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="programId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Training Program *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="assign-program-select">
                        <SelectValue placeholder="Select program" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {programs.map((program) => (
                        <SelectItem key={program.id} value={program.id}>
                          {program.name} ({program.durationWeeks}w)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date *</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      data-testid="assign-start-date-input"
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
                disabled={isSubmitting || athletes.length === 0 || programs.length === 0}
                data-testid="assign-program-submit"
              >
                {isSubmitting ? "Assigning..." : "Assign Program"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
