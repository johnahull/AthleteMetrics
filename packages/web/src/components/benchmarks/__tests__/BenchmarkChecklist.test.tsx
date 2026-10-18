import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BenchmarkChecklist } from "../BenchmarkChecklist";

vi.mock("@/hooks/use-metric-config", () => ({
  useMetricConfig: () => ({
    getMetricConfig: (code: string) => (code === "FLY10_TIME" ? { label: "Fly 10" } : code === "VERTICAL_JUMP" ? { label: "Vertical Jump" } : null),
  }),
}));

interface Row {
  id: string;
  name: string;
  metricCode: string;
  gender?: string | null;
  level?: string | null;
  tierGroupId?: string | null;
}

const rows: Row[] = [
  { id: "a", name: "Elite Male", metricCode: "FLY10_TIME", gender: "Male", level: "college" },
  { id: "b", name: "Elite Female", metricCode: "FLY10_TIME", gender: "Female", level: "college" },
  { id: "c", name: "Open Standard", metricCode: "FLY10_TIME", gender: null, level: "club" },
  { id: "d", name: "Jump Gold", metricCode: "VERTICAL_JUMP", gender: "Male", tierGroupId: "g1" },
  { id: "e", name: "Jump Silver", metricCode: "VERTICAL_JUMP", gender: "Male", tierGroupId: "g1" },
];

function Harness({ initial = [] as string[], onChangeSpy }: { initial?: string[]; onChangeSpy?: (v: string[]) => void }) {
  const [selected, setSelected] = useState(initial);
  return (
    <BenchmarkChecklist
      items={rows}
      getKey={(r) => r.id}
      getLabel={(r) => r.name}
      getMeta={(r) => ({ metricCode: r.metricCode, gender: r.gender, level: r.level, tierGroupId: r.tierGroupId })}
      getTierGroupLabel={() => "Jump"}
      selected={selected}
      onChange={(v) => {
        setSelected(v);
        onChangeSpy?.(v);
      }}
    />
  );
}

