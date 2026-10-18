import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BenchmarkSetCombobox } from "./BenchmarkSetCombobox";

const SETS = [
  { id: "s1", organizationId: null, name: "Elite", sport: "SOCCER", level: "D1", gender: "Female", description: null },
  { id: "s2", organizationId: "org1", name: "Elite", sport: "SOCCER", level: "HS", gender: "Male", description: null },
  { id: "s3", organizationId: null, name: "Power", sport: "VOLLEYBALL", level: "D1", gender: null, description: "jump focus" },
];

const api = vi.hoisted(() => ({ failed: false }));
vi.mock("@/lib/benchmark-sets-api", () => ({
  useBenchmarkSets: () =>
    api.failed ? { data: undefined, isLoading: false, error: new Error("boom") } : { data: SETS, isLoading: false, error: null },
}));
vi.mock("@/lib/sports-api", () => ({
  useSports: () => ({
    data: [
      { code: "SOCCER", name: "Soccer" },
      { code: "VOLLEYBALL", name: "Volleyball" },
    ],
  }),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
  Element.prototype.scrollIntoView ??= () => {};
});

async function open(props: Partial<React.ComponentProps<typeof BenchmarkSetCombobox>> = {}) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<BenchmarkSetCombobox organizationId="org1" value={null} onChange={onChange} {...props} />);
  await user.click(screen.getByRole("combobox"));
  return { user, onChange };
}

const options = () => screen.queryAllByRole("option");

describe("BenchmarkSetCombobox", () => {
  it("pressing Enter on a chip toggles it and does not select a set", async () => {
    const { user, onChange } = await open();
    const chip = screen.getByRole("button", { name: "Female" });
    chip.focus();
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("says so when the sets fail to load", async () => {
    api.failed = true;
    try {
      await open();
      expect(screen.getByText(/failed to load sets/i)).toBeInTheDocument();
    } finally {
      api.failed = false;
    }
  });

  it("lists every set grouped under its sport name", async () => {
    await open();
    expect(options()).toHaveLength(3);
    const headings = [...document.querySelectorAll("[cmdk-group-heading]")].map((h) => h.textContent);
    expect(headings).toEqual(["Soccer", "Volleyball"]);
  });

  it("finds a set by its sport name, not just the set name", async () => {
    const { user } = await open();
    await user.type(screen.getByPlaceholderText(/search/i), "volleyball");
    expect(options()).toHaveLength(1);
    expect(options()[0]).toHaveTextContent("Power");
  });

  it("selects the right set when a site and an org set share a name", async () => {
    const { user, onChange } = await open();
    await user.click(screen.getByRole("button", { name: "HS" }));
    await user.click(options()[0]);
    expect(onChange).toHaveBeenCalledWith("s2");
  });

  it("narrows with chips: OR within a type, AND across types, null gender stays", async () => {
    const { user } = await open();
    const chips = screen.getByRole("group", { name: /filter/i });
    await user.click(within(chips).getByRole("button", { name: "Female" }));
    // s1 (Female) and s3 (null gender); not s2 (Male)
    expect(options().map((o) => o.textContent)).toEqual([
      expect.stringContaining("Elite"),
      expect.stringContaining("Power"),
    ]);
    await user.click(within(chips).getByRole("button", { name: "Soccer" }));
    expect(options()).toHaveLength(1);
    expect(within(chips).getByRole("button", { name: "Female" })).toHaveAttribute("aria-pressed", "true");
  });

  it("starts with chips from context and Clear filters removes them", async () => {
    const { user } = await open({ context: { sports: ["SOCCER"], gender: "Male" } });
    expect(options()).toHaveLength(1);
    expect(options()[0]).toHaveTextContent("Elite");
    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(options()).toHaveLength(3);
  });

  it("ignores context values that match no set", async () => {
    await open({ context: { sports: ["HOCKEY"], gender: "all" } });
    expect(options()).toHaveLength(3);
  });
});
