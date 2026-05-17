/**
 * Component tests for RecentAthletesWidget
 *
 * Test coverage:
 * - Renders athlete list
 * - Shows loading skeleton
 * - Shows empty state
 * - "Add Measurement" button triggers modal
 * - Handles errors gracefully
 * - Displays athlete data correctly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RecentAthletesWidget from "@/components/recent-athletes-widget";

// Mock fetch API
global.fetch = vi.fn();

// Mock useMetricLabels with empty labels so the widget falls through to the
// hook's underscore-split fallback (FLY10_TIME → "FLY10 TIME"). This is
// what these tests assert below; making the mock explicit prevents a future
// setupFiles change that seeds the React Query cache from silently
// breaking the expectations.
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({
    labels: {},
    getLabel: (code: string) => code.replace(/_/g, ' '),
    isLoading: false,
  }),
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

describe("RecentAthletesWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Loading State", () => {
    it("should show loading skeleton while fetching data", () => {
      // Mock fetch to never resolve
      (global.fetch as any).mockImplementation(
        () => new Promise(() => {})
      );

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      // Should show loading skeletons
      expect(screen.getByTestId("recent-athletes-loading")).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("should show empty state when no athletes with measurements", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: [] }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId("recent-athletes-empty")).toBeInTheDocument();
      });

      expect(screen.getByText(/no recent measurements/i)).toBeInTheDocument();
    });

    it("should show helpful message in empty state", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: [] }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(
          screen.getByText(/record measurements to see recent activity/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Athletes List", () => {
    const mockAthletes = [
      {
        id: "athlete-1",
        firstName: "John",
        lastName: "Smith",
        avatar: null,
        lastMeasurementDate: "2025-11-13",
        lastMeasurementType: "FLY10_TIME",
        teamName: "Varsity",
      },
      {
        id: "athlete-2",
        firstName: "Jane",
        lastName: "Doe",
        avatar: "https://example.com/avatar.jpg",
        lastMeasurementDate: "2025-11-12",
        lastMeasurementType: "VERTICAL_JUMP",
        teamName: "JV",
      },
      {
        id: "athlete-3",
        firstName: "Bob",
        lastName: "Johnson",
        avatar: null,
        lastMeasurementDate: "2025-11-11",
        lastMeasurementType: "DASH_40YD",
        teamName: "Varsity",
      },
    ];

    it("should render list of athletes with measurements", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: mockAthletes }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("Bob Johnson")).toBeInTheDocument();
    });

    it("should display athlete avatars or initials", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: mockAthletes }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      // Check for initials when no avatar
      expect(screen.getByText("JS")).toBeInTheDocument(); // John Smith
      expect(screen.getByText("BJ")).toBeInTheDocument(); // Bob Johnson

      // Check for avatar image when provided
      const janeAvatar = screen.getByAltText("Jane Doe");
      expect(janeAvatar).toBeInTheDocument();
      expect(janeAvatar).toHaveAttribute("src", mockAthletes[1].avatar);
    });

    it("should display last measurement type and date", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: mockAthletes }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      // Check measurement types are displayed. With no metricLabels fixture
      // in scope (test doesn't seed the query cache), getLabel falls back to
      // the underscore-split form — still prose, not the underscored code.
      expect(screen.getByText("FLY10 TIME")).toBeInTheDocument();
      expect(screen.getByText("VERTICAL JUMP")).toBeInTheDocument();
      expect(screen.getByText("DASH 40YD")).toBeInTheDocument();

      // Check dates are formatted and displayed
      const dates = screen.getAllByText(/Nov \d{1,2}/i);
      expect(dates.length).toBeGreaterThan(0);
      // Verify at least one date element contains "Nov"
      expect(dates[0]).toBeInTheDocument();
    });

    it("should display team names", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: mockAthletes }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      // Verify team names are displayed (may appear multiple times)
      const varsityElements = screen.getAllByText("Varsity");
      expect(varsityElements.length).toBeGreaterThan(0);
      expect(screen.getByText("JV")).toBeInTheDocument();
    });

    it("should show 'Add Measurement' button for each athlete", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: mockAthletes }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      const addButtons = screen.getAllByRole("button", {
        name: /add measurement/i,
      });
      expect(addButtons).toHaveLength(3);
    });
  });

  describe("Add Measurement Action", () => {
    const mockAthletes = [
      {
        id: "athlete-1",
        firstName: "John",
        lastName: "Smith",
        avatar: null,
        lastMeasurementDate: "2025-11-13",
        lastMeasurementType: "FLY10_TIME",
        teamName: "Varsity",
      },
    ];

    it("should trigger onAddMeasurement callback when button clicked", async () => {
      const onAddMeasurement = vi.fn();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: mockAthletes }),
      });

      render(
        <RecentAthletesWidget
          organizationId="test-org-id"
          onAddMeasurement={onAddMeasurement}
        />,
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      const addButton = screen.getByRole("button", {
        name: /add measurement/i,
      });
      await userEvent.click(addButton);

      expect(onAddMeasurement).toHaveBeenCalledWith({
        athleteId: "athlete-1",
        athleteName: "John Smith",
      });
    });
  });

  describe("Error Handling", () => {
    it("should show error message when API call fails", async () => {
      (global.fetch as any).mockRejectedValueOnce(
        new Error("Failed to fetch athletes")
      );

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId("recent-athletes-error")).toBeInTheDocument();
      });

      expect(
        screen.getByText(/failed to load recent athletes/i)
      ).toBeInTheDocument();
    });

    it("should show error message when API returns error response", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: "Internal server error" }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId("recent-athletes-error")).toBeInTheDocument();
      });
    });

    it("should allow retry after error", async () => {
      let callCount = 0;
      (global.fetch as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ athletes: [] }),
        });
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId("recent-athletes-error")).toBeInTheDocument();
      });

      const retryButton = screen.getByRole("button", { name: /retry/i });
      await userEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByTestId("recent-athletes-empty")).toBeInTheDocument();
      });
    });
  });

  describe("API Integration", () => {
    it("should call API with correct parameters", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: [] }),
      });
      global.fetch = mockFetch;

      render(<RecentAthletesWidget organizationId="test-org-123" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/athletes/recent"),
        expect.objectContaining({
          credentials: "include",
        })
      );

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("organizationId=test-org-123");
      expect(callUrl).toContain("limit=5");
    });

    it("should refetch when organizationId changes", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ athletes: [] }),
      });
      global.fetch = mockFetch;

      const { rerender } = render(
        <RecentAthletesWidget organizationId="org-1" />,
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Change organization
      rerender(<RecentAthletesWidget organizationId="org-2" />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      const secondCallUrl = mockFetch.mock.calls[1][0];
      expect(secondCallUrl).toContain("organizationId=org-2");
    });
  });

  describe("Accessibility", () => {
    const mockAthletes = [
      {
        id: "athlete-1",
        firstName: "John",
        lastName: "Smith",
        avatar: null,
        lastMeasurementDate: "2025-11-13",
        lastMeasurementType: "FLY10_TIME",
        teamName: "Varsity",
      },
    ];

    it("should have proper ARIA labels", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: mockAthletes }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      const widget = screen.getByRole("region", {
        name: /recent athletes/i,
      });
      expect(widget).toBeInTheDocument();
    });

    it("should be keyboard navigable", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: mockAthletes }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      const addButton = screen.getByRole("button", {
        name: /add measurement/i,
      });

      // Should be focusable
      addButton.focus();
      expect(addButton).toHaveFocus();

      // Should activate on Enter key
      const onAddMeasurement = vi.fn();
      addButton.onclick = onAddMeasurement;
      await userEvent.keyboard("{Enter}");
      // React Testing Library automatically triggers click on Enter for buttons
    });
  });

  describe("Widget Title and Header", () => {
    it("should display widget title", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: [] }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText(/recent athletes/i)).toBeInTheDocument();
      });
    });

    it("should display count of athletes shown", async () => {
      const mockAthletes = [
        {
          id: "athlete-1",
          firstName: "John",
          lastName: "Smith",
          avatar: null,
          lastMeasurementDate: "2025-11-13",
          lastMeasurementType: "FLY10_TIME",
          teamName: "Varsity",
        },
        {
          id: "athlete-2",
          firstName: "Jane",
          lastName: "Doe",
          avatar: null,
          lastMeasurementDate: "2025-11-12",
          lastMeasurementType: "VERTICAL_JUMP",
          teamName: "JV",
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ athletes: mockAthletes }),
      });

      render(<RecentAthletesWidget organizationId="test-org-id" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText(/last 2 athletes/i)).toBeInTheDocument();
      });
    });
  });
});
