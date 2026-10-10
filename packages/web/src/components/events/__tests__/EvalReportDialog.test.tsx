/**
 * Unit tests for EvalReportDialog (AM-FEAT-019 P5): the coach's selection screen for one athlete's eval report.
 * The network layer (apiRequest, fetch for the PDF) is mocked; the real hooks and form run.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EvalReportDialog } from "../EvalReportDialog";

const mockApiRequest = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/components/reports/ShareReportDialog", () => ({
  ShareReportDialog: ({ open, reportId }: { open: boolean; reportId: string }) =>
    open ? <div data-testid="share-dialog">Share dialog for {reportId}</div> : null,
}));

beforeAll(() => {
  // Radix UI under happy-dom
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const HEADLINE = [
  { code: "DASH_10YD", key: "DASH_10", label: "10-yard dash", group: "speed", checked: true },
  { code: "FLY10_TIME", key: "FLY_10", label: "Fly 10", group: "speed", checked: true },
  { code: "JUMP_CMJ_HOH", key: "CMJ_HOH", label: "Jump height", group: "power", checked: true },
  { code: "AGILITY_505_YD", key: "505", label: "5-0-5 agility (faster leg)", group: "change_of_direction", checked: true },
  { code: "AGILITY_505_YD_LSI", key: "505_LSI", label: "Left-right balance", group: "movement", checked: true },
];
const AVAILABLE = [
  { code: "VERTICAL_JUMP", key: null, label: "Hands-free jump height", group: "power", checked: false },
  { code: "POWER_EUR", key: "EUR", label: "Elastic use ratio", group: "power", checked: false },
];

function computedDefaults(preset = "high_school") {
  return {
    source: "computed",
    selection: { preset, metricKeys: HEADLINE.map((m) => m.key) },
    load: null,
    coachNote: null,
    offered: { headline: HEADLINE, available: AVAILABLE },
  };
}

/** The model the server would return for a request: metrics for the requested ids; college standard exists for two of them */
function modelFor(body: any, age: number | null, computedPreset = "high_school") {
  const all = [...HEADLINE, ...AVAILABLE];
  const ids: string[] = body?.selection?.metricKeys ?? HEADLINE.map((m) => m.key);
  const metrics = ids
    .map((id) => all.find((m) => (m.key ?? m.code) === id))
    .filter(Boolean)
    .map((m: any) => ({
      key: m.key,
      code: m.code,
      label: m.label,
      value: 1.5,
      unit: "s",
      comparison: null,
      collegeStandard: ["DASH_10", "CMJ_HOH"].includes(m.key) ? { kind: "average", status: "below", distancePct: 5 } : null,
      collegeGauge: false,
      trend: null,
    }));
  return {
    athlete: { name: "Jane Doe", age, graduationYear: 2029, sport: "Soccer", team: null },
    eventDate: "2026-05-01",
    metrics,
    freshAndHealthy: {},
    strengths: ["DASH_10", "FLY_10"],
    developmentAreas: ["CMJ_HOH"],
    limiter: "505",
    coachNote: body?.coachNote ?? null,
    selection: {
      preset: body?.selection?.preset ?? computedPreset,
      metricKeys: ids,
      collegeGauge: body?.selection?.collegeGauge ?? false,
      headline: true,
      noteFirst: false,
      freshAndHealthy: true,
      coachNote: true,
      strengths: true,
      retestTrend: true,
      radar: false,
    },
  };
}

interface Scenario {
  defaults?: unknown;
  settings?: unknown;
  settingsStatus?: number;
  /** Evaluated on every settings GET, to simulate changes made elsewhere */
  settingsFn?: () => unknown;
  age?: number | null;
  /** The preset the server computes when a request names none */
  computedPreset?: string;
  generateError?: string;
}