describe("BenchmarkChecklist", () => {
  it("filters rows by search and reports the shown count", async () => {
    render(<Harness />);
    expect(screen.getByText("5 of 5 shown")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox"), "elite");
    expect(screen.getByText("2 of 5 shown")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open Standard")).not.toBeInTheDocument();
  });

  it("narrows by chip and keeps null-gender rows under a Gender chip", async () => {
    render(<Harness />);
    const genderGroup = screen.getByRole("group", { name: "Gender" });
    await userEvent.click(within(genderGroup).getByRole("button", { name: "Female" }));
    expect(screen.getByLabelText("Elite Female")).toBeInTheDocument();
    expect(screen.getByLabelText("Open Standard")).toBeInTheDocument();
    expect(screen.queryByLabelText("Elite Male")).not.toBeInTheDocument();
    expect(within(genderGroup).getByRole("button", { name: "Female" })).toHaveAttribute("aria-pressed", "true");
  });

  it("hides chip groups with no values", () => {
    render(<Harness />);
    expect(screen.queryByRole("group", { name: "Source" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Level" })).toBeInTheDocument();
  });

  it("shows metric headings with selected/total counts", () => {
    render(<Harness initial={["a", "d"]} />);
    expect(screen.getByText("Fly 10 (1/3)")).toBeInTheDocument();
    expect(screen.getByText("Vertical Jump (1/2)")).toBeInTheDocument();
  });

  it("tier group checkbox is indeterminate when partly selected and selects all tiers", async () => {
    render(<Harness initial={["d"]} />);
    const group = screen.getByRole("checkbox", { name: /2 tiers/ });
    expect(group).toHaveAttribute("aria-checked", "mixed");
    await userEvent.click(group);
    expect(group).toHaveAttribute("aria-checked", "true");
  });

  it("Select visible merges with the existing selection; Clear visible only removes visible rows", async () => {
    const spy = vi.fn();
    render(<Harness initial={["d"]} onChangeSpy={spy} />);
    await userEvent.type(screen.getByRole("searchbox"), "elite");
    await userEvent.click(screen.getByRole("button", { name: "Select visible" }));
    expect(spy).toHaveBeenLastCalledWith(["d", "a", "b"]);
    await userEvent.click(screen.getByRole("button", { name: "Clear visible" }));
    expect(spy).toHaveBeenLastCalledWith(["d"]);
  });

  it("keeps both chips when two are toggled in the same batch", () => {
    render(<Harness />);
    const levelGroup = screen.getByRole("group", { name: "Level" });
    act(() => {
      fireEvent.click(within(levelGroup).getByRole("button", { name: "College" }));
      fireEvent.click(within(levelGroup).getByRole("button", { name: "Club" }));
    });
    expect(within(levelGroup).getByRole("button", { name: "College" })).toHaveAttribute("aria-pressed", "true");
    expect(within(levelGroup).getByRole("button", { name: "Club" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not offer Select all / Clear all", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /select all/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear all/i })).not.toBeInTheDocument();
  });

  it("applies context as initial chips", () => {
    render(
      <BenchmarkChecklist
        items={rows}
        getKey={(r) => r.id}
        getLabel={(r) => r.name}
        getMeta={(r) => ({ metricCode: r.metricCode, gender: r.gender })}
        selected={[]}
        onChange={() => {}}
        context={{ gender: "Female" }}
      />,
    );
    expect(screen.queryByLabelText("Elite Male")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Elite Female")).toBeInTheDocument();
  });

  const ctxProps = {
    items: rows,
    getKey: (r: Row) => r.id,
    getLabel: (r: Row) => r.name,
    getMeta: (r: Row) => ({ metricCode: r.metricCode, gender: r.gender }),
    selected: [] as string[],
    onChange: () => {},
  };

  it("re-applies a context that changes after mount until the user touches a chip", async () => {
    const { rerender } = render(<BenchmarkChecklist {...ctxProps} />);
    expect(screen.getByLabelText("Elite Male")).toBeInTheDocument();
    rerender(<BenchmarkChecklist {...ctxProps} context={{ gender: "Female" }} />);
    expect(screen.queryByLabelText("Elite Male")).not.toBeInTheDocument();
    rerender(<BenchmarkChecklist {...ctxProps} context={{ gender: "Male" }} />);
    expect(screen.queryByLabelText("Elite Female")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Elite Male")).toBeInTheDocument();

    const genderGroup = screen.getByRole("group", { name: "Gender" });
    await userEvent.click(within(genderGroup).getByRole("button", { name: "Male" }));
    rerender(<BenchmarkChecklist {...ctxProps} context={{ gender: "Female" }} />);
    expect(screen.getByLabelText("Elite Female")).toBeInTheDocument();
    expect(screen.getByLabelText("Elite Male")).toBeInTheDocument();
  });

  it("labels a filtered tier group with visible of total tiers", () => {
    const tiers = [
      { id: "t1", name: "Tier A", metricCode: "FLY10_TIME", gender: "Male", tierGroupId: "g" },
      { id: "t2", name: "Tier B", metricCode: "FLY10_TIME", gender: "Female", tierGroupId: "g" },
    ];
    render(
      <BenchmarkChecklist
        items={tiers}
        getKey={(r) => r.id}
        getLabel={(r) => r.name}
        getMeta={(r) => ({ metricCode: r.metricCode, gender: r.gender, tierGroupId: r.tierGroupId })}
        getTierGroupLabel={() => "Tiers"}
        selected={[]}
        onChange={() => {}}
        context={{ gender: "Male" }}
      />,
    );
    expect(screen.getByText("(1 of 2 tiers)")).toBeInTheDocument();
  });

  it("links a checkbox to its detail text", () => {
    render(
      <BenchmarkChecklist {...ctxProps} renderDetail={(r) => <span>detail {r.id}</span>} />,
    );
    expect(screen.getByLabelText("Elite Male")).toHaveAccessibleDescription("detail a");
  });
});
