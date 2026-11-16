/**
 * Hosts one AddCoachingNoteDialog for the whole app so the command palette and the dashboard can open the
 * quick-add flow (organization, then athlete, then the note) from anywhere.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AddCoachingNoteDialog } from "./AddCoachingNoteDialog";
import { useAuth } from "@/lib/auth";

const AddNoteDialogContext = createContext<{ openAddNote: () => void } | undefined>(undefined);

export function AddNoteDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { organizationContext } = useAuth();
  const openAddNote = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openAddNote }), [openAddNote]);

  return (
    <AddNoteDialogContext.Provider value={value}>
      {children}
      <AddCoachingNoteDialog open={open} onOpenChange={setOpen} defaultOrganizationId={organizationContext} />
    </AddNoteDialogContext.Provider>
  );
}

export function useAddNoteDialog() {
  const context = useContext(AddNoteDialogContext);
  if (!context) throw new Error("useAddNoteDialog must be used within AddNoteDialogProvider");
  return context;
}
