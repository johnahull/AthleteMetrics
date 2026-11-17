import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AthleteSelector } from "@/components/ui/athlete-selector";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiClient, queries } from "@/lib/api";
import { localDateString } from "@/utils/sprint-runs";
import { useCreateAthleteNote, useUpdateAthleteNote, type AthleteNoteRow } from "@/lib/athlete-notes-api";
import {
  ATHLETE_NOTE_BODY_MAX,
  ATHLETE_NOTE_CATEGORIES,
  athleteNoteInputSchema,
  type AthleteNoteCategory,
  type AthleteNoteInput,
} from "@shared/athlete-notes";

export const CATEGORY_LABEL: Record<AthleteNoteCategory, string> = {
  technique: "Technique",
  effort: "Effort",
  readiness: "Readiness",
  injury: "Injury",
  mindset: "Mindset",
  goal: "Goal",
  other: "Other",
};

const NONE = "none";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed athlete (profile card). Without it the dialog asks which athlete, after the organization. */
  athlete?: { id: string; name: string };
  /** Edit this note instead of adding one. The organization and athlete of a note never change. */
  note?: AthleteNoteRow;
  defaultOrganizationId?: string | null;
  /** Where this athlete can get a note (from the server). Without it: the viewer's own coach / admin organizations. */
  organizationOptions?: Array<{ id: string; name: string }>;
}

const emptyValues = (): AthleteNoteInput => ({ body: "", observedOn: localDateString(), category: null, flagged: false, eventId: null });

