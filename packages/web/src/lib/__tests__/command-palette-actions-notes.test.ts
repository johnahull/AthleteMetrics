import { describe, it, expect, vi } from "vitest";
import { getCommandActions } from "../command-palette-actions";

describe("Add Coaching Note palette action", () => {
  it("is listed only when the opener is supplied, gated like the other coach actions", () => {
    expect(getCommandActions(vi.fn()).some((a) => a.id === "add-coaching-note")).toBe(false);

    const open = vi.fn();
    const action = getCommandActions(vi.fn(), open).find((a) => a.id === "add-coaching-note");
    expect(action).toMatchObject({ title: "Add Coaching Note", permission: "CREATE_MEASUREMENTS" });
    action!.action();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
