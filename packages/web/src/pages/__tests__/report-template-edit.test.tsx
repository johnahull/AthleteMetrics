/** Report template editor: create / update payloads, safe handling of unavailable items, chart types. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportTemplateEdit from "../report-template-edit";

const auth = { current: {} as any };
vi.mock("@/lib/auth", () => ({ useAuth: () => auth.current }));

const params = { current: { templateId: "new" } };
const navigate = vi.fn();
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
  useParams: () => params.current,
  useLocation: () => ["/", navigate],
}));

const mockTemplates = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/report-templates-api", () => ({
  useReportTemplates: (...a: unknown[]) => mockTemplates(...a),
  useCreateReportTemplate: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateReportTemplate: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));

const metricsQuery = { current: {} as any };
const benchmarksQuery = { current: {} as any };
const setsQuery = { current: {} as any };
vi.mock("@/lib/metrics-api", () => ({ useOrganizationMetrics: () => metricsQuery.current }));
vi.mock("@/lib/benchmarks-api", () => ({ useOrganizationBenchmarks: () => benchmarksQuery.current }));
vi.mock("@/lib/benchmark-sets-api", () => ({ useBenchmarkSets: () => setsQuery.current }));

const setDetails = vi.fn();
vi.mock("@/components/reports/template-fields/useBenchmarkSetDetails", () => ({
  useBenchmarkSetDetails: (...a: unknown[]) => setDetails(...a),
}));

// The real benchmark UI is exercised elsewhere; this stub exposes what the editor passes and lets a test change it
vi.mock("@/components/reports/template-fields/BenchmarkFields", () => ({
  BenchmarkFields: (p: any) => (
    <div data-testid="benchmark-fields" data-sets={JSON.stringify(p.setIds)} data-site={JSON.stringify(p.siteIds)} data-custom={JSON.stringify(p.customIds)}>
      <button type="button" onClick={() => p.onAddSet("set-new")}>stub add set</button>
      <button type="button" onClick={() => p.onBenchmarksChange({ site: [...p.siteIds, "site-new"], custom: p.customIds })}>stub add benchmark</button>
    </div>
  ),
}));

vi.mock("@/hooks/useContextualLabels", () => ({
  useContextualLabels: () => ({ team: "Team", teams: "Teams", athlete: "Athlete", athletes: "Athletes" }),
}));
vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useQuery: () => ({ data: { sprintFvEnabled: false } }),
}));

const metric = (code: string, label: string) => ({ metricCode: code, customLabel: null, siteMetric: { label, unit: "s", category: "SPEED" } });
const coach = {
  organizationContext: null,
  user: { id: "u1", isSiteAdmin: false },
  userOrganizations: [{ organizationId: "org-1", role: "coach" }],
};
const stored = {
  id: "t1", organizationId: "org-1", name: "Speed block", description: "Fly and dash",
  metrics: ["FLY10_TIME", "OLD_METRIC"], benchmarkSetIds: ["set-a"],
  siteBenchmarkIds: ["site-1", "site-gone"], customBenchmarkIds: [],
  charts: { individual: { radar: false } },
};
const ok = (data: unknown) => ({ data, isLoading: false, error: null, refetch: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  auth.current = coach;
  params.current = { templateId: "new" };
  mockTemplates.mockReturnValue({ data: [stored], isLoading: false, isError: false, refetch: vi.fn() });
  mockCreate.mockResolvedValue({ ...stored, id: "t-new" });
  mockUpdate.mockResolvedValue(stored);
  metricsQuery.current = ok([metric("FLY10_TIME", "10-yard fly"), metric("DASH_40YD", "40-yard dash")]);
  benchmarksQuery.current = ok([{ benchmarkId: "site-1", benchmarkType: "site", name: "B1", metricCode: "FLY10_TIME" }]);
  setsQuery.current = ok([{ id: "set-a", name: "Set A" }]);
  setDetails.mockImplementation((_org: string, ids: string[]) => ({
    queries: ids.map(() => ({ isSuccess: true, data: {} })),
    ready: true,
    failed: false,
    goneIds: [],
  }));
});

const save = () => screen.getByRole("button", { name: "Save template" });

describe("new template", () => {
  it("creates with the typed fields and goes back to the list", async () => {
    render(<ReportTemplateEdit />);
    expect(save()).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Template name/), "  Combine  ");
    await userEvent.click(screen.getByRole("checkbox", { name: /40-yard dash/ }));
    await userEvent.click(screen.getByRole("button", { name: "stub add set" }));
    await userEvent.click(screen.getByRole("button", { name: "stub add benchmark" }));
    await userEvent.click(save());
    expect(mockCreate).toHaveBeenCalledWith({
      name: "Combine", description: undefined, metrics: ["DASH_40YD"], benchmarkSetIds: ["set-new"],
      siteBenchmarkIds: ["site-new"], customBenchmarkIds: [], charts: {},
    });
    expect(navigate).toHaveBeenCalledWith("/reports/templates");
  });

  it("needs a name and at least one metric", async () => {
    render(<ReportTemplateEdit />);
    await userEvent.click(screen.getByRole("checkbox", { name: /40-yard dash/ }));
    expect(save()).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Template name/), "x");
    expect(save()).toBeEnabled();
  });

  it("shows the duplicate-name message on 409 and stays on the page", async () => {
    mockCreate.mockRejectedValue(new Error("409: {}"));
    render(<ReportTemplateEdit />);
    await userEvent.type(screen.getByLabelText(/Template name/), "Dup");
    await userEvent.click(screen.getByRole("checkbox", { name: /40-yard dash/ }));
    await userEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("A template with this name already exists.");
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("edit template", () => {
  beforeEach(() => { params.current = { templateId: "t1" }; });

  it("prefills, and PATCHes keeping unavailable metrics and benchmarks untouched", async () => {
    render(<ReportTemplateEdit />);
    expect(screen.getByLabelText(/Template name/)).toHaveValue("Speed block");
    expect(screen.getByText("Unavailable: OLD_METRIC")).toBeInTheDocument();
    expect(screen.getByText(/Unavailable benchmark/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 items are no longer available");
    await userEvent.click(screen.getByRole("checkbox", { name: /40-yard dash/ }));
    await userEvent.click(save());
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "t1",
      data: expect.objectContaining({
        name: "Speed block", description: "Fly and dash",
        metrics: ["FLY10_TIME", "OLD_METRIC", "DASH_40YD"],
        siteBenchmarkIds: ["site-1", "site-gone"], benchmarkSetIds: ["set-a"],
      }),
    });
  });

  it("removes an unavailable metric only when the user removes it", async () => {
    render(<ReportTemplateEdit />);
    await userEvent.click(screen.getByRole("button", { name: "Remove OLD_METRIC" }));
    await userEvent.click(save());
    expect(mockUpdate.mock.calls[0][0].data.metrics).toEqual(["FLY10_TIME"]);
  });

  it("clears a description with null", async () => {
    render(<ReportTemplateEdit />);
    await userEvent.clear(screen.getByLabelText("Description"));
    await userEvent.click(save());
    expect(mockUpdate.mock.calls[0][0].data.description).toBeNull();
  });

  it("counts a deleted (404) benchmark set as unavailable and still allows saving", async () => {
    setDetails.mockReturnValue({ queries: [{ isSuccess: false, isError: true }], ready: false, failed: false, goneIds: ["set-a"] });
    render(<ReportTemplateEdit />);
    expect(screen.getByRole("status")).toHaveTextContent("3 items are no longer available");
    expect(save()).toBeEnabled();
  });

  it("blocks Save while a set fails to load for another reason", () => {
    setDetails.mockReturnValue({ queries: [{ isSuccess: false, isError: true }], ready: false, failed: true, goneIds: [] });
    render(<ReportTemplateEdit />);
    expect(save()).toBeDisabled();
  });

  it("blocks Save and reports it when a list fails, instead of treating every item as gone", () => {
    metricsQuery.current = { data: undefined, isLoading: false, error: new Error("boom"), refetch: vi.fn() };
    render(<ReportTemplateEdit />);
    expect(screen.getAllByRole("alert").some((a) => /failed to load/i.test(a.textContent ?? ""))).toBe(true);
    expect(screen.queryByText(/no longer available/)).toBeNull();
    expect(save()).toBeDisabled();
  });

  it("saves a chart type only when touched; the other type stays as stored", async () => {
    render(<ReportTemplateEdit />);
    await userEvent.click(within(screen.getByText("Team reports").parentElement!).getByRole("checkbox", { name: /Leaderboard/ }));
    await userEvent.click(save());
    const charts = mockUpdate.mock.calls[0][0].data.charts;
    expect(charts.individual).toEqual({ radar: false });
    expect(charts.team).toEqual({ benchmarkStanding: true, trends: true, boxSwarm: true, leaderboard: false, tierDistribution: true });
  });

  it("lets radar and distribution be edited without group comparison, with unique ids per type", () => {
    const { container } = render(<ReportTemplateEdit />);
    expect(container.querySelector("#team-chart-trends")).not.toBeNull();
    expect(container.querySelector("#individual-chart-trends")).not.toBeNull();
    const individual = within(screen.getByText("Individual reports").parentElement!);
    expect(individual.getByRole("checkbox", { name: /radar/ })).toBeEnabled();
    expect(individual.getByRole("checkbox", { name: /radar/ })).not.toBeChecked();
    expect(individual.getByRole("checkbox", { name: /distribution/ })).toBeEnabled();
    expect(individual.queryByRole("checkbox", { name: /Force-Velocity/ })).toBeNull();
  });

  it("shows a not-found card for an id that is not in the list", () => {
    params.current = { templateId: "nope" };
    render(<ReportTemplateEdit />);
    expect(screen.getByText(/was not found/)).toBeInTheDocument();
  });
});

describe("access", () => {
  it("redirects an athlete", () => {
    auth.current = { ...coach, userOrganizations: [{ organizationId: "org-1", role: "athlete" }] };
    render(<ReportTemplateEdit />);
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/");
  });
});
