import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { CreateReportTemplateInput, UpdateReportTemplateInput } from "@shared/report-template-schemas";
import {
  useCreateReportTemplate,
  useUpdateReportTemplate,
  type ReportTemplate,
} from "@/lib/report-templates-api";

interface SaveReportTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  /** Template-shaped values from the wizard (metrics, benchmarks, charts). */
  payload: Omit<CreateReportTemplateInput, "name" | "description">;
  /** The template the wizard was prefilled from, if any; offers "update existing". */
  loadedTemplate?: ReportTemplate;
  onSaved: (template: ReportTemplate) => void;
}

/** apiRequest errors read "400: <body>"; the body is usually JSON with a message. */
function serverMessage(error: string): string | undefined {
  const body = error.slice(error.indexOf(":") + 1).trim();
  try {
    return JSON.parse(body).message || undefined;
  } catch {
    return body || undefined;
  }
}

// Not a <form>: React bubbles submit events through the dialog portal into the wizard's own form.
export function SaveReportTemplateDialog({
  open,
  onClose,
  organizationId,
  payload,
  loadedTemplate,
  onSaved,
}: SaveReportTemplateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateReportTemplate(organizationId);
  const update = useUpdateReportTemplate();
  const isPending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setUpdateExisting(!!loadedTemplate);
    setName(loadedTemplate?.name ?? "");
    setDescription(loadedTemplate?.description ?? "");
    setError(null);
  }, [open, loadedTemplate]);

  const save = async () => {
    setError(null);
    const trimmed = description.trim();
    const body = { ...payload, name: name.trim() };
    try {
      const saved =
        updateExisting && loadedTemplate
          // null clears a description on update; create just omits it
          ? await update.mutateAsync({ id: loadedTemplate.id, data: { ...body, description: trimmed || null } as UpdateReportTemplateInput })
          : await create.mutateAsync({ ...body, description: trimmed || undefined });
      onSaved(saved);
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        message.startsWith("409")
          ? "A template with this name already exists."
          : (message.startsWith("400") && serverMessage(message)) || "Could not save the template. Please try again.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Saves the metrics, benchmark sets, benchmarks and charts for reuse by your organization.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {loadedTemplate && (
            <div className="flex items-center gap-x-2">
              <Checkbox
                id="template-update-existing"
                checked={updateExisting}
                onCheckedChange={(v) => setUpdateExisting(v === true)}
              />
              <Label htmlFor="template-update-existing" className="cursor-pointer">
                Update "{loadedTemplate.name}"
              </Label>
            </div>
          )}
          <div>
            <Label htmlFor="template-name">Template name *</Label>
            <Input
              id="template-name"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Speed and power"
            />
          </div>
          <div>
            <Label htmlFor="template-description">Description (optional)</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={isPending || !name.trim()}>
            {isPending ? <LoadingSpinner /> : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
