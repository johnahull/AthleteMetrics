import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "g1" }],
  useLocation: () => [null, vi.fn()],
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { isSiteAdmin: true } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ui/confirmation-dialog", () => ({
  useConfirmation: () => ({ confirm: vi.fn(), ConfirmationComponent: null }),
}));
vi.mock("@/hooks/useAdminGlobalAthletes", () => ({
  useGlobalAthleteDetails: () => ({
    isLoading: false,
    data: {
      globalAthlete: {
        id: "g1",
        canonicalFullName: "Bad Birth",
        birthDate: "not-a-date",
        verifiedEmails: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      linkedUsers: [],
      auditLog: [],
    },
  }),
  useForceUnlink: () => ({ mutateAsync: vi.fn() }),
  useAdminUpdatePrivacy: () => ({ mutateAsync: vi.fn() }),
}));

import GlobalAthleteDetail from "../global-athlete-detail";

describe("GlobalAthleteDetail malformed birthDate", () => {
  it("shows 'Not set' instead of throwing", () => {
    render(<GlobalAthleteDetail />);
    expect(screen.getAllByText("Bad Birth").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not set").length).toBeGreaterThan(0);
    expect(screen.queryByText(/1969|1970/)).not.toBeInTheDocument();
  });
});
