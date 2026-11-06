/** Reports page: the Manage templates button follows the organization-scoped role, not the session role. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Reports from "../reports";

const auth = { current: {} as any };
vi.mock("@/lib/auth", () => ({ useAuth: () => auth.current }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/reports", vi.fn()],
}));

vi.mock("@/hooks/use-reports", () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return { useDeleteReport: mutation, useArchiveReport: mutation, useBulkArchiveReports: mutation, useBulkDeleteReports: mutation };
});
vi.mock("@/hooks/use-report-filters", () => ({
  useReportFilters: () => ({ filters: {}, updateFilters: vi.fn(), resetFilters: vi.fn(), activeFilterCount: 0 }),
}));
vi.mock("@/components/reports/ReportWizard", () => ({ ReportWizard: () => null }));
vi.mock("@/components/reports/ReportsFilterBar", () => ({ ReportsFilterBar: () => null }));
vi.mock("@/components/reports/PinnedReportsSection", () => ({ PinnedReportsSection: () => null }));
vi.mock("@/components/reports/RecentReportsSection", () => ({ RecentReportsSection: () => null }));
vi.mock("@/components/reports/BulkDistributeReportsDialog", () => ({ BulkDistributeReportsDialog: () => null }));

const as = (role: string, extra: Record<string, unknown> = {}) => ({
  organizationContext: null,
  user: { id: "u1", isSiteAdmin: false, role },
  userOrganizations: [{ organizationId: "org-1", role }],
  ...extra,
});
const button = () => screen.queryByRole("link", { name: "Manage templates" });

beforeEach(() => { auth.current = as("coach"); });

describe("Reports page Manage templates button", () => {
  it("shows for a coach and links to the manager", () => {
    render(<Reports />);
    expect(button()).toHaveAttribute("href", "/reports/templates");
  });

  it("is hidden for an athlete", () => {
    auth.current = as("athlete");
    render(<Reports />);
    expect(button()).toBeNull();
  });

  it("follows the role in the chosen organization, not the session role", () => {
    // Session role says coach (first org), but in the organization being worked in the user is an athlete
    auth.current = {
      organizationContext: "org-2",
      user: { id: "u1", isSiteAdmin: false, role: "coach" },
      userOrganizations: [{ organizationId: "org-1", role: "coach" }, { organizationId: "org-2", role: "athlete" }],
    };
    render(<Reports />);
    expect(button()).toBeNull();
  });

  it("shows for a site admin once an organization is chosen, hides it before", () => {
    auth.current = { organizationContext: "org-9", user: { id: "a", isSiteAdmin: true, role: "site_admin" }, userOrganizations: [] };
    const { unmount } = render(<Reports />);
    expect(button()).not.toBeNull();
    unmount();
    auth.current = { organizationContext: null, user: { id: "a", isSiteAdmin: true, role: "site_admin" }, userOrganizations: [] };
    render(<Reports />);
    expect(button()).toBeNull();
  });
});
