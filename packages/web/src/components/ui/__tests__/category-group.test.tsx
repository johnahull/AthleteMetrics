import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryGroup, CategoryGroupToggle } from "../category-group";

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <CategoryGroup id="speed" title="Speed" count={3} unit="metric" open={open} onOpenChange={setOpen}>
      <p>group body</p>
    </CategoryGroup>
  );
}

describe("CategoryGroup", () => {
  it("exposes the title and count in the toggle's accessible name", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Speed, 3 metrics" })).toBeInTheDocument();
  });

  it("uses singular unit wording for a count of one", () => {
    render(
      <CategoryGroup id="x" title="Power" count={1} unit="benchmark" open onOpenChange={() => {}}>
        <p>body</p>
      </CategoryGroup>,
    );
    expect(screen.getByRole("button", { name: "Power, 1 benchmark" })).toBeInTheDocument();
  });

  it("wraps the toggle in a heading", () => {
    render(<Harness />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toContainElement(screen.getByRole("button", { name: "Speed, 3 metrics" }));
  });

  it("shows content and aria-expanded=true when open", () => {
    render(<Harness />);
    expect(screen.getByText("group body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Speed/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("removes content and sets aria-expanded=false after the toggle is clicked", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /Speed/ }));
    expect(screen.queryByText("group body")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Speed/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("reopens on a second click", async () => {
    render(<Harness initialOpen={false} />);
    expect(screen.queryByText("group body")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Speed/ }));
    expect(screen.getByText("group body")).toBeInTheDocument();
  });
});

describe("CategoryGroupToggle", () => {
  it("reports clicks and links to the controlled region", async () => {
    let clicked = 0;
    render(
      <CategoryGroupToggle
        title="Agility"
        count={2}
        unit="metric"
        open={false}
        controlsId="rows-agility"
        onToggle={() => clicked++}
      />,
    );
    const button = screen.getByRole("button", { name: "Agility, 2 metrics" });
    expect(button).toHaveAttribute("aria-controls", "rows-agility");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(clicked).toBe(1);
  });
});
