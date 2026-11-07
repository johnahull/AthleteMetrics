import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartChoices } from "../ChartChoices";
import { chartItems } from "../chart-items";

const labels = { team: "Team", teams: "Teams", athlete: "Athlete", athletes: "Athletes" } as Parameters<typeof chartItems>[1];

describe("chartItems", () => {
  it("offers boxSwarm for team and distribution for individual, never the other way round", () => {
    const team = chartItems("team", labels, false).map(([k]) => k);
    const individual = chartItems("individual", labels, false).map(([k]) => k);
    expect(team).toContain("boxSwarm");
    expect(team).not.toContain("distribution");
    expect(individual).toContain("distribution");
    expect(individual).not.toContain("boxSwarm");
  });

  it("offers fvProfile only when sprint-FV is enabled", () => {
    expect(chartItems("individual", labels, false).map(([k]) => k)).not.toContain("fvProfile");
    expect(chartItems("individual", labels, true).map(([k]) => k)).toContain("fvProfile");
  });
});

describe("ChartChoices", () => {
  const items = chartItems("individual", labels, false);

  it("keeps the default chart-<key> ids without a prefix and prefixes them when asked", () => {
    const { container, rerender } = render(<ChartChoices items={items} value={{}} onChange={() => {}} />);
    expect(container.querySelector("#chart-trends")).not.toBeNull();
    rerender(<ChartChoices items={items} value={{}} onChange={() => {}} idPrefix="team" />);
    expect(container.querySelector("#chart-trends")).toBeNull();
    expect(container.querySelector("#team-chart-trends")).not.toBeNull();
  });

  it("treats a missing key as checked and reports changes", async () => {
    const onChange = vi.fn();
    render(<ChartChoices items={items} value={{ trends: false }} onChange={onChange} />);
    expect(screen.getByRole("checkbox", { name: /Progress over time/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Benchmark standing/ })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: /Progress over time/ }));
    expect(onChange).toHaveBeenCalledWith("trends", true);
  });

  it("shows a disabled chart unchecked and unclickable; without isDisabled everything is editable", () => {
    const { rerender } = render(
      <ChartChoices items={items} value={{ radar: true }} onChange={() => {}} isDisabled={(k) => k === "radar"} />,
    );
    const radar = screen.getByRole("checkbox", { name: /radar/ });
    expect(radar).toBeDisabled();
    expect(radar).not.toBeChecked();
    rerender(<ChartChoices items={items} value={{ radar: true }} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: /radar/ })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /radar/ })).toBeChecked();
  });
});
