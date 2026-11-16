import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom";
import { AddCoachingNoteDialog } from "../AddCoachingNoteDialog";
import type { AthleteNoteRow } from "@/lib/athlete-notes-api";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

let mockUser: any;
let mockOrgs: any[];
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mockUser, userOrganizations: mockOrgs }) }));

vi.mock("@/lib/api", () => ({
  queries: {
    organizations: () => ({ queryKey: ["organizations"], queryFn: async () => [{ id: "orgA", name: "Org A" }] }),
    athletes: (f: any) => ({ queryKey: ["athletes", f], queryFn: async () => [{ id: "a9", fullName: "Pat Picked" }] }),
  },
  apiClient: { get: vi.fn(async () => [{ id: "e1", name: "Spring Eval" }]) },
}));

const createNote = vi.fn();
const updateNote = vi.fn();
vi.mock("@/lib/athlete-notes-api", () => ({
  useCreateAthleteNote: () => ({ mutateAsync: createNote, isPending: false }),
  useUpdateAthleteNote: () => ({ mutateAsync: updateNote, isPending: false }),
}));

const existing: AthleteNoteRow = {
  id: "n1",
  athleteId: "a1",
  organizationId: "org1",
  organizationName: "Org One",
  authorId: "me",
  authorName: "Coach Me",
  eventId: null,
  eventName: null,
  category: "injury",
  flagged: true,
  observedOn: "2026-03-05",
  body: "Left hamstring tight, PT says no max velocity",
  createdAt: "",
  updatedAt: "",
};

const renderDialog = (props: Partial<React.ComponentProps<typeof AddCoachingNoteDialog>> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AddCoachingNoteDialog open onOpenChange={vi.fn()} {...props} />
    </QueryClientProvider>,
  );

