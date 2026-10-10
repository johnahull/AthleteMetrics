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

const mockOrganization = vi.fn();
vi.mock("@/lib/organization-api", () => ({ useOrganization: (...args: unknown[]) => mockOrganization(...args) }));

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
  mockResolved.mockReturnValue({ data: resolved, isLoading: false, error: null, refetch: refetchResolved });
}
const refetchResolved = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  auth.current = coach;
  useTemplate(orgTpl, orgResolved);
  mockSiteMetrics.mockReturnValue({ data: [{ code: "T_TEST", label: "T-test", category: "agility", unit: "s", isDerived: false }], isLoading: false });
  mockUpdate.mockResolvedValue({ ...orgTpl });
  mockCreate.mockResolvedValue({ id: "t-new" });
  mockOrganization.mockImplementation((id?: string) => ({ data: id ? { id, eventsEnabled: true } : undefined, isLoading: false }));
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
    useTemplate(orgTpl, { ...orgResolved, metrics: orgResolved.metrics.filter((m) => m.status !== "derived") });
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
    await user.click(within(rows[1] as HTMLElement).getByRole("button", { name: "Move Fly up" }));
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

  it("a derived leftover counts as a change: Save is enabled with no other edit and the PATCH drops it", async () => {
    const user = userEvent.setup();
    renderPage();
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][0].patch).toEqual({
      metrics: [
        { metricKey: "DASH_10", isRequired: true, displayOrder: 0 },
        { metricKey: "FLY_10", isRequired: false, displayOrder: 1, customLabel: "Fly" },
        { metricKey: "ZZ_NO_SUCH_CODE", isRequired: true, displayOrder: 2 },
      ],
    });
    await waitFor(() => expect(save).toBeDisabled());
    expect(screen.queryByText(/Calculated automatically/)).not.toBeInTheDocument();
  });

  it("says that the unavailable tests are saved after the available ones", () => {
    renderPage();
    const section = screen.getByRole("region", { name: "Not available for this organization" });
    expect(within(section).getByText(/saved after the tests above/)).toBeInTheDocument();
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
    // ...and next to the Name field
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(expect.stringContaining("A template with this name already exists"));
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows an error with Retry, not a skeleton forever, when the tests can not be loaded", async () => {
    const user = userEvent.setup();
    mockResolved.mockReturnValue({ data: undefined, isLoading: false, error: new Error("500: boom"), refetch: refetchResolved });
    renderPage();
    expect(screen.getByText(/Could not load the tests of this template/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchResolved).toHaveBeenCalled();
  });

  it("shows that the Events module is off for the template's organization", () => {
    mockOrganization.mockImplementation((id?: string) => ({ data: id ? { id, eventsEnabled: false } : undefined, isLoading: false }));
    renderPage();
    expect(mockOrganization).toHaveBeenCalledWith("org-1");
    expect(screen.getByText(/Events module is off/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
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

describe("leaving with unsaved changes", () => {
  it("leaves at once when nothing changed", async () => {
    const user = userEvent.setup();
    useTemplate(orgTpl, { ...orgResolved, metrics: orgResolved.metrics.filter((m) => m.status !== "derived") });
    const { container } = renderPage();
    const clicks = vi.fn((e: Event) => e.preventDefault());
    container.addEventListener("click", clicks);
    await user.click(screen.getByRole("link", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(clicks).toHaveBeenCalled();
  });

  it("asks before Cancel, Back or any in-app link; Stay keeps the edit, Leave navigates", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Name"), " 2");
    await user.click(screen.getByRole("link", { name: "Cancel" }));
    let dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Leave without saving?");
    await user.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Spring battery 2");

    await user.click(screen.getByRole("link", { name: "Back to templates" }));
    dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Leave without saving" }));
    expect(navigate).toHaveBeenCalledWith("/events/templates");

    // A link elsewhere in the app (the sidebar) is guarded too
    const elsewhere = document.createElement("a");
    elsewhere.href = "/athletes";
    elsewhere.textContent = "Athletes";
    document.body.appendChild(elsewhere);
    try {
      await user.click(elsewhere);
      dialog = await screen.findByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Leave without saving" }));
      expect(navigate).toHaveBeenLastCalledWith("/athletes");
    } finally {
      elsewhere.remove();
    }
  });

  it("asks the browser to confirm closing or reloading the page only while there are unsaved changes", async () => {
    const user = userEvent.setup();
    renderPage();
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    // The derived leftover is pending; remove it from the picture by saving first
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled());
    expect(unload()).toBe(false);
    await user.type(screen.getByLabelText("Name"), " 2");
    expect(unload()).toBe(true);
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

  it("keeps announcing the duplicate on the new template's page", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPage();
    await user.click(screen.getByRole("button", { name: "Duplicate as my template" }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    useTemplate({ ...orgTpl, id: "t-new" }, orgResolved);
    rerender(<EvalTemplateEdit />);
    expect(screen.getByRole("heading", { level: 1, name: "Edit template" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Duplicated\./);
  });

  it("explains why Duplicate is disabled", async () => {
    const user = userEvent.setup();
    mockResolved.mockReturnValue({ data: undefined, isLoading: false, error: new Error("500: boom"), refetch: refetchResolved });
    const { unmount } = renderPage();
    const button = screen.getByRole("button", { name: "Duplicate as my template" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/could not be loaded/);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchResolved).toHaveBeenCalled();
    unmount();

    mockResolved.mockReturnValue({ data: { ...defaultResolved, metrics: [defaultResolved.metrics[1]] }, isLoading: false, error: null, refetch: refetchResolved });
    renderPage();
    const none = screen.getByRole("button", { name: "Duplicate as my template" });
    expect(none).toBeDisabled();
    expect(none).toHaveAccessibleDescription(/None of this template's tests are available for your organization/);
  });

  it("shows that the Events module is off for the coach's organization", () => {
    mockOrganization.mockImplementation((id?: string) => ({ data: id ? { id, eventsEnabled: false } : undefined, isLoading: false }));
    renderPage();
    expect(mockOrganization).toHaveBeenCalledWith("org-1");
    expect(screen.getByText(/Events module is off/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duplicate as my template" })).not.toBeInTheDocument();
  });

  it("a site admin edits it with no organization, and confirms once before saving", async () => {
    const user = userEvent.setup();
    auth.current = siteAdmin;
    mockResolved.mockReturnValue({ data: { ...defaultResolved, metrics: [defaultResolved.metrics[0], { ...defaultResolved.metrics[1], status: "available" }] }, isLoading: false, error: null, refetch: refetchResolved });
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