function setupApi(s: Scenario = {}) {
  const age = s.age === undefined ? 16 : s.age;
  mockApiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    const json = (data: unknown) => ({ json: async () => data });
    if (method === "GET" && url.endsWith("/eval-report/defaults")) return json(s.defaults ?? computedDefaults());
    if (method === "GET" && url.endsWith("/eval-report-settings")) {
      if (s.settingsStatus) throw new Error(`${s.settingsStatus}: {"error":"Not found"}`);
      return json(s.settingsFn ? s.settingsFn() : (s.settings ?? { presets: {}, lastSelection: null }));
    }
    if (method === "PUT" && url.endsWith("/eval-report-settings")) return json({ presets: {}, lastSelection: null, ...body });
    if (method === "POST" && url.endsWith("/eval-report/preview")) return json({ model: modelFor(body, age, s.computedPreset) });
    if (method === "POST" && url.endsWith("/eval-report")) {
      if (s.generateError) throw new Error(`500: {"message":"${s.generateError}"}`);
      return json({ report: { id: "rep-1", name: "Jane Doe - Eval Report - 2026-05-01" }, model: modelFor(body, age) });
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  });
}

function callsTo(method: string, urlEnd: string) {
  return mockApiRequest.mock.calls.filter(([m, u]) => m === method && String(u).endsWith(urlEnd));
}

/** Body of the most recent matching request */
function lastBody(method: string, urlEnd: string) {
  const calls = callsTo(method, urlEnd);
  return calls[calls.length - 1][2];
}

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <EvalReportDialog
        open
        onOpenChange={onOpenChange}
        eventId="evt-1"
        organizationId="org-1"
        athleteId="ath-1"
        athleteName="Jane Doe"
      />
    </QueryClientProvider>
  );
  return { onOpenChange, queryClient };
}

async function ready() {
  await screen.findByRole("radio", { name: "High school" });
  await screen.findByRole("checkbox", { name: "10-yard dash" });
}