describe("AddCoachingNoteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: "me", isSiteAdmin: false };
    mockOrgs = [
      { organizationId: "org1", organizationName: "Org One", role: "coach", createdAt: "" },
      { organizationId: "org3", organizationName: "Org Three", role: "athlete", createdAt: "" },
    ];
    createNote.mockResolvedValue({});
    updateNote.mockResolvedValue({});
  });

  it("with a fixed athlete: no athlete picker, and the single writer organization is chosen for the coach", async () => {
    const onOpenChange = vi.fn();
    renderDialog({ athlete: { id: "a1", name: "Sam Sprinter" }, onOpenChange });
    expect(screen.queryByTestId("note-athlete-selector")).toBeNull();
    // org3 is an athlete membership, so only org1 is offered and no Organization select is needed
    expect(screen.queryByTestId("note-org-select")).toBeNull();

    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "  Strong first step  " } });
    fireEvent.click(screen.getByTestId("save-note"));

    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: "a1",
        organizationId: "org1",
        body: "Strong first step",
        observedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        category: null,
        flagged: false,
        eventId: null,
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("uses the organizations the server offers for this athlete, and says so when there are none", async () => {
    const { unmount } = renderDialog({
      athlete: { id: "a1", name: "Sam Sprinter" },
      organizationOptions: [{ id: "orgX", name: "Org X" }, { id: "orgY", name: "Org Y" }],
    });
    expect(screen.getByTestId("note-org-select")).toBeInTheDocument();
    expect(screen.queryByTestId("no-writable-org")).toBeNull();
    unmount();

    renderDialog({ athlete: { id: "a1", name: "Sam Sprinter" }, organizationOptions: [] });
    expect(screen.getByTestId("no-writable-org")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Something" } });
    expect(screen.getByTestId("save-note")).toBeDisabled();
  });

  it("a single server-offered organization is chosen for the coach, even a site admin", async () => {
    mockUser = { id: "me", isSiteAdmin: true };
    mockOrgs = [];
    renderDialog({ athlete: { id: "a1", name: "Sam Sprinter" }, organizationOptions: [{ id: "orgX", name: "Org X" }] });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "From the admin" } });
    fireEvent.click(screen.getByTestId("save-note"));
    await waitFor(() => expect(createNote).toHaveBeenCalledWith(expect.objectContaining({ athleteId: "a1", organizationId: "orgX" })));
  });

  it("ignores a default organization the athlete is not in: saves to the one the server offers", async () => {
    // The real card always passes the viewer's current organization as the default
    renderDialog({
      athlete: { id: "a1", name: "Sam Sprinter" },
      defaultOrganizationId: "orgElsewhere",
      organizationOptions: [{ id: "orgX", name: "Org X" }],
    });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Saved where it can be" } });
    fireEvent.click(screen.getByTestId("save-note"));
    await waitFor(() => expect(createNote).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "orgX" })));
  });

  it("cannot save when the server offers no organization, even with a default organization in scope", () => {
    renderDialog({ athlete: { id: "a1", name: "Sam Sprinter" }, defaultOrganizationId: "org1", organizationOptions: [] });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Something" } });
    expect(screen.getByTestId("no-writable-org")).toBeInTheDocument();
    expect(screen.getByTestId("save-note")).toBeDisabled();
  });

  it("with several offered organizations and a default that is not among them, nothing is chosen and Save stays disabled", () => {
    renderDialog({
      athlete: { id: "a1", name: "Sam Sprinter" },
      defaultOrganizationId: "orgElsewhere",
      organizationOptions: [{ id: "orgX", name: "Org X" }, { id: "orgY", name: "Org Y" }],
    });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Which organization?" } });
    expect(screen.getByTestId("save-note")).toBeDisabled();
  });

  it("keeps a default organization that is one of the offered ones", async () => {
    renderDialog({
      athlete: { id: "a1", name: "Sam Sprinter" },
      defaultOrganizationId: "orgY",
      organizationOptions: [{ id: "orgX", name: "Org X" }, { id: "orgY", name: "Org Y" }],
    });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Default kept" } });
    fireEvent.click(screen.getByTestId("save-note"));
    await waitFor(() => expect(createNote).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "orgY" })));
  });

  it("does not save an empty note, and shows why", async () => {
    renderDialog({ athlete: { id: "a1", name: "Sam Sprinter" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByTestId("save-note"));
    expect(await screen.findByText(/write a note/i)).toBeInTheDocument();
    expect(createNote).not.toHaveBeenCalled();
  });

  it("without an athlete: shows the picker and cannot save until an athlete is chosen", () => {
    renderDialog();
    expect(screen.getByTestId("note-athlete-selector")).toBeInTheDocument();
    expect(screen.getByTestId("save-note")).toBeDisabled();
  });

  it("editing prefills the note, shows the injury helper, hides the picker, and updates by id", async () => {
    renderDialog({ note: existing, athlete: { id: "a1", name: "Sam Sprinter" } });
    expect(screen.getByLabelText("Note")).toHaveValue(existing.body);
    expect(screen.getByLabelText("Observed on")).toHaveValue("2026-03-05");
    expect(screen.getByTestId("injury-helper")).toHaveTextContent("No diagnoses");
    expect(screen.queryByTestId("note-athlete-selector")).toBeNull();

    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Cleared for sprints" } });
    fireEvent.click(screen.getByTestId("save-note"));

    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    expect(updateNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: "n1", body: "Cleared for sprints", observedOn: "2026-03-05", category: "injury", flagged: true }),
    );
    // A note never moves: the update carries no organization or athlete
    expect(updateNote.mock.calls[0][0]).not.toHaveProperty("organizationId");
    expect(updateNote.mock.calls[0][0]).not.toHaveProperty("athleteId");
    expect(createNote).not.toHaveBeenCalled();
  });

  it("reports a failed save and stays open", async () => {
    const onOpenChange = vi.fn();
    createNote.mockRejectedValue(new Error("Note not found"));
    renderDialog({ athlete: { id: "a1", name: "Sam Sprinter" }, onOpenChange });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Something" } });
    fireEvent.click(screen.getByTestId("save-note"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