export function AddCoachingNoteDialog({ open, onOpenChange, athlete, note, defaultOrganizationId, organizationOptions }: Props) {
  const { toast } = useToast();
  const { user, userOrganizations } = useAuth();
  const create = useCreateAthleteNote();
  const update = useUpdateAthleteNote(note?.athleteId ?? athlete?.id ?? "");
  const editing = !!note;
  const siteAdmin = !!user?.isSiteAdmin;

  // Organizations the viewer can write notes in: their coach / org admin memberships (a site admin: any organization)
  const { data: allOrgs } = useQuery({ ...queries.organizations(), enabled: open && siteAdmin && !editing && !organizationOptions });
  const orgOptions = useMemo(() => {
    if (organizationOptions) return organizationOptions;
    if (siteAdmin) return ((allOrgs as Array<{ id: string; name: string }> | undefined) ?? []).map((o) => ({ id: o.id, name: o.name }));
    return (userOrganizations ?? [])
      .filter((o) => o.role === "org_admin" || o.role === "coach")
      .map((o) => ({ id: o.organizationId, name: o.organizationName }));
  }, [organizationOptions, siteAdmin, allOrgs, userOrganizations]);

  // What the user picked, or the default to start from. It only counts while it is one of the offered organizations.
  const [chosenOrganizationId, setChosenOrganizationId] = useState("");
  const [picked, setPicked] = useState<{ id: string; fullName: string } | null>(null);

  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<AthleteNoteInput>({
    defaultValues: emptyValues(),
    resolver: zodResolver(athleteNoteInputSchema),
  });

  // Start fresh (or prefilled when editing) each time the dialog opens
  useEffect(() => {
    if (!open) return;
    reset(note
      ? { body: note.body, observedOn: note.observedOn, category: note.category, flagged: note.flagged, eventId: note.eventId }
      : emptyValues());
    setPicked(null);
    setChosenOrganizationId(note?.organizationId ?? defaultOrganizationId ?? "");
  }, [open, note, defaultOrganizationId, reset]);

  // A note never moves. A new one goes to the chosen organization if it is offered, else to the only one offered, else none.
  const organizationId = note
    ? note.organizationId
    : orgOptions.some((o) => o.id === chosenOrganizationId)
      ? chosenOrganizationId
      : orgOptions.length === 1
        ? orgOptions[0].id
        : "";

  // An event belongs to one organization: drop the linked event whenever the organization changes
  useEffect(() => {
    if (!note) setValue("eventId", null);
  }, [organizationId, note, setValue]);

  const needsPicker = !athlete && !editing;
  const { data: athletes } = useQuery({
    ...queries.athletes({ organizationId }),
    enabled: open && needsPicker && !!organizationId,
  });
  const { data: events } = useQuery({
    queryKey: ["athlete-note-events", organizationId],
    queryFn: () => apiClient.get<Array<{ id: string; name: string }>>("/events", { organizationId }),
    enabled: open && !!organizationId,
  });

  const athleteId = note?.athleteId ?? athlete?.id ?? picked?.id;
  const category = watch("category");
  const bodyLen = watch("body").length;
  const saving = create.isPending || update.isPending;
  const canSave = !!athleteId && !!organizationId && !saving;

  const onSubmit = handleSubmit(async (values) => {
    if (!athleteId || !organizationId) return;
    const fields = { ...values, category: values.category ?? null, flagged: values.flagged ?? false, eventId: values.eventId ?? null };
    try {
      if (note) await update.mutateAsync({ id: note.id, ...fields });
      else await create.mutateAsync({ athleteId, organizationId, ...fields });
      toast({ title: "Success", description: note ? "Note updated" : "Note added" });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save the note", variant: "destructive" });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="coaching-note-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit coaching note" : "Add coaching note"}</DialogTitle>
          <DialogDescription>
            {athlete?.name ? `A private observation about ${athlete.name}.` : "A private observation. Only coaches and admins of the organization can see it."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {!editing && orgOptions.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="note-org">Organization</Label>
              <Select value={organizationId} onValueChange={(v) => { setChosenOrganizationId(v); setPicked(null); }}>
                <SelectTrigger id="note-org" data-testid="note-org-select"><SelectValue placeholder="Choose an organization" /></SelectTrigger>
                <SelectContent>
                  {orgOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {!editing && !!organizationOptions && orgOptions.length === 0 && (
            <p role="alert" className="text-sm text-destructive" data-testid="no-writable-org">
              This athlete is not in an organization where you can add notes.
            </p>
          )}

          {needsPicker && (
            <div className="space-y-1" role="group" aria-labelledby="note-athlete-label">
              <Label id="note-athlete-label">Athlete</Label>
              <AthleteSelector
                athletes={(athletes as any[] | undefined) ?? []}
                selectedAthlete={picked as any}
                onSelect={(a) => setPicked(a ? { id: a.id, fullName: a.fullName } : null)}
                placeholder={organizationId ? "Choose an athlete" : "Choose an organization first"}
                disabled={!organizationId}
                data-testid="note-athlete-selector"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="note-date">Observed on</Label>
              <Input id="note-date" type="date" aria-invalid={!!errors.observedOn} {...register("observedOn")} />
              {errors.observedOn && <p role="alert" className="text-xs text-destructive">{errors.observedOn.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="note-category">Category</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)}>
                    <SelectTrigger id="note-category" data-testid="note-category-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No category</SelectItem>
                      {ATHLETE_NOTE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {category === "injury" && (
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground" data-testid="injury-helper">
              Record what you saw and any restriction from the PT/AT. No diagnoses.
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="note-body">Note</Label>
            <Textarea id="note-body" rows={5} placeholder="What did you see?" aria-invalid={!!errors.body} {...register("body")} />
            <div className="flex justify-between text-xs text-muted-foreground">
              {errors.body ? <span role="alert" className="text-destructive">Write a note (up to 4000 characters)</span> : <span />}
              <span className="ml-auto">{bodyLen} / {ATHLETE_NOTE_BODY_MAX}</span>
            </div>
          </div>

          {!!organizationId && (
            <div className="space-y-1">
              <Label htmlFor="note-event">Event (optional)</Label>
              <Controller
                control={control}
                name="eventId"
                render={({ field }) => (
                  <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)}>
                    <SelectTrigger id="note-event"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No event</SelectItem>
                      {(events ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="flagged"
              render={({ field }) => <Switch id="note-flagged" checked={!!field.value} onCheckedChange={field.onChange} />}
            />
            <Label htmlFor="note-flagged">Pin to the top (e.g. an active restriction)</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!canSave} data-testid="save-note">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
