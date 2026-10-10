/**
 * Unit tests for EvalTemplatePicker: choosing a template fills the new-event metrics list (AM-FEAT-019)
 */

import { useState } from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvalTemplatePicker, type EvalTemplateChoice } from "../EvalTemplatePicker";
import type { SelectedMetric } from "../MetricsSelector";
import { TEMPLATE_KEY_LABELS } from "@/lib/eval-template-labels";
import { TEMPLATE_METRIC_CODES } from "../../../../../api/services/eval-report/template-keys";

const mockUseEvalTemplates = vi.fn();
const mockUseResolved = vi.fn();
const mockFetchResolved = vi.fn();
vi.mock("@/hooks/use-eval-report", () => ({
  useEvalTemplates: (...args: unknown[]) => mockUseEvalTemplates(...args),
  useResolvedEvalTemplate: (...args: unknown[]) => mockUseResolved(...args),
  useFetchResolvedEvalTemplate: () => mockFetchResolved,
}));

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const r = (metricKey: string, code: string, displayOrder: number, isRequired: boolean, extra: Record<string, unknown> = {}) => ({
  metricKey, code, label: `Label ${code}`, unit: "s", category: "speed", isRequired, displayOrder, status: "available", ...extra,
});

const globalMetrics = [
  { metricKey: "DASH_10", isRequired: true, displayOrder: 0 },
  { metricKey: "BODY_HEIGHT", isRequired: true, displayOrder: 1 },
  { metricKey: "CMJ_SL_LEFT", isRequired: false, displayOrder: 2 },
  { metricKey: "CMJ_SL_RIGHT", isRequired: false, displayOrder: 3 },
  { metricKey: "STRENGTH_SQUAT", isRequired: false, displayOrder: 4 },
  { metricKey: "MOMENTUM", isRequired: false, displayOrder: 5 },
  { metricKey: "HAND", isRequired: false, displayOrder: 6 },
];
const templates = [
  { id: "t-global", organizationId: null, name: "Soccer eval (yards)", sport: "SOCCER", metrics: globalMetrics },
  { id: "t-org", organizationId: "org-1", name: "Spring battery", sport: "SOCCER", metrics: [{ metricKey: "T_TEST", isRequired: true, displayOrder: 0 }] },
];
const resolvedByTemplate: Record<string, any> = {
  "t-global": {
    template: { id: "t-global", name: "Soccer eval (yards)" },
    metrics: [
      r("DASH_10", "DASH_10YD", 0, true),
      r("BODY_HEIGHT", "HEIGHT_IN", 1, true, { unit: "in", category: "body" }),
      r("CMJ_SL_LEFT", "JUMP_CMJ_SL_L", 2, false),
      r("CMJ_SL_RIGHT", "JUMP_CMJ_SL_R", 3, false),
      r("STRENGTH_SQUAT", "SQUAT_1RM", 4, false),
      r("MOMENTUM", "MOMENTUM", 5, false, { status: "derived" }),
      r("HAND", "HAND_GRIP", 6, false, { status: "missing", label: null }),
    ],
  },
  "t-org": { template: { id: "t-org", name: "Spring battery" }, metrics: [r("T_TEST", "T_TEST", 0, true)] },
};

/** Stateful host, like EventForm: owns the choice and the list */
function Host({ initialList = [] as SelectedMetric[], initialChoice = null as EvalTemplateChoice | null }) {
  const [choice, setChoice] = useState<EvalTemplateChoice | null>(initialChoice);
  const [list, setList] = useState<SelectedMetric[]>(initialList);
  return (
    <>
      <EvalTemplatePicker organizationId="org-1" value={choice} onChange={setChoice} onSelectedMetricsChange={setList} />
      <ul data-testid="list">
        {list.map((m) => (
          <li key={m.code} data-from-template={m.fromTemplate ? "yes" : "no"}>
            {m.code}:{m.isRequired ? "req" : "opt"}
          </li>
        ))}
        <button type="button" onClick={() => setList((l) => l.filter((m) => m.code !== "DASH_10YD"))}>
          remove dash
        </button>
        <button type="button" onClick={() => setList((l) => [...l, { code: "BY_HAND", label: "By hand", isRequired: false }])}>
          add by hand
        </button>
      </ul>
    </>
  );
}
const listCodes = () => Array.from(screen.getByTestId("list").querySelectorAll("li")).map((li) => li.textContent);
const pick = async (name: string) => {
  await userEvent.click(screen.getByRole("combobox", { name: /start from template/i }));
  await userEvent.click(screen.getByRole("option", { name }));
};

