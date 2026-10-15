/**
 * SaveEvalTemplateDialog - "Save metrics as template" on the event's Metrics tab (AM-FEAT-019 P5).
 * Stores the event's current metric set as an eval battery template for the organization.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage, useSaveEventAsTemplate } from "@/hooks/use-eval-report";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Enter a name for the template").max(200, "Keep the name to 200 characters or fewer"),
});
type NameForm = z.infer<typeof nameSchema>;

interface SaveEvalTemplateDialogProps {
  eventId: string;
  organizationId: string | undefined;
  /** Coach, org admin or site admin */
  canSave: boolean;
  /** False while the event has no metrics (the API answers 400 for an empty event) */
  hasMetrics?: boolean;
}

export function SaveEvalTemplateDialog({ eventId, organizationId, canSave, hasMetrics = true }: SaveEvalTemplateDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const save = useSaveEventAsTemplate(eventId, organizationId);
  const form = useForm<NameForm>({ resolver: zodResolver(nameSchema), defaultValues: { name: "" } });

  if (!canSave || !hasMetrics) return null;

  // A half-typed name must not come back the next time the dialog opens
  const changeOpen = (next: boolean) => {
    if (!next) form.reset();
    setOpen(next);
  };

  const onSubmit = form.handleSubmit(async ({ name }) => {
    try {
      await save.mutateAsync({ name });
      toast({ title: "Template saved", description: `"${name}" can now be used when you create an event.` });
      form.reset();
      setOpen(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save the template", description: apiErrorMessage(error, "Failed to save the template.") });
    }
  });

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          Save metrics as template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save metrics as template</DialogTitle>
          <DialogDescription>
            Saves this event's tests as a template, so a new eval can start with the same tests already set up.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="eval-template-name">Template name</Label>
            <Input id="eval-template-name" autoComplete="off" aria-invalid={!!form.formState.errors.name} {...form.register("name")} />
            {form.formState.errors.name && (
              <p role="alert" className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
