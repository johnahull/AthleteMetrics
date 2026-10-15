/**
 * Unit tests for EventEvalReportsCard (AM-FEAT-019 P5): the per-athlete "Generate eval report" entry point
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventEvalReportsCard } from "../EventEvalReportsCard";

const mockUseEventMeasurements = vi.fn();
vi.mock("@/lib/events-api", () => ({
  useEventMeasurements: (...args: unknown[]) => mockUseEventMeasurements(...args),
}));

vi.mock("../EvalReportDialog", () => ({
  EvalReportDialog: (props: { open: boolean; athleteId: string; athleteName: string; organizationId: string }) =>
    props.open ? (
      <div data-testid="eval-dialog">
        {props.athleteId}|{props.athleteName}|{props.organizationId}
      </div>
    ) : null,
}));

const measurements = [
  { id: "m1", userId: "a1", user: { id: "x", fullName: "Jane Doe" }, metric: "DASH_10YD" },
  { id: "m2", userId: "a1", user: { id: "x", fullName: "Jane Doe" }, metric: "FLY10_TIME" },
  { id: "m3", userId: "a2", user: { id: "x", fullName: "Alex Roe" }, metric: "DASH_10YD" },
];

describe("EventEvalReportsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEventMeasurements.mockReturnValue({ data: measurements, isLoading: false });
  });

  it("lists each athlete with measurements once, with a Generate eval report action", () => {
    render(<EventEvalReportsCard eventId="evt-1" organizationId="org-1" canManage />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Alex Roe")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Jane Doe")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/2 measurements/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate eval report for Jane Doe" })).toBeInTheDocument();
  });

  it("opens the dialog for the chosen athlete", async () => {
    render(<EventEvalReportsCard eventId="evt-1" organizationId="org-1" canManage />);
    expect(screen.queryByTestId("eval-dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate eval report for Jane Doe" }));
    expect(screen.getByTestId("eval-dialog")).toHaveTextContent("a1|Jane Doe|org-1");
  });

  it("renders nothing for someone who cannot manage the event", () => {
    const { container } = render(<EventEvalReportsCard eventId="evt-1" organizationId="org-1" canManage={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(mockUseEventMeasurements).toHaveBeenCalledWith(undefined);
  });

  it("renders nothing for an event without an organization", () => {
    const { container } = render(<EventEvalReportsCard eventId="evt-1" organizationId={undefined} canManage />);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains when nobody has measurements yet", () => {
    mockUseEventMeasurements.mockReturnValue({ data: [], isLoading: false });
    render(<EventEvalReportsCard eventId="evt-1" organizationId="org-1" canManage />);
    expect(screen.getByText(/enter measurements/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate eval report/i })).not.toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    mockUseEventMeasurements.mockReturnValue({ data: undefined, isLoading: true });
    render(<EventEvalReportsCard eventId="evt-1" organizationId="org-1" canManage />);
    expect(screen.getByTestId("eval-reports-loading")).toBeInTheDocument();
  });
});
