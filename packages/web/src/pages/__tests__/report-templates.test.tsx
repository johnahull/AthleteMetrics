/** Report templates list: org templates, delete with confirm, empty/error states, access. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportTemplates from "../report-templates";

const auth = { current: {} as any };
vi.mock("@/lib/auth", () => ({ useAuth: () => auth.current }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
}));

const mockList = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/report-templates-api", () => ({
  useReportTemplates: (...a: unknown[]) => mockList(...a),
  useDeleteReportTemplate: () => ({ mutateAsync: mockDelete, isPending: false }),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const coach = {
  organizationContext: null,
  user: { id: "u1", isSiteAdmin: false },
  userOrganizations: [{ organizationId: "org-1", role: "coach" }],
};
const tpl = {
  id: "t1", organizationId: "org-1", name: "Speed block", description: "Fly and dash",
  metrics: ["FLY10_TIME", "DASH_40YD", "VERTICAL_JUMP"], benchmarkSetIds: ["s1"],
  siteBenchmarkIds: ["a"], customBenchmarkIds: ["b"], charts: {},
};
const card = (name: string) => screen.getByRole("heading", { name }).closest("[data-template-card]") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  auth.current = coach;
  mockList.mockReturnValue({ data: [tpl], isLoading: false, isError: false, refetch: vi.fn() });
  mockDelete.mockResolvedValue(undefined);
});

describe("Report templates list", () => {
  it("lists the organization's templates with counts and Edit / New links", () => {
    render(<ReportTemplates />);
    expect(mockList).toHaveBeenCalledWith("org-1");
    const c = within(card("Speed block"));
    expect(c.getByText("3 metrics, 1 benchmark set, 2 benchmarks")).toBeInTheDocument();
    expect(c.getByText("Fly and dash")).toBeInTheDocument();
    expect(c.getByRole("link", { name: "Edit Speed block" })).toHaveAttribute("href", "/reports/templates/t1");
    expect(screen.getByRole("link", { name: /New template/ })).toHaveAttribute("href", "/reports/templates/new");
  });

  it("asks before deleting; Cancel keeps it, Delete removes it", async () => {
    render(<ReportTemplates />);
    await userEvent.click(within(card("Speed block")).getByRole("button", { name: "Delete Speed block" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockDelete).not.toHaveBeenCalled();
    await userEvent.click(within(card("Speed block")).getByRole("button", { name: "Delete Speed block" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(mockDelete).toHaveBeenCalledWith("t1");
  });

  it("toasts when delete fails", async () => {
    mockDelete.mockRejectedValue(new Error("boom"));
    render(<ReportTemplates />);
    await userEvent.click(within(card("Speed block")).getByRole("button", { name: "Delete Speed block" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Not deleted", variant: "destructive" }));
  });

  it("shows an empty state", () => {
    mockList.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    render(<ReportTemplates />);
    expect(screen.getByText(/No templates yet/)).toBeInTheDocument();
  });

  it("shows an error with Retry, not the empty state", async () => {
    const refetch = vi.fn();
    mockList.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<ReportTemplates />);
    expect(screen.queryByText(/No templates yet/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("redirects an athlete and a coach of a different organization", () => {
    auth.current = { ...coach, userOrganizations: [{ organizationId: "org-1", role: "athlete" }] };
    const { unmount } = render(<ReportTemplates />);
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/");
    unmount();
    auth.current = { ...coach, organizationContext: "org-2" };
    render(<ReportTemplates />);
    expect(screen.getByTestId("redirect")).toBeInTheDocument();
  });

  it("asks a site admin without an organization to choose one", () => {
    auth.current = { organizationContext: null, user: { id: "a", isSiteAdmin: true }, userOrganizations: [] };
    render(<ReportTemplates />);
    expect(screen.getByText(/select an organization/i)).toBeInTheDocument();
  });
});
