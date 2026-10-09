/**
 * Unit tests for EvalTemplatePicker and the template result wording (AM-FEAT-019 P5)
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvalTemplatePicker } from "../EvalTemplatePicker";
import { describeTemplateResult, templateFailureTitle, TEMPLATE_KEY_LABELS } from "@/lib/eval-template-labels";
import { TEMPLATE_METRIC_CODES } from "../../../../../api/services/eval-report/template-keys";

const mockUseEvalTemplates = vi.fn();
vi.mock("@/hooks/use-eval-report", () => ({
  useEvalTemplates: (...args: unknown[]) => mockUseEvalTemplates(...args),
}));

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const templates = [
  {
    id: "t-global",
    organizationId: null,
    name: "Soccer eval (yards)",
    sport: "SOCCER",
    metrics: [
      { metricKey: "DASH_10", isRequired: true, displayOrder: 0 },
      { metricKey: "BODY_HEIGHT", isRequired: true, displayOrder: 1 },
      { metricKey: "CMJ_SL_LEFT", isRequired: false, displayOrder: 2 },
      { metricKey: "CMJ_SL_RIGHT", isRequired: false, displayOrder: 3 },
      { metricKey: "STRENGTH_SQUAT", isRequired: false, displayOrder: 4 },
    ],
  },
  { id: "t-org", organizationId: "org-1", name: "Spring battery", sport: "SOCCER", metrics: [{ metricKey: "DASH_10", isRequired: true, displayOrder: 0 }] },
];

describe("EvalTemplatePicker", () => {
  const onChange = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEvalTemplates.mockReturnValue({ data: templates, isLoading: false, isError: false });
  });

  it("offers the org's templates and the global default", async () => {
    render(<EvalTemplatePicker organizationId="org-1" value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox", { name: /start from template/i }));
    expect(screen.getByRole("option", { name: "Soccer eval (yards)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Spring battery" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "No template" })).toBeInTheDocument();
  });

  it("selecting a template applies required metrics only by default", async () => {
    render(<EvalTemplatePicker organizationId="org-1" value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox", { name: /start from template/i }));
    await userEvent.click(screen.getByRole("option", { name: "Soccer eval (yards)" }));
    expect(onChange).toHaveBeenCalledWith({ templateId: "t-global", includeOptional: [] });
  });

  it("clearing the template reports null", async () => {
    render(<EvalTemplatePicker organizationId="org-1" value={{ templateId: "t-global", includeOptional: [] }} onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox", { name: /start from template/i }));
    await userEvent.click(screen.getByRole("option", { name: "No template" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("lists the optional tests as a multi-select and reports the chosen keys", async () => {
    render(<EvalTemplatePicker organizationId="org-1" value={{ templateId: "t-global", includeOptional: [] }} onChange={onChange} />);
    const group = screen.getByRole("group", { name: /include optional tests/i });
    expect(group).toBeInTheDocument();
    // Required metrics are not offered as optional
    expect(screen.queryByRole("checkbox", { name: "10-yard dash" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Squat strength" }));
    expect(onChange).toHaveBeenCalledWith({ templateId: "t-global", includeOptional: ["STRENGTH_SQUAT"] });
  });

  it("tells the coach to use one single-leg jump side", () => {
    render(<EvalTemplatePicker organizationId="org-1" value={{ templateId: "t-global", includeOptional: [] }} onChange={onChange} />);
    expect(screen.getByText(/one single-leg jump side/i)).toBeInTheDocument();
  });

  it("shows no optional group for a template without optional tests", () => {
    render(<EvalTemplatePicker organizationId="org-1" value={{ templateId: "t-org", includeOptional: [] }} onChange={onChange} />);
    expect(screen.queryByRole("group", { name: /include optional tests/i })).not.toBeInTheDocument();
  });

  it("renders nothing when templates cannot be read (not a writer) or there are none", () => {
    mockUseEvalTemplates.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container, rerender } = render(<EvalTemplatePicker organizationId="org-1" value={null} onChange={onChange} />);
    expect(container).toBeEmptyDOMElement();

    mockUseEvalTemplates.mockReturnValue({ data: [], isLoading: false, isError: false });
    rerender(<EvalTemplatePicker organizationId="org-1" value={null} onChange={onChange} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("describeTemplateResult", () => {
  it("lists skipped keys plainly as not available yet", () => {
    const out = describeTemplateResult({ added: ["DASH_10YD", "HEIGHT"], skipped: ["MOMENTUM", "STRENGTH_SQUAT"], alreadyPresent: [] });
    expect(out.title).toBe("Template applied");
    expect(out.description).toBe("2 metrics added. Not available yet: Momentum, Squat strength.");
  });

  it("mentions metrics that were already on the event and handles singular", () => {
    const out = describeTemplateResult({ added: ["HEIGHT"], skipped: [], alreadyPresent: ["DASH_10YD"] });
    expect(out.description).toBe("1 metric added, 1 already on the event.");
  });
});

describe("template labels", () => {
  it("has a plain label for every key the API can store in a template", () => {
    // Imported from the API package: a pure constant, so the web cannot drift from the API's key list
    const missing = Object.keys(TEMPLATE_METRIC_CODES).filter((key) => !(key in TEMPLATE_KEY_LABELS));
    expect(missing).toEqual([]);
  });

  it("uses the draft wording when the event is a draft", () => {
    expect(templateFailureTitle(true)).toBe("Draft saved, template not applied");
    expect(templateFailureTitle(false)).toBe("Event created, template not applied");
  });
});
