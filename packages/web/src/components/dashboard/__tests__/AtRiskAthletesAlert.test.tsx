/**
 * Test suite for AtRiskAthletesAlert component
 *
 * Test coverage:
 * - Loading state with spinner
 * - Hidden when no at-risk athletes (atRiskCount = 0)
 * - Shows declining athletes section when present
 * - Shows inactive athletes section when present
 * - Displays correct decline percentage in red
 * - Displays "last active X days ago" format
 * - Click on athlete navigates to profile
 * - Dismiss button sets localStorage and hides alert
 * - Alert stays hidden after dismiss until session ends
 * - Collapse/expand functionality
 * - Error state with retry button
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AtRiskAthletesAlert } from "../AtRiskAthletesAlert";

// Mock fetch API
global.fetch = vi.fn();

// Mock useLocation for navigation tests
const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/", mockSetLocation],
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("AtRiskAthletesAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Loading State", () => {
    it("should show loading spinner while fetching data", () => {
      // Mock fetch to never resolve
      (global.fetch as any).mockImplementation(
        () => new Promise(() => {})
      );

      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      // Should show loading state (we'll use a subtle spinner, not skeleton)
      expect(screen.getByTestId("at-risk-loading")).toBeInTheDocument();
    });
  });

  describe("Hidden When No At-Risk Athletes", () => {
    it("should not render when atRiskCount is 0", async () => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            declining: [],
            inactive: [],
            atRiskCount: 0,
          }),
        })
      );

      const { container } = render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        // Component should not be in the DOM at all
        expect(container.firstChild).toBeNull();
      });
    });

    it("should render when atRiskCount > 0", async () => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            declining: [{
              athleteId: "athlete-1",
              athleteName: "John Smith",
              teamId: "team-1",
              teamName: "Varsity",
              metric: "FLY10_TIME",
              metricLabel: "Fly-10",
              declinePercent: 12.5,
              previousValue: 1.20,
              currentValue: 1.35,
            }],
            inactive: [],
            atRiskCount: 1,
          }),
        })
      );

      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId("at-risk-alert")).toBeInTheDocument();
      });
    });
  });

  describe("Declining Athletes Section", () => {
    const mockDeclining = [
      {
        athleteId: "athlete-1",
        athleteName: "John Smith",
        teamId: "team-1",
        teamName: "Varsity",
        metric: "FLY10_TIME",
        metricLabel: "Fly-10",
        declinePercent: 12.5,
        previousValue: 1.20,
        currentValue: 1.35,
      },
      {
        athleteId: "athlete-2",
        athleteName: "Jane Doe",
        teamId: null,
        teamName: null,
        metric: "VERTICAL_JUMP",
        metricLabel: "Vertical Jump",
        declinePercent: 8.3,
        previousValue: 36,
        currentValue: 33,
      },
    ];

    beforeEach(() => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            declining: mockDeclining,
            inactive: [],
            atRiskCount: 2,
          }),
        })
      );
    });

    it("should display declining performance section header", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText(/declining performance/i)).toBeInTheDocument();
      });
    });

    it("should display athlete names as clickable links", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    it("should display decline percentage in red text", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        const declineText = screen.getByText(/12\.5%/);
        expect(declineText).toBeInTheDocument();
        // Check that it has red text color class
        expect(declineText.className).toMatch(/text-red/);
      });
    });

    it("should display metric name with decline percentage", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText(/Fly-10/)).toBeInTheDocument();
        expect(screen.getByText(/12\.5%/)).toBeInTheDocument();
      });
    });

    it("should display previous → current values", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        // Should show "1.20 → 1.35" format
        expect(screen.getByText(/1\.20/)).toBeInTheDocument();
        expect(screen.getByText(/1\.35/)).toBeInTheDocument();
        // Multiple athletes have arrows, so use getAllByText
        const arrows = screen.getAllByText(/→/);
        expect(arrows.length).toBeGreaterThan(0);
      });
    });

    it("should navigate to athlete profile on name click", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      const athleteName = screen.getByText("John Smith");
      await userEvent.click(athleteName);

      expect(mockSetLocation).toHaveBeenCalledWith("/users/athlete-1");
    });
  });

  describe("Inactive Athletes Section", () => {
    const mockInactive = [
      {
        athleteId: "athlete-3",
        athleteName: "Bob Johnson",
        teamId: "team-2",
        teamName: "JV",
        lastMeasurementDate: "2025-11-10",
        daysSinceLastMeasurement: 24,
      },
      {
        athleteId: "athlete-4",
        athleteName: "Alice Williams",
        teamId: null,
        teamName: null,
        lastMeasurementDate: "2025-11-15",
        daysSinceLastMeasurement: 19,
      },
    ];

    beforeEach(() => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            declining: [],
            inactive: mockInactive,
            atRiskCount: 2,
          }),
        })
      );
    });

    it("should display inactive athletes section header", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText(/inactive athletes/i)).toBeInTheDocument();
      });
    });

    it("should display athlete names as clickable links", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText("Bob Johnson")).toBeInTheDocument();
      });

      expect(screen.getByText("Alice Williams")).toBeInTheDocument();
    });

    it("should display 'last active X days ago' text", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText(/last active 24 days ago/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/last active 19 days ago/i)).toBeInTheDocument();
    });

    it("should navigate to athlete profile on name click", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText("Bob Johnson")).toBeInTheDocument();
      });

      const athleteName = screen.getByText("Bob Johnson");
      await userEvent.click(athleteName);

      expect(mockSetLocation).toHaveBeenCalledWith("/users/athlete-3");
    });
  });

  describe("Dismiss Functionality", () => {
    beforeEach(() => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            declining: [{
              athleteId: "athlete-1",
              athleteName: "John Smith",
              teamId: "team-1",
              teamName: "Varsity",
              metric: "FLY10_TIME",
              metricLabel: "Fly-10",
              declinePercent: 12.5,
              previousValue: 1.20,
              currentValue: 1.35,
            }],
            inactive: [],
            atRiskCount: 1,
          }),
        })
      );
    });

    it("should show dismiss button", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
      });
    });

    it("should hide alert when dismiss button clicked", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId("at-risk-alert")).toBeInTheDocument();
      });

      const dismissButton = screen.getByRole("button", { name: /dismiss/i });
      await userEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByTestId("at-risk-alert")).not.toBeInTheDocument();
      });
    });

    it("should set localStorage when dismissed", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId("at-risk-alert")).toBeInTheDocument();
      });

      const dismissButton = screen.getByRole("button", { name: /dismiss/i });
      await userEvent.click(dismissButton);

      await waitFor(() => {
        expect(localStorage.getItem("atRiskAlertDismissed")).toBe("true");
      });
    });

    it("should stay hidden on re-render when dismissed", async () => {
      // Set dismissed state in localStorage before render
      localStorage.setItem("atRiskAlertDismissed", "true");

      const { container } = render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        // Should remain hidden even though data has at-risk athletes
        expect(container.firstChild).toBeNull();
      });
    });
  });

  describe("Collapse/Expand Functionality", () => {
    beforeEach(() => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            declining: [{
              athleteId: "athlete-1",
              athleteName: "John Smith",
              teamId: "team-1",
              teamName: "Varsity",
              metric: "FLY10_TIME",
              metricLabel: "Fly-10",
              declinePercent: 12.5,
              previousValue: 1.20,
              currentValue: 1.35,
            }],
            inactive: [],
            atRiskCount: 1,
          }),
        })
      );
    });

    it("should be expanded by default", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });
    });

    it("should show collapse button/icon", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId("collapse-toggle")).toBeInTheDocument();
      });
    });

    it("should collapse when toggle clicked", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      const collapseToggle = screen.getByTestId("collapse-toggle");
      await userEvent.click(collapseToggle);

      await waitFor(() => {
        expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
      });
    });

    it("should expand when toggle clicked again", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      const collapseToggle = screen.getByTestId("collapse-toggle");

      // Collapse
      await userEvent.click(collapseToggle);
      await waitFor(() => {
        expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
      });

      // Expand
      await userEvent.click(collapseToggle);
      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });
    });
  });

  describe("Error State", () => {
    it("should show error state when API call fails", async () => {
      (global.fetch as any).mockImplementation(() =>
        Promise.reject(new Error("Network error"))
      );

      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId("at-risk-error")).toBeInTheDocument();
      });

      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });

    it("should show retry button in error state", async () => {
      (global.fetch as any).mockImplementation(() =>
        Promise.reject(new Error("Network error"))
      );

      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
      });
    });

    it("should retry when retry button clicked", async () => {
      let callCount = 0;
      (global.fetch as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            declining: [],
            inactive: [],
            atRiskCount: 0,
          }),
        });
      });

      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByTestId("at-risk-error")).toBeInTheDocument();
      });

      const retryButton = screen.getByRole("button", { name: /retry/i });
      await userEvent.click(retryButton);

      await waitFor(() => {
        // Should succeed and hide (atRiskCount = 0)
        expect(screen.queryByTestId("at-risk-error")).not.toBeInTheDocument();
      });
    });
  });

  describe("Query Parameters", () => {
    it("should pass organizationId to API", async () => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            declining: [],
            inactive: [],
            atRiskCount: 0,
          }),
        })
      );

      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("organizationId=org-123"),
          expect.anything()
        );
      });
    });

    it("should pass teamId when provided", async () => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            declining: [],
            inactive: [],
            atRiskCount: 0,
          }),
        })
      );

      render(
        <AtRiskAthletesAlert organizationId="org-123" teamId="team-456" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("teamId=team-456"),
          expect.anything()
        );
      });
    });

    it("should pass inactivityThreshold when provided", async () => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            declining: [],
            inactive: [],
            atRiskCount: 0,
          }),
        })
      );

      render(
        <AtRiskAthletesAlert
          organizationId="org-123"
          inactivityThreshold={21}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("inactivityThreshold=21"),
          expect.anything()
        );
      });
    });
  });

  describe("Visual Design", () => {
    beforeEach(() => {
      (global.fetch as any).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            declining: [{
              athleteId: "athlete-1",
              athleteName: "John Smith",
              teamId: "team-1",
              teamName: "Varsity",
              metric: "FLY10_TIME",
              metricLabel: "Fly-10",
              declinePercent: 12.5,
              previousValue: 1.20,
              currentValue: 1.35,
            }],
            inactive: [],
            atRiskCount: 1,
          }),
        })
      );
    });

    it("should have amber/warning colors for alert", async () => {
      render(
        <AtRiskAthletesAlert organizationId="org-123" />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        const alert = screen.getByTestId("at-risk-alert");
        expect(alert).toBeInTheDocument();
        // Should have amber/yellow border or background
        expect(alert.className).toMatch(/(border-amber|border-yellow|bg-amber|bg-yellow)/);
      });
    });
  });
});
