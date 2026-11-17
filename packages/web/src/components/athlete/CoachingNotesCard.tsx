import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/**
 * Coaching notes about one athlete (AM-FEAT-025). The server decides who sees them: the card renders only when the
 * list loads, so an athlete, a parent or a coach of another organization never sees it (not even a placeholder).
 */
export function CoachingNotesCard({ athleteId, athleteName, className }: Props) {
  const { user, userOrganizations, organizationContext } = useAuth();
  const { toast } = useToast();
  const { data, isSuccess } = useAthleteNotes(athleteId);
  const remove = useDeleteAthleteNote(athleteId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AthleteNoteRow | undefined>();
  const [editOpen, setEditOpen] = useState(false);

  if (!isSuccess || !data) return null;
  const { notes, writableOrganizations } = data;

  const manyOrgs = new Set(notes.map((n) => n.organizationId)).size > 1;

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast({ title: "Success", description: "Note deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete the note", variant: "destructive" });
    }
  };

  return (
    <Card className={className ?? "bg-white mb-8"} data-testid="coaching-notes-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Coaching Notes</CardTitle>
          {writableOrganizations.length > 0 && (
            <Button size="sm" onClick={() => setAdding(true)} data-testid="add-note-button">
              <Plus className="mr-1 h-4 w-4" /> Add note
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="no-notes">
            No notes yet. Notes are private to the coaches and admins of the organization.
          </p>
        ) : (
          <ul className="divide-y">
            {notes.map((note) => {
              const role = getOrgRole(user, userOrganizations, note.organizationId);
              const isAuthor = !!user && note.authorId === user.id;
              const canDelete = isAuthor || role === "org_admin" || role === "site_admin";
              const date = toCalendarDate(note.observedOn);
              return (
                <li key={note.id} className="py-3" data-testid="coaching-note">
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
                        <Button variant="ghost" size="icon" aria-label="Edit note" onClick={() => { setEditing(note); setEditOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <ConfirmationDialog
                          title="Delete this note?"
                          description="This permanently deletes the note. It cannot be undone."
                          confirmText="Delete"
                          onConfirm={() => handleDelete(note.id)}
                        >
                          <Button variant="ghost" size="icon" aria-label="Delete note">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </ConfirmationDialog>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{note.body}</p>
                </li>
              );
            })}
          </ul>
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
  );
}