describe("EvalReportDialog", () => {
  const user = userEvent.setup();
  let fetchMock: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      headers: new Headers({ "content-disposition": 'attachment; filename="Jane_Doe_Eval.pdf"' }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    window.URL.createObjectURL = vi.fn(() => "blob:test");
    window.URL.revokeObjectURL = vi.fn();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("loads the defaults: preset pre-selected, headline metrics checked, other measured metrics unchecked", async () => {
    setupApi();
    renderDialog();
    await ready();

    expect(screen.getByRole("radio", { name: "High school" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Middle school" })).not.toBeChecked();
    for (const m of HEADLINE) expect(screen.getByRole("checkbox", { name: m.label })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Hands-free jump height" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Elastic use ratio" })).not.toBeChecked();
    expect(screen.getByRole("group", { name: /headline metrics/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /also measured/i })).toBeInTheDocument();
    // Radar is off by default
    expect(screen.getByRole("switch", { name: "Radar chart" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Fresh & Healthy" })).toBeChecked();
  });

  it("shows a loading skeleton before the defaults arrive", () => {
    mockApiRequest.mockImplementation(() => new Promise(() => {}));
    renderDialog();
    expect(screen.getByTestId("eval-dialog-loading")).toBeInTheDocument();
  });

  it("switching the preset applies its defaults: college gauge on for senior, off for middle school", async () => {
    setupApi();
    renderDialog();
    await ready();
    const college = screen.getByRole("switch", { name: "Show college standard gauge" });
    expect(college).not.toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Senior" }));
    expect(college).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Middle school" }));
    expect(college).not.toBeChecked();
    expect(screen.getByText(/appears first/i)).toBeInTheDocument();
  });

  it("keeps a field the coach changed when the preset is switched", async () => {
    setupApi();
    renderDialog();
    await ready();
    const college = screen.getByRole("switch", { name: "Show college standard gauge" });

    await user.click(college); // coach turns it on for a high school athlete
    await user.click(screen.getByRole("radio", { name: "Middle school" }));
    expect(college).toBeChecked();
  });

  it("hides the college gauge for an athlete under 14 even on the senior preset, and one click turns it on", async () => {
    setupApi({ age: 12 });
    renderDialog();
    await ready();
    const college = screen.getByRole("switch", { name: "Show college standard gauge" });

    await user.click(screen.getByRole("radio", { name: "Senior" }));
    expect(college).not.toBeChecked();
    expect(screen.getByText(/under 14/i)).toBeInTheDocument();

    await user.click(college);
    expect(college).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(callsTo("POST", "/eval-report/preview").length).toBeGreaterThan(0));
    const body = lastBody("POST", "/eval-report/preview");
    expect(body.selection.collegeGauge).toBe(true);
  });

  it("offers a per-metric college toggle only where a college standard exists", async () => {
    setupApi();
    renderDialog();
    await ready();

    const dash = await screen.findByRole("checkbox", { name: "College standard for 10-yard dash" });
    expect(screen.getByRole("checkbox", { name: "College standard for Jump height" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "College standard for Fly 10" })).not.toBeInTheDocument();

    await user.click(dash);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(callsTo("POST", "/eval-report/preview").length).toBeGreaterThan(0));
    const body = lastBody("POST", "/eval-report/preview");
    expect(body.selection.metricCollegeGauge).toEqual({ DASH_10: true });
  });

  it("sends the Load choice and counts the coach note", async () => {
    setupApi();
    renderDialog();
    await ready();

    await user.click(screen.getByRole("radio", { name: "Heavy" }));
    expect(screen.getByRole("radio", { name: "Heavy" })).toBeChecked();
    expect(screen.getByText("0 / 2000")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /what we saw/i }), "Strong day");
    expect(screen.getByText("10 / 2000")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(callsTo("POST", "/eval-report/preview").length).toBeGreaterThan(0));
    const body = lastBody("POST", "/eval-report/preview");
    expect(body.load).toBe("heavy");
    expect(body.coachNote).toBe("Strong day");
  });

  it("omits Load when 'Not set' is chosen", async () => {
    setupApi();
    renderDialog();
    await ready();
    await user.click(screen.getByRole("radio", { name: "Light" }));
    await user.click(screen.getByRole("radio", { name: "Not set" }));
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(callsTo("POST", "/eval-report/preview").length).toBeGreaterThan(0));
    expect(lastBody("POST", "/eval-report/preview").load).toBeNull();
  });

  it("previews without saving and renders the returned model", async () => {
    setupApi();
    renderDialog();
    await ready();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByTestId("eval-report-body")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/preview updated/i);
    expect(callsTo("POST", "/eval-report")).toHaveLength(0);
  });

  it("pre-fills strengths, areas and the limiter from the suggestions, and sends overrides only after an edit", async () => {
    setupApi();
    renderDialog();
    await ready();

    const strengths = await screen.findByRole("group", { name: "Strengths" });
    await waitFor(() => expect(within(strengths).getByRole("checkbox", { name: "Strength: 10-yard dash" })).toBeChecked());
    expect(within(strengths).getByRole("checkbox", { name: "Strength: Jump height" })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(callsTo("POST", "/eval-report/preview").length).toBeGreaterThan(0));
    let body = lastBody("POST", "/eval-report/preview");
    expect(body.strengthsOverride).toBeUndefined();
    expect(body.limiterOverride).toBeUndefined();

    await user.click(within(strengths).getByRole("checkbox", { name: "Strength: Jump height" }));
    const before = callsTo("POST", "/eval-report/preview").length;
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(callsTo("POST", "/eval-report/preview").length).toBe(before + 1));
    body = lastBody("POST", "/eval-report/preview");
    expect(body.strengthsOverride).toEqual(["DASH_10", "FLY_10", "CMJ_HOH"]);
  });

  it("generates with the right body, downloads the PDF, and remembers the selection", async () => {
    setupApi();
    renderDialog();
    await ready();
    await user.click(screen.getByRole("radio", { name: "Medium" }));
    await user.click(screen.getByRole("checkbox", { name: "Elastic use ratio" }));
    await user.click(screen.getByRole("checkbox", { name: "Fly 10" })); // uncheck

    await user.click(screen.getByRole("button", { name: "Generate report" }));

    await screen.findByText(/report saved/i);
    const body = lastBody("POST", "/eval-report");
    expect(body.selection.preset).toBe("high_school");
    expect(body.selection.metricKeys).toEqual(["DASH_10", "CMJ_HOH", "505", "505_LSI", "EUR"]);
    expect(body.selection.sections).toMatchObject({ freshAndHealthy: true, coachNote: true, strengths: true, radar: false });
    expect(body.load).toBe("medium");

    expect(fetchMock).toHaveBeenCalledWith("/api/reports/rep-1/pdf", expect.anything());
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Jane_Doe_Eval\.pdf/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open saved report/i })).toHaveAttribute("href", "/reports/rep-1");

    // The org remembers the selection that was used
    await waitFor(() => expect(callsTo("PUT", "/eval-report-settings")).toHaveLength(1));
    const put = callsTo("PUT", "/eval-report-settings")[0][2];
    expect(put.lastSelection).toMatchObject({ preset: "high_school", metricKeys: body.selection.metricKeys, freshAndHealthy: true });
  });

  it("never creates a share link by itself; the optional button opens the share dialog", async () => {
    setupApi();
    renderDialog();
    await ready();
    await user.click(screen.getByRole("button", { name: "Generate report" }));
    await screen.findByText(/report saved/i);

    expect(screen.queryByTestId("share-dialog")).not.toBeInTheDocument();
    expect(mockApiRequest.mock.calls.some(([, u]) => String(u).includes("/snapshots"))).toBe(false);

    await user.click(screen.getByRole("button", { name: /create share link/i }));
    expect(screen.getByTestId("share-dialog")).toHaveTextContent("rep-1");
    expect(mockApiRequest.mock.calls.some(([, u]) => String(u).includes("/snapshots"))).toBe(false);
  });

  it("describes the share link accurately, including the minor restriction", async () => {
    setupApi();
    renderDialog();
    await ready();
    await user.click(screen.getByRole("button", { name: "Generate report" }));
    await screen.findByText(/report saved/i);

    const text = screen.getByRole("heading", { name: /share link \(optional\)/i }).parentElement!.textContent ?? "";
    expect(text).not.toMatch(/anyone who has a share link/i);
    expect(text).toMatch(/anyone with the link can view this report until it expires or you revoke it/i);
    expect(text).toMatch(/if the athlete is a minor, the link only opens for a signed-in parent linked to them, so send the pdf instead/i);
  });

  it("warns about the under-13 rule in the success state", async () => {
    setupApi({ age: 11 });
    renderDialog();
    await ready();
    await user.click(screen.getByRole("button", { name: "Generate report" }));
    await screen.findByText(/report saved/i);
    expect(screen.getByText(/under 13/i)).toBeInTheDocument();
  });

  it("keeps the saved report and offers a retry when only the PDF download fails", async () => {
    setupApi();
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ message: "PDF engine down" }), headers: new Headers() });
    renderDialog();
    await ready();
    await user.click(screen.getByRole("button", { name: "Generate report" }));

    await screen.findByText(/report saved/i);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: expect.stringContaining("PDF engine down") }));
    await user.click(screen.getByRole("button", { name: /download pdf/i }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
  });

  it("shows an error toast and stays on the form when generating fails", async () => {
    setupApi({ generateError: "Failed to save eval report" });
    renderDialog();
    await ready();
    await user.click(screen.getByRole("button", { name: "Generate report" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: "Failed to save eval report" }))
    );
    expect(screen.queryByText(/report saved/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate report" })).toBeEnabled();
  });

  it("requires at least one metric", async () => {
    setupApi();
    renderDialog();
    await ready();
    for (const m of HEADLINE) await user.click(screen.getByRole("checkbox", { name: m.label }));

    await user.click(screen.getByRole("button", { name: "Generate report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/choose at least one metric/i);
    // The failure is also announced in the live region
    expect(screen.getByRole("status")).toHaveTextContent(/choose at least one metric/i);
    expect(callsTo("POST", "/eval-report")).toHaveLength(0);
  });

  it("disables the buttons while a request is pending", async () => {
    setupApi();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = mockApiRequest.getMockImplementation()!;
    mockApiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === "POST" && url.endsWith("/eval-report")) await gate;
      return original(method, url, body);
    });
    renderDialog();
    await ready();
    await user.click(screen.getByRole("button", { name: "Generate report" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /generating/i })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    release();
    await screen.findByText(/report saved/i);
  });

  it("ignores a second submit that arrives before the first has rendered as pending", async () => {
    setupApi();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = mockApiRequest.getMockImplementation()!;
    mockApiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === "POST" && url.endsWith("/eval-report")) await gate;
      return original(method, url, body);
    });
    renderDialog();
    await ready();

    const button = screen.getByRole("button", { name: "Generate report" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(callsTo("POST", "/eval-report").length).toBeGreaterThan(0));
    release();
    await screen.findByText(/report saved/i);
    expect(callsTo("POST", "/eval-report")).toHaveLength(1);
  });

  it("ignores a second Preview click while one is running", async () => {
    setupApi();
    renderDialog();
    await ready();
    await waitFor(() => expect(callsTo("POST", "/eval-report/preview").length).toBe(2)); // probe + suggestions
    const button = screen.getByRole("button", { name: "Preview" });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByTestId("eval-report-body");
    expect(callsTo("POST", "/eval-report/preview")).toHaveLength(3);
  });

  it("does not fetch more previews once the report is saved, and refreshes the report lists", async () => {
    setupApi();
    const { queryClient } = renderDialog();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await ready();
    await waitFor(() => expect(callsTo("POST", "/eval-report/preview").length).toBe(2));
    const before = callsTo("POST", "/eval-report/preview").length;

    await user.click(screen.getByRole("button", { name: "Generate report" }));
    await screen.findByText(/report saved/i);
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(callsTo("POST", "/eval-report/preview")).toHaveLength(before);
    const keys = invalidate.mock.calls.map(([filter]) => JSON.stringify((filter as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(["reports"]));
    expect(keys).toContain(JSON.stringify(["events", "evt-1", "reports"]));
  });

  it("shows why Generate did nothing when the form is invalid", async () => {
    setupApi();
    renderDialog();
    await ready();
    fireEvent.change(screen.getByRole("textbox", { name: /what we saw/i }), { target: { value: "x".repeat(2001) } });
    await user.click(screen.getByRole("button", { name: "Generate report" }));
    expect(screen.getByRole("status")).toHaveTextContent(/2000 characters or fewer/i);
    expect(callsTo("POST", "/eval-report")).toHaveLength(0);
  });

  it("starts from the computed preset and the checked metrics when the saved eval has an empty selection", async () => {
    setupApi({
      computedPreset: "middle_school",
      defaults: {
        source: "saved",
        reportId: "old",
        selection: {},
        load: null,
        coachNote: null,
        offered: { headline: HEADLINE, available: AVAILABLE },
      },
    });
    renderDialog();
    await screen.findByRole("checkbox", { name: "10-yard dash" });
    // The preview of every metric (no preset requested) reports the computed preset
    expect(screen.getByRole("radio", { name: "Middle school" })).toBeChecked();
    for (const m of HEADLINE) expect(screen.getByRole("checkbox", { name: m.label })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Elastic use ratio" })).not.toBeChecked();
  });

  describe("remembered selection", () => {
    it("merges the org's saved selection over the computed defaults", async () => {
      setupApi({
        settings: {
          presets: {},
          lastSelection: {
            preset: "high_school",
            metricKeys: ["DASH_10", "EUR"],
            collegeGauge: false,
            headline: true,
            freshAndHealthy: false,
            coachNote: true,
            strengths: true,
            retestTrend: true,
          },
        },
      });
      renderDialog();
      await ready();

      expect(screen.getByRole("checkbox", { name: "10-yard dash" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Elastic use ratio" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Fly 10" })).not.toBeChecked();
      expect(screen.getByRole("switch", { name: "Fresh & Healthy" })).not.toBeChecked();
    });

    it("ignores remembered metrics the athlete has no data for", async () => {
      setupApi({
        settings: {
          presets: { high_school: { metricKeys: ["DASH_10", "MOMENTUM"] } },
          lastSelection: null,
        },
      });
      renderDialog();
      await ready();
      expect(screen.getByRole("checkbox", { name: "10-yard dash" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Fly 10" })).not.toBeChecked();
    });

    it("a saved eval for this event and athlete wins over the org's saved selection", async () => {
      setupApi({
        defaults: {
          source: "saved",
          reportId: "old-rep",
          selection: { preset: "high_school", metricKeys: ["FLY_10", "CMJ_HOH"], sections: { freshAndHealthy: true } },
          load: "light",
          coachNote: "Earlier note",
          offered: { headline: HEADLINE, available: AVAILABLE },
        },
        settings: {
          presets: {},
          lastSelection: {
            preset: "high_school", metricKeys: ["DASH_10"], collegeGauge: false, headline: true,
            freshAndHealthy: false, coachNote: true, strengths: true, retestTrend: true,
          },
        },
      });
      renderDialog();
      await screen.findByRole("checkbox", { name: "Fly 10" });

      expect(screen.getByRole("checkbox", { name: "Fly 10" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "10-yard dash" })).not.toBeChecked();
      expect(screen.getByRole("switch", { name: "Fresh & Healthy" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
      expect(screen.getByRole("textbox", { name: /what we saw/i })).toHaveValue("Earlier note");
      expect(screen.getByText(/last saved report/i)).toBeInTheDocument();
    });

    it("still works when the org settings cannot be read", async () => {
      setupApi({ settingsStatus: 404 });
      renderDialog();
      await ready();
      expect(screen.getByRole("checkbox", { name: "10-yard dash" })).toBeChecked();
      // Saving a default without knowing the other presets could wipe them
      expect(screen.getByRole("button", { name: "Save as default for this preset" })).toBeDisabled();
    });

    it("'Save as default for this preset' stores the current choices under that preset", async () => {
      setupApi({ settings: { presets: { senior: { collegeGauge: true } }, lastSelection: null } });
      renderDialog();
      await ready();
      await user.click(screen.getByRole("checkbox", { name: "Fly 10" })); // uncheck

      await user.click(screen.getByRole("button", { name: "Save as default for this preset" }));

      await waitFor(() => expect(callsTo("PUT", "/eval-report-settings")).toHaveLength(1));
      const put = callsTo("PUT", "/eval-report-settings")[0][2];
      expect(put.presets.senior).toEqual({ collegeGauge: true });
      expect(put.presets.high_school).toMatchObject({
        metricKeys: ["DASH_10", "CMJ_HOH", "505", "505_LSI"],
        collegeGauge: false,
        freshAndHealthy: true,
      });
      expect(put.lastSelection).toBeUndefined();
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/saved/i) })));
    });

    it("merges into the freshly fetched presets, not the ones loaded when the dialog opened", async () => {
      let current: unknown = { presets: { senior: { collegeGauge: true } }, lastSelection: null };
      setupApi({ settingsFn: () => current });
      renderDialog();
      await ready();
      // Another coach saves a middle school default while this dialog is open
      current = { presets: { senior: { collegeGauge: true }, middle_school: { metricKeys: ["DASH_10"] } }, lastSelection: null };

      await user.click(screen.getByRole("button", { name: "Save as default for this preset" }));

      await waitFor(() => expect(callsTo("PUT", "/eval-report-settings")).toHaveLength(1));
      const put = callsTo("PUT", "/eval-report-settings")[0][2];
      expect(put.presets.middle_school).toEqual({ metricKeys: ["DASH_10"] });
      expect(put.presets.senior).toEqual({ collegeGauge: true });
      expect(put.presets.high_school).toBeDefined();
    });

    it("does not save when the fresh read of the settings fails", async () => {
      let fail = false;
      setupApi({
        settingsFn: () => {
          if (fail) throw new Error("500: {}");
          return { presets: { senior: { collegeGauge: true } }, lastSelection: null };
        },
      });
      renderDialog();
      await ready();
      fail = true;
      await user.click(screen.getByRole("button", { name: "Save as default for this preset" }));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
      expect(callsTo("PUT", "/eval-report-settings")).toHaveLength(0);
    });
  });
});
