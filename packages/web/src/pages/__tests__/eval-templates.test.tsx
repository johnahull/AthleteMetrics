/**
 * Manage templates list (AM-FEAT-019): the organization's templates plus the default, delete with confirm for
 * organization templates only, and an empty state.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EvalTemplates from "../eval-templates";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
});

const auth = { current: {} as any };
vi.mock("@/lib/auth", () => ({ useAuth: () => auth.current }));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
}));

const mockTemplates = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/hooks/use-eval-report", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useEvalTemplates: (...args: unknown[]) => mockTemplates(...args),
  useDeleteEvalTemplate: () => ({ mutateAsync: mockDelete, isPending: false }),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const coach = {
  organizationContext: null,
  user: { id: "u1", isSiteAdmin: false },
  userOrganizations: [{ organizationId: "org-1", role: "coach" }],
};
const defaultTpl = {
  id: "t-default", organizationId: null, name: "Soccer eval (yards)", sport: "SOCCER", description: "The standard battery",
  metrics: [{ metricKey: "DASH_10", isRequired: true, displayOrder: 0 }, { metricKey: "FLY_10", isRequired: false, displayOrder: 1 }],
};
const orgTpl = {
  id: "t-org", organizationId: "org-1", name: "Spring battery", sport: "SOCCER",
  metrics: [{ metricKey: "T_TEST", isRequired: true, displayOrder: 0 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.current = coach;
  mockTemplates.mockReturnValue({ data: [orgTpl, defaultTpl], isLoading: false });
  mockDelete.mockResolvedValue(undefined);
});

const card = (name: string) => screen.getByRole("heading", { name }).closest("[data-template-card]") as HTMLElement;

describe("Manage templates list", () => {
  it("lists the organization's templates and the default for the effective organization", () => {
    render(<EvalTemplates />);
    expect(mockTemplates).toHaveBeenCalledWith("org-1");
    expect(screen.getByRole("heading", { level: 1, name: "Eval templates" })).toBeInTheDocument();
    expect(within(card("Spring battery")).getByText("1 test, 1 required")).toBeInTheDocument();
    expect(within(card("Soccer eval (yards)")).getByText("2 tests, 1 required")).toBeInTheDocument();
    expect(within(card("Soccer eval (yards)")).getByText("Default")).toBeInTheDocument();
  });

  it("offers Edit and Delete on an organization template, only View on the default for a coach", () => {
    render(<EvalTemplates />);
    expect(within(card("Spring battery")).getByRole("link", { name: "Edit Spring battery" })).toHaveAttribute("href", "/events/templates/t-org");
    expect(within(card("Spring battery")).getByRole("button", { name: "Delete Spring battery" })).toBeInTheDocument();
    const def = card("Soccer eval (yards)");
    expect(within(def).getByRole("link", { name: "View Soccer eval (yards)" })).toHaveAttribute("href", "/events/templates/t-default");
    expect(within(def).queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });

  it("lets a site admin edit the default but never delete it", () => {
    auth.current = { ...coach, user: { id: "sa", isSiteAdmin: true }, organizationContext: "org-1", userOrganizations: [] };
    render(<EvalTemplates />);
    const def = card("Soccer eval (yards)");
    expect(within(def).getByRole("link", { name: "Edit Soccer eval (yards)" })).toBeInTheDocument();
    expect(within(def).queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });

  it("asks before deleting; Cancel keeps it, Delete removes it", async () => {
    const user = userEvent.setup();
    render(<EvalTemplates />);
    await user.click(screen.getByRole("button", { name: "Delete Spring battery" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent('Delete "Spring battery"?');
    expect(dialog).toHaveTextContent("Events already created from it keep their tests.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mockDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete Spring battery" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(mockDelete).toHaveBeenCalledWith("t-org");
    expect(await screen.findByRole("status")).toHaveTextContent('Deleted "Spring battery".');
  });

  it("shows an empty state when the organization has no templates of its own", () => {
    mockTemplates.mockReturnValue({ data: [defaultTpl], isLoading: false });
    render(<EvalTemplates />);
    expect(screen.getByText(/No templates of your own yet/)).toBeInTheDocument();
    expect(card("Soccer eval (yards)")).toBeInTheDocument();
  });

  it("sends a user who does not manage events away", () => {
    auth.current = { ...coach, userOrganizations: [{ organizationId: "org-1", role: "athlete" }] };
    render(<EvalTemplates />);
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/");
  });

  it("asks for an organization when there is none", () => {
    auth.current = { ...coach, user: { id: "sa", isSiteAdmin: true }, userOrganizations: [] };
    render(<EvalTemplates />);
    expect(screen.getByText(/select an organization/i)).toBeInTheDocument();
  });
});
