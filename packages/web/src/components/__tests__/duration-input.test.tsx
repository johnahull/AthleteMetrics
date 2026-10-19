import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DurationInput, durationTypoWarning } from "@/components/duration-input";

describe("durationTypoWarning", () => {
  it("suggests m:ss for a plain number that looks like minutes.seconds", () => {
    expect(durationTypoWarning("6.42")).toBe("Did you mean 6:42? A plain number is read as seconds.");
  });
  it("warns for any other plain number under 60 seconds", () => {
    expect(durationTypoWarning("42")).toBe("42 is read as 42 seconds (0:42.0). For minutes, type m:ss, e.g. 6:42.");
    expect(durationTypoWarning("6.5")).toBe("6.5 is read as 6.5 seconds (0:06.5). For minutes, type m:ss, e.g. 6:42.");
  });
  it("does not warn for m:ss, for 60 s and over, or for empty or invalid text", () => {
    expect(durationTypoWarning("6:42")).toBeNull();
    expect(durationTypoWarning("402.5")).toBeNull();
    expect(durationTypoWarning("60")).toBeNull();
    expect(durationTypoWarning("")).toBeNull();
    expect(durationTypoWarning("abc")).toBeNull();
  });
  it("does not suggest an impossible m:ss", () => {
    expect(durationTypoWarning("6.75")).toBe("6.75 is read as 6.75 seconds (0:06.8). For minutes, type m:ss, e.g. 6:42.");
  });
});

function Harness({ initial, onValue }: { initial?: number; onValue: (n: number | undefined) => void }) {
  const [value, setValue] = useState<number | undefined>(initial);
  return (
    <>
      <DurationInput
        value={value}
        onValueChange={(n) => {
          setValue(n);
          onValue(n);
        }}
        data-testid="dur"
      />
      <button type="button" onClick={() => setValue(undefined)}>clear</button>
      <button type="button" onClick={() => setValue(435)}>set</button>
    </>
  );
}

describe("DurationInput", () => {
  it("is a text input with the full keyboard (decimal keypad has no colon)", () => {
    render(<Harness onValue={() => {}} />);
    const input = screen.getByTestId("dur");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputMode", "text");
  });

  it("emits seconds for m:ss and plain seconds", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId("dur"), "6:42.5");
    expect(onValue).toHaveBeenLastCalledWith(402.5);
    await user.clear(screen.getByTestId("dur"));
    await user.type(screen.getByTestId("dur"), "402.5");
    expect(onValue).toHaveBeenLastCalledWith(402.5);
  });

  it("emits undefined (not 0) for empty or invalid text, and explains invalid text after blur", async () => {
    const onValue = vi.fn();
    render(<Harness initial={402.5} onValue={onValue} />);
    const user = userEvent.setup();
    await user.clear(screen.getByTestId("dur"));
    expect(onValue).toHaveBeenLastCalledWith(undefined);
    await user.type(screen.getByTestId("dur"), "6:60");
    expect(onValue).toHaveBeenLastCalledWith(undefined);
    await user.tab();
    expect(screen.getByText("Enter a time as m:ss, e.g. 6:42.5")).toBeInTheDocument();
  });

  it("shows the typo warning without blocking the value", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId("dur"), "6.42");
    expect(onValue).toHaveBeenLastCalledWith(6.42);
    expect(screen.getByText("Did you mean 6:42? A plain number is read as seconds.")).toBeInTheDocument();
  });

  it("shows an incoming value as m:ss and follows outside changes", async () => {
    render(<Harness initial={402.5} onValue={() => {}} />);
    expect(screen.getByTestId("dur")).toHaveValue("6:42.5");
    const user = userEvent.setup();
    await user.click(screen.getByText("set"));
    expect(screen.getByTestId("dur")).toHaveValue("7:15");
    await user.click(screen.getByText("clear"));
    expect(screen.getByTestId("dur")).toHaveValue("");
  });

  it("shows 0 (a reset form) as empty", () => {
    render(<Harness initial={0} onValue={() => {}} />);
    expect(screen.getByTestId("dur")).toHaveValue("");
  });
});
