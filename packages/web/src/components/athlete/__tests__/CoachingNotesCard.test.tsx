import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
// West of UTC: a note dated 2026-03-05 must still read Mar 5 (a naive new Date("2026-03-05") would show Mar 4)
process.env.TZ = "America/Los_Angeles";

import { CoachingNotesCard } from "../CoachingNotesCard";
import type { AthleteNoteRow } from "@/lib/athlete-notes-api";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

let mockUser: any;
let mockOrgs: any[];
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, userOrganizations: mockOrgs, organizationContext: "org1" }),
}));

let query: { isSuccess: boolean; data?: AthleteNoteRow[] };
let writable: Array<{ id: string; name: string }> = [{ id: "org1", name: "Org One" }];
const removeNote = vi.fn();
vi.mock("@/lib/athlete-notes-api", () => ({
  useAthleteNotes: () => ({
    isSuccess: query.isSuccess,
    data: query.isSuccess ? { notes: query.data ?? [], writableOrganizations: writable } : undefined,
  }),
  useDeleteAthleteNote: () => ({ mutateAsync: removeNote, isPending: false }),
}));

// The dialog has its own tests: here it only shows how the card opens it
vi.mock("../AddCoachingNoteDialog", () => ({
  CATEGORY_LABEL: { technique: "Technique", injury: "Injury", other: "Other" },
  AddCoachingNoteDialog: ({ open, athlete, note, organizationOptions }: any) =>
    open ? (
      <div data-testid="dialog-stub">
        {note ? `edit:${note.id}` : `add:${athlete?.id}:${(organizationOptions ?? []).map((o: any) => o.id).join(",")}`}
      </div>
    ) : null,
}));

const note = (over: Partial<AthleteNoteRow>): AthleteNoteRow => ({
  id: "n1",
  athleteId: "a1",
  organizationId: "org1",
  organizationName: "Org One",
  authorId: "me",
  authorName: "Coach Me",
  eventId: null,
  eventName: null,
  category: null,
  flagged: false,
  observedOn: "2026-03-05",
  body: "Dropped the hips late on the 505",
  createdAt: "2026-03-05T12:00:00.000Z",
  updatedAt: "2026-03-05T12:00:00.000Z",
  ...over,
});

const renderCard = () => render(<CoachingNotesCard athleteId="a1" athleteName="Sam Sprinter" />);

