import { useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ChevronDown, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { getOrgRole } from "@/lib/org-roles";
import { toCalendarDate } from "@/utils/date-utils";
import { useAthleteNotes, useDeleteAthleteNote, type AthleteNoteRow } from "@/lib/athlete-notes-api";
import { AddCoachingNoteDialog, CATEGORY_LABEL } from "./AddCoachingNoteDialog";

interface Props {
  athleteId: string;
  athleteName: string;
  className?: string;
}

/** At or below this many notes the card starts open: collapsing would only hide a handful of rows */
const OPEN_BY_DEFAULT_MAX = 3;
/** Unpinned notes shown when the card is open, before "Show all" */
const OPEN_CAP = 10;
/** A body this long (or with a line break) is clamped to two lines, with a Show more toggle */
const CLAMP_CHARS = 80;

/** One note. Owns its own "Show more" state. */
function NoteRow({
  note,
  manyOrgs,
  onEdit,
  onDelete,
}: {
  note: AthleteNoteRow;
  manyOrgs: boolean;
  onEdit: (note: AthleteNoteRow) => void;
  onDelete: (id: string) => void;
}) {
  const { user, userOrganizations } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const role = getOrgRole(user, userOrganizations, note.organizationId);
  const isAuthor = !!user && note.authorId === user.id;
  const canDelete = isAuthor || role === "org_admin" || role === "site_admin";
  const date = toCalendarDate(note.observedOn);
  const clampable = note.body.length > CLAMP_CHARS || note.body.includes("\n");
  return (
    <li className="py-3" data-testid="coaching-note">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {note.flagged && (
          <span className="inline-flex items-center gap-1 font-medium text-amber-700" data-testid="note-flagged">
            <Pin className="h-3.5 w-3.5" aria-hidden /> Pinned
          </span>
        )}
        <span className="font-medium">{date ? format(date, "MMM d, yyyy") : note.observedOn}</span>
        {note.category && <Badge variant="secondary">{CATEGORY_LABEL[note.category]}</Badge>}
        {note.eventId && note.eventName && (
          <Link href={`/events/${note.eventId}`} className="text-primary underline-offset-2 hover:underline">
            {note.eventName}
          </Link>
        )}
        <span className="text-muted-foreground">
          {note.authorName ?? "Former coach"}
          {manyOrgs && ` · ${note.organizationName}`}
        </span>
        <span className="ml-auto flex gap-1">
          {isAuthor && (
            <Button variant="ghost" size="icon" aria-label="Edit note" onClick={() => onEdit(note)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDelete && (
            <ConfirmationDialog
              title="Delete this note?"
              description="This permanently deletes the note. It cannot be undone."
              confirmText="Delete"
              onConfirm={() => onDelete(note.id)}
            >
              <Button variant="ghost" size="icon" aria-label="Delete note">
                <Trash2 className="h-4 w-4" />
              </Button>
            </ConfirmationDialog>
          )}
        </span>
      </div>
      <p className={`mt-1 whitespace-pre-wrap text-sm text-gray-800${clampable && !expanded ? " line-clamp-2" : ""}`}>
        {note.body}
      </p>
      {clampable && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </li>
  );
}

/**
 * Coaching notes about one athlete (AM-FEAT-025). The server decides who sees them: the card renders only when the
 * list loads, so an athlete, a parent or a coach of another organization never sees it (not even a placeholder).
 *
 * Pinned notes are always shown. The rest sit behind a collapse (closed by default above OPEN_BY_DEFAULT_MAX notes)
 * and, once open, are capped at OPEN_CAP until "Show all".
 */
export function CoachingNotesCard({ athleteId, athleteName, className }: Props) {
  const { organizationContext } = useAuth();
  const { toast } = useToast();
  const { data, isSuccess } = useAthleteNotes(athleteId);
  const remove = useDeleteAthleteNote(athleteId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AthleteNoteRow | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  // undefined = the user has not chosen yet, so the note count decides
  const [openChoice, setOpenChoice] = useState<boolean | undefined>();
  const [showAll, setShowAll] = useState(false);
  const summaryId = useId();

  // undefined until the list has loaded, so the first load is not mistaken for "notes were added"
  const noteCount = isSuccess && data ? data.notes.length : undefined;
  const prevCount = useRef<number | undefined>(undefined);
  // Layout effect: no frame where the new note renders into a still-collapsed card
  useLayoutEffect(() => {
    if (noteCount === undefined) return;
    // A note added while the card is collapsed would otherwise vanish into the hidden part
    if (prevCount.current !== undefined && noteCount > prevCount.current) setOpenChoice(true);
    prevCount.current = noteCount;
  }, [noteCount]);

  if (!isSuccess || !data) return null;
  const { notes, writableOrganizations } = data;

  const manyOrgs = new Set(notes.map((n) => n.organizationId)).size > 1;
  const pinned = notes.filter((n) => n.flagged);
  const unpinned = notes.filter((n) => !n.flagged);
  const isOpen = openChoice ?? notes.length <= OPEN_BY_DEFAULT_MAX;
  // The server sorts pinned notes first, so notes[0] can be an old pinned note: take the latest date explicitly
  const latest = notes.reduce<string | undefined>((m, n) => (!m || n.observedOn > m ? n.observedOn : m), undefined);
  const latestDate = latest ? toCalendarDate(latest) : undefined;
  const summary = [
    `${notes.length} ${notes.length === 1 ? "note" : "notes"}`,
    pinned.length > 0 ? `${pinned.length} pinned` : null,
    latest ? `last ${latestDate ? format(latestDate, "MMM d, yyyy") : latest}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const shown = showAll ? unpinned : unpinned.slice(0, OPEN_CAP);

  const handleOpenChange = (next: boolean) => {
    setOpenChoice(next);
    if (!next) setShowAll(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast({ title: "Success", description: "Note deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete the note", variant: "destructive" });
    }
  };

  const handleEdit = (note: AthleteNoteRow) => {
    setEditing(note);
    setEditOpen(true);
  };

  const row = (note: AthleteNoteRow) => (
    <NoteRow key={note.id} note={note} manyOrgs={manyOrgs} onEdit={handleEdit} onDelete={handleDelete} />
  );

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange} asChild>
      <Card className={className ?? "bg-white mb-8"} data-testid="coaching-notes-card">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            {unpinned.length > 0 ? (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-describedby={summaryId}
                  data-testid="coaching-notes-toggle"
                >
                  <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? "" : "-rotate-90"}`} aria-hidden />
                  <span className="text-2xl font-semibold leading-none tracking-tight">Coaching Notes</span>
                </button>
              </CollapsibleTrigger>
            ) : (
              <CardTitle>Coaching Notes</CardTitle>
            )}
            {writableOrganizations.length > 0 && (
              <Button size="sm" onClick={() => setAdding(true)} data-testid="add-note-button">
                <Plus className="mr-1 h-4 w-4" /> Add note
              </Button>
            )}
          </div>
          {notes.length > 0 && (
            <p id={summaryId} className="text-sm text-muted-foreground" data-testid="coaching-notes-summary">
              {summary}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="no-notes">
              No notes yet. Notes are private to the coaches and admins of the organization.
            </p>
          ) : (
            <>
              {pinned.length > 0 && <ul className="divide-y">{pinned.map(row)}</ul>}
              {unpinned.length > 0 && (
                <CollapsibleContent>
                  <ul className={`divide-y${pinned.length > 0 ? " border-t" : ""}`}>{shown.map(row)}</ul>
                  {unpinned.length > OPEN_CAP && (
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? "Show fewer" : `Show ${unpinned.length - OPEN_CAP} more`}
                    </Button>
                  )}
                </CollapsibleContent>
              )}
            </>
          )}
        </CardContent>

        <AddCoachingNoteDialog
          open={adding}
          onOpenChange={setAdding}
          athlete={{ id: athleteId, name: athleteName }}
          organizationOptions={writableOrganizations}
          defaultOrganizationId={organizationContext}
        />
        <AddCoachingNoteDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          athlete={{ id: athleteId, name: athleteName }}
          note={editing}
        />
      </Card>
    </Collapsible>
  );
}
