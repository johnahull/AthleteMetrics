/**
 * Manage templates: edit / view one template (AM-FEAT-019).
 * Gating and resolution use the template's own organization; tests that can not be used are kept until removed;
 * the default is read-only (with Duplicate) for everyone but a site admin, who confirms once before saving it.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import EvalTemplateEdit from "../eval-template-edit";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const auth = { current: {} as any };
vi.mock("@/lib/auth", () => ({ useAuth: () => auth.current }));

const params = { current: { templateId: "t-org" } };
const navigate = vi.fn();
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
  useParams: () => params.current,
  useLocation: () => ["/events/templates/x", navigate],
}));

const mockTemplate = vi.fn();
const mockResolved = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();
const mockCreateOrg = vi.fn();
vi.mock("@/hooks/use-eval-report", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useEvalTemplate: (...args: unknown[]) => mockTemplate(...args),
  useResolvedEvalTemplate: (...args: unknown[]) => mockResolved(...args),
  useUpdateEvalTemplate: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useCreateEvalTemplate: (orgId: string) => {
    mockCreateOrg(orgId);
    return { mutateAsync: mockCreate, isPending: false };
  },
}));

const mockSiteMetrics = vi.fn();
vi.mock("@/lib/metrics-api", () => ({ useSiteMetrics: (...args: unknown[]) => mockSiteMetrics(...args) }));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const coach = { organizationContext: null, user: { id: "u1", isSiteAdmin: false }, userOrganizations: [{ organizationId: "org-1", role: "coach" }] };
const siteAdmin = { organizationContext: "org-other", user: { id: "sa", isSiteAdmin: true }, userOrganizations: [] };

const orgTpl = { id: "t-org", organizationId: "org-1", name: "Spring battery", sport: "SOCCER", description: "Old notes", metrics: [] };
const defaultTpl = { id: "t-default", organizationId: null, name: "Soccer eval (yards)", sport: "SOCCER", description: null, metrics: [] };
const r = (metricKey: string, code: string, displayOrder: number, extra: Record<string, unknown> = {}) => ({
  metricKey, code, label: `Label ${code}`, unit: "s", category: "speed", isRequired: true, displayOrder, status: "available", ...extra,
});
const orgResolved = {
  template: { id: "t-org", name: "Spring battery" },
  metrics: [
    r("DASH_10", "DASH_10YD", 0),
    r("FLY_10", "FLY10_TIME", 1, { isRequired: false, customLabel: "Fly" }),
    r("ZZ_NO_SUCH_CODE", "ZZ_NO_SUCH_CODE", 2, { status: "missing", label: null }),
    r("MOMENTUM", "MOMENTUM", 3, { status: "derived", isRequired: false }),
  ],
};
const defaultResolved = {
  template: { id: "t-default", name: "Soccer eval (yards)" },
  metrics: [r("DASH_10", "DASH_10YD", 0), r("COLLEGE_ONLY", "COLLEGE_ONLY", 1, { status: "unavailable", isRequired: false })],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return render(<EvalTemplateEdit />, { wrapper });
}

function useTemplate(template: any, resolved: any) {
  params.current = { templateId: template.id };
  mockTemplate.mockReturnValue({ data: template, isLoading: false, error: null });
  mockResolved.mockReturnValue({ data: resolved, isLoading: false, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.current = coach;
  useTemplate(orgTpl, orgResolved);
  mockSiteMetrics.mockReturnValue({ data: [{ code: "T_TEST", label: "T-test", category: "agility", unit: "s", isDerived: false }], isLoading: false });
  mockUpdate.mockResolvedValue({ ...orgTpl });
  mockCreate.mockResolvedValue({ id: "t-new" });
});

describe("editing an organization template", () => {
  it("resolves against the template's organization and lists the usable tests in order", () => {
    renderPage();
    expect(mockResolved).toHaveBeenCalledWith("t-org", "org-1");
    expect(mockSiteMetrics).toHaveBeenCalledWith(false, "org-1");
    expect(screen.getByRole("heading", { level: 1, name: "Edit template" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Spring battery");
    const rows = screen.getAllByText(/^Label DASH_10YD$|^Fly$/);
    expect(rows.map((n) => n.textContent)).toEqual(["Label DASH_10YD", "Fly"]);
  });

  it("keeps a test that can not be used under 'Not available for this organization', with a Remove button", () => {
    renderPage();
    const section = screen.getByRole("region", { name: "Not available for this organization" });
    expect(within(section).getByText("ZZ_NO_SUCH_CODE")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Remove ZZ_NO_SUCH_CODE" })).toBeInTheDocument();
    expect(screen.getByText(/Calculated automatically/)).toHaveTextContent("Label MOMENTUM");
  });

  it("disables Save until something changes", async () => {
    const user = userEvent.setup();
    renderPage();
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Fall battery");
    expect(save).toBeEnabled();
  });

  it("saves the name and the metrics in one PATCH, keeping the unusable test and the label, dropping the derived one", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Fall battery");
    const rows = document.querySelectorAll("[data-metric-row]");
    await user.click(within(rows[1] as HTMLElement).getByRole("button", { name: "Move up" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "t-org",
      patch: {
        name: "Fall battery",
        metrics: [
          { metricKey: "FLY_10", isRequired: false, displayOrder: 0, customLabel: "Fly" },
          { metricKey: "DASH_10", isRequired: true, displayOrder: 1 },
          { metricKey: "ZZ_NO_SUCH_CODE", isRequired: true, displayOrder: 2 },
        ],
      },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("removes an unusable test only when asked, and can clear the description", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Remove ZZ_NO_SUCH_CODE" }));
    await user.clear(screen.getByLabelText("Description"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][0].patch).toEqual({
      description: null,
      metrics: [
        { metricKey: "DASH_10", isRequired: true, displayOrder: 0 },
        { metricKey: "FLY_10", isRequired: false, displayOrder: 1, customLabel: "Fly" },
      ],
    });
  });

  it("shows the server's message when the save is refused", async () => {
    const user = userEvent.setup();
    mockUpdate.mockRejectedValue(new Error('409: {"error":"A template with this name already exists"}'));
    renderPage();
    await user.type(screen.getByLabelText("Name"), " 2");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A template with this name already exists");
  });

  it("a coach of another organization is sent away (the template's organization decides)", () => {
    auth.current = { ...coach, userOrganizations: [{ organizationId: "org-2", role: "coach" }] };
    renderPage();
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/");
  });

  it("a site admin in another organization's context still resolves the template against its own organization", () => {
    auth.current = siteAdmin;
    renderPage();
    expect(mockResolved).toHaveBeenCalledWith("t-org", "org-1");
    expect(mockSiteMetrics).toHaveBeenCalledWith(false, "org-1");
  });
});

describe("the default template", () => {
  beforeEach(() => useTemplate(defaultTpl, defaultResolved));

  it("is read-only for a coach, resolved against the coach's organization, with Duplicate", () => {
    renderPage();
    expect(mockResolved).toHaveBeenCalledWith("t-default", "org-1");
    expect(screen.getByRole("heading", { level: 1, name: "Soccer eval (yards)" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByText(/Only a site admin can change the default template/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate as my template" })).toBeInTheDocument();
  });

  it("duplicates into the coach's organization with only the available tests and says which were left out", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Duplicate as my template" }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreateOrg).toHaveBeenCalledWith("org-1");
    expect(mockCreate).toHaveBeenCalledWith({
      name: "Soccer eval (yards) (copy)",
      sport: "SOCCER",
      metrics: [{ metricKey: "DASH_10", isRequired: true, displayOrder: 0 }],
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Label COLLEGE_ONLY") }));
    expect(navigate).toHaveBeenCalledWith("/events/templates/t-new");
  });

  it("a site admin edits it with no organization, and confirms once before saving", async () => {
    const user = userEvent.setup();
    auth.current = siteAdmin;
    mockResolved.mockReturnValue({ data: { ...defaultResolved, metrics: [defaultResolved.metrics[0], { ...defaultResolved.metrics[1], status: "available" }] }, isLoading: false, error: null });
    renderPage();
    expect(mockResolved).toHaveBeenCalledWith("t-default", undefined);
    expect(mockSiteMetrics).toHaveBeenCalledWith(false, undefined);
    expect(screen.queryByRole("button", { name: "Duplicate as my template" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Description"), "For everyone");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("This changes the default for every organization.");
    expect(mockUpdate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Save default" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ id: "t-default", patch: { description: "For everyone" } }));
  });
});