describe("CoachingNotesCard", () => {
  it("runs in a timezone west of UTC, so the calendar-date test below can fail", () => {
    expect(new Date("2026-03-05").getDate()).toBe(4);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: "me", isSiteAdmin: false };
    mockOrgs = [{ organizationId: "org1", organizationName: "Org One", role: "coach", createdAt: "" }];
    query = { isSuccess: true, data: [] };
    writable = [{ id: "org1", name: "Org One" }];
    removeNote.mockResolvedValue(undefined);
  });

  it("renders nothing until the list loads, so a viewer without access sees no card at all", () => {
    query = { isSuccess: false };
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an empty state with the privacy line", () => {
    renderCard();
    expect(screen.getByTestId("no-notes")).toHaveTextContent(/private to the coaches and admins/i);
  });

  it("lists notes with the calendar date, category, pin and event link", () => {
    query = {
      isSuccess: true,
      data: [
        note({ id: "n1", flagged: true, category: "injury", eventId: "e1", eventName: "Spring Eval" }),
        note({ id: "n2", observedOn: "2026-03-01", body: "Great effort in the 40" }),
      ],
    };
    renderCard();
    const rows = screen.getAllByTestId("coaching-note");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByTestId("note-flagged")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Mar 5, 2026")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Injury")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: "Spring Eval" })).toHaveAttribute("href", "/events/e1");
    expect(within(rows[1]).queryByTestId("note-flagged")).toBeNull();
    expect(within(rows[1]).getByText("Mar 1, 2026")).toBeInTheDocument();
  });

  it("offers Edit only on the viewer's own notes", () => {
    query = { isSuccess: true, data: [note({ id: "mine" }), note({ id: "theirs", authorId: "other", authorName: "Other Coach" })] };
    renderCard();
    const [mine, theirs] = screen.getAllByTestId("coaching-note");
    expect(within(mine).getByRole("button", { name: "Edit note" })).toBeInTheDocument();
    expect(within(theirs).queryByRole("button", { name: "Edit note" })).toBeNull();
  });

  it("offers Delete to the author, and to an org admin of that note's organization, but not to another coach", () => {
    query = { isSuccess: true, data: [note({ id: "theirs", authorId: "other", authorName: "Other Coach" })] };
    renderCard();
    expect(screen.queryByRole("button", { name: "Delete note" })).toBeNull();
  });

  it("lets an org admin delete someone else's note", () => {
    mockOrgs = [{ organizationId: "org1", organizationName: "Org One", role: "org_admin", createdAt: "" }];
    query = { isSuccess: true, data: [note({ id: "theirs", authorId: "other", authorName: "Other Coach" })] };
    renderCard();
    expect(screen.getByRole("button", { name: "Delete note" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit note" })).toBeNull();
  });

  it("lets a site admin delete someone else's note even though they are a member of no organization", () => {
    mockUser = { id: "me", isSiteAdmin: true };
    mockOrgs = [];
    query = { isSuccess: true, data: [note({ id: "theirs", authorId: "other", authorName: "Other Coach" })] };
    renderCard();
    expect(screen.getByRole("button", { name: "Delete note" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit note" })).toBeNull();
  });

  it("is org admin only per organization: admin of org2 cannot delete a note in org1", () => {
    mockOrgs = [{ organizationId: "org2", organizationName: "Org Two", role: "org_admin", createdAt: "" }];
    query = { isSuccess: true, data: [note({ id: "theirs", authorId: "other" })] };
    renderCard();
    expect(screen.queryByRole("button", { name: "Delete note" })).toBeNull();
  });

  it("uses the role in the note's own organization, not the one in scope: admin of org1 (in scope), coach of org2", () => {
    mockOrgs = [
      { organizationId: "org1", organizationName: "Org One", role: "org_admin", createdAt: "" },
      { organizationId: "org2", organizationName: "Org Two", role: "coach", createdAt: "" },
    ];
    query = { isSuccess: true, data: [note({ id: "theirs", organizationId: "org2", organizationName: "Org Two", authorId: "other" })] };
    renderCard();
    expect(screen.queryByRole("button", { name: "Delete note" })).toBeNull();
  });

  it("confirms before deleting, then deletes by id", async () => {
    query = { isSuccess: true, data: [note({ id: "mine" })] };
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(removeNote).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(removeNote).toHaveBeenCalledWith("mine"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Note deleted" }));
  });

  it("shows the organization on each note only when notes span several organizations", () => {
    query = { isSuccess: true, data: [note({ id: "n1" }), note({ id: "n2", organizationId: "org2", organizationName: "Org Two" })] };
    renderCard();
    expect(screen.getByText(/Org Two/)).toBeInTheDocument();
    expect(screen.getByText(/Org One/)).toBeInTheDocument();
  });

  it("offers no Add button when the athlete is in no organization the viewer can write in, but still shows the history", () => {
    writable = [];
    query = { isSuccess: true, data: [note({ id: "old" })] };
    renderCard();
    expect(screen.queryByTestId("add-note-button")).toBeNull();
    expect(screen.getByTestId("coaching-note")).toBeInTheDocument();
  });

  it("opens the dialog for the athlete on Add and for the note on Edit", () => {
    query = { isSuccess: true, data: [note({ id: "mine" })] };
    renderCard();
    fireEvent.click(screen.getByTestId("add-note-button"));
    expect(screen.getByTestId("dialog-stub")).toHaveTextContent("add:a1:org1");
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    expect(screen.getAllByTestId("dialog-stub").map((d) => d.textContent)).toContain("edit:mine");
  });
});