describe("EvalTemplatePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEvalTemplates.mockReturnValue({ data: templates, isLoading: false, isError: false });
    mockFetchResolved.mockImplementation(async (id: string) => resolvedByTemplate[id]);
    mockUseResolved.mockImplementation((id?: string) => ({ data: id ? resolvedByTemplate[id] : undefined, isLoading: false, isError: false }));
  });

  it("offers the org's templates and the global default", async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole("combobox", { name: /start from template/i }));
    expect(screen.getByRole("option", { name: "Soccer eval (yards)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Spring battery" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "No template" })).toBeInTheDocument();
  });

  it("choosing a template fills the list with its required tests, in order", async () => {
    render(<Host />);
    await pick("Soccer eval (yards)");
    await waitFor(() => expect(listCodes()).toEqual(["DASH_10YD:req", "HEIGHT_IN:req"]));
    expect(screen.getByTestId("list").querySelector("li")).toHaveAttribute("data-from-template", "yes");
    expect(mockFetchResolved).toHaveBeenCalledWith("t-global");
  });

  it("says the list below is filled and can be changed, not that tests are added after creation", () => {
    render(<Host />);
    expect(screen.getByText("Fills the tests below. Add or remove tests before you create the event.")).toBeInTheDocument();
    expect(screen.queryByText(/after it is created/i)).not.toBeInTheDocument();
  });

  it("ticking an optional test adds it, unticking removes it", async () => {
    render(<Host />);
    await pick("Soccer eval (yards)");
    await waitFor(() => expect(listCodes()).toHaveLength(2));
    await userEvent.click(screen.getByRole("checkbox", { name: "Squat strength" }));
    expect(listCodes()).toEqual(["DASH_10YD:req", "HEIGHT_IN:req", "SQUAT_1RM:opt"]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Squat strength" }));
    expect(listCodes()).toEqual(["DASH_10YD:req", "HEIGHT_IN:req"]);
  });

  it("switching template replaces the template's tests and keeps the ones added by hand", async () => {
    render(<Host />);
    await pick("Soccer eval (yards)");
    await waitFor(() => expect(listCodes()).toHaveLength(2));
    await userEvent.click(screen.getByRole("button", { name: "add by hand" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Squat strength" }));
    await pick("Spring battery");
    await waitFor(() => expect(listCodes()).toEqual(["T_TEST:req", "BY_HAND:opt"]));
    // The optional ticks belong to the old template and are reset
    expect(screen.queryByRole("checkbox", { name: "Squat strength" })).not.toBeInTheDocument();
  });

  it("'No template' removes only the template's tests", async () => {
    render(<Host />);
    await pick("Soccer eval (yards)");
    await waitFor(() => expect(listCodes()).toHaveLength(2));
    await userEvent.click(screen.getByRole("button", { name: "add by hand" }));
    await pick("No template");
    expect(listCodes()).toEqual(["BY_HAND:opt"]);
  });

  it("a template test removed from the list stays removed when another optional test is ticked", async () => {
    render(<Host />);
    await pick("Soccer eval (yards)");
    await waitFor(() => expect(listCodes()).toHaveLength(2));
    await userEvent.click(screen.getByRole("button", { name: "remove dash" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Squat strength" }));
    expect(listCodes()).toEqual(["HEIGHT_IN:req", "SQUAT_1RM:opt"]);
  });

  it("names the tests the template lists but cannot add, and does not offer them as optional", async () => {
    render(<Host />);
    await pick("Soccer eval (yards)");
    await waitFor(() => expect(listCodes()).toHaveLength(2));
    expect(screen.getByText(/Not available yet: Hand/i)).toBeInTheDocument();
    expect(screen.getByText(/Calculated automatically, nothing to enter: Momentum/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Momentum" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Hand" })).not.toBeInTheDocument();
    expect(listCodes().join()).not.toMatch(/MOMENTUM|HAND_GRIP/);
  });

  it("a slow answer for a template that was already replaced is ignored", async () => {
    let releaseGlobal: (v: unknown) => void = () => {};
    mockFetchResolved.mockImplementation((id: string) => (id === "t-global" ? new Promise((res) => (releaseGlobal = res)) : Promise.resolve(resolvedByTemplate[id])));
    render(<Host />);
    await pick("Soccer eval (yards)");
    await pick("Spring battery");
    await waitFor(() => expect(listCodes()).toEqual(["T_TEST:req"]));
    releaseGlobal(resolvedByTemplate["t-global"]);
    await new Promise((res) => setTimeout(res, 20));
    expect(listCodes()).toEqual(["T_TEST:req"]);
  });

  it("adds nothing and says so when the template's tests cannot be loaded", async () => {
    mockFetchResolved.mockRejectedValue(new Error("500"));
    mockUseResolved.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<Host />);
    await pick("Soccer eval (yards)");
    expect(await screen.findByText(/could not load this template's tests/i)).toBeInTheDocument();
    expect(listCodes()).toEqual([]);
  });

  it("lists the optional tests as a multi-select", async () => {
    render(<Host initialChoice={{ templateId: "t-global", includeOptional: [] }} />);
    expect(screen.getByRole("group", { name: /include optional tests/i })).toBeInTheDocument();
    // Required metrics are not offered as optional
    expect(screen.queryByRole("checkbox", { name: "10-yard dash" })).not.toBeInTheDocument();
  });

  it("tells the coach to use one single-leg jump side", () => {
    render(<Host initialChoice={{ templateId: "t-global", includeOptional: [] }} />);
    expect(screen.getByText(/one single-leg jump side/i)).toBeInTheDocument();
  });

  it("shows no optional group for a template without optional tests", () => {
    render(<Host initialChoice={{ templateId: "t-org", includeOptional: [] }} />);
    expect(screen.queryByRole("group", { name: /include optional tests/i })).not.toBeInTheDocument();
  });

  it("renders nothing when templates cannot be read (not a writer) or there are none", () => {
    mockUseEvalTemplates.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container, rerender } = render(<Host />);
    expect(container.querySelector('[data-testid="eval-template-picker"]')).toBeNull();

    mockUseEvalTemplates.mockReturnValue({ data: [], isLoading: false, isError: false });
    rerender(<Host />);
    expect(container.querySelector('[data-testid="eval-template-picker"]')).toBeNull();
  });
});

describe("template labels", () => {
  it("has a plain label for every key the API can store in a template", () => {
    // Imported from the API package: a pure constant, so the web cannot drift from the API's key list
    const missing = Object.keys(TEMPLATE_METRIC_CODES).filter((key) => !(key in TEMPLATE_KEY_LABELS));
    expect(missing).toEqual([]);
  });
});
