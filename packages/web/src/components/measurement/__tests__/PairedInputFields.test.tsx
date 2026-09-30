/**
 * Regression tests for PairedInputFields, covering two issues raised by
 * automated code review on PR #397 that were never fixed before merge:
 *
 * 1. The auxiliary (reps) input had no NaN guard — pasting non-numeric text
 *    produced `NaN`, which `typeof NaN === "number"` let slip past the
 *    "is this a number" checks and land in the highest guardrail tier
 *    ("block"), showing the redirect prompt for what should be an ignored
 *    bad paste.
 * 2. `switchTargetCode` defaulted any metric that wasn't bench/OHP/push to
 *    "PULLUPS_MAX" — so SQUAT_1RM/DEADLIFT_1RM (lower-body lifts) redirected
 *    to a bodyweight pull-up count, which is semantically wrong.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { PairedInputFields } from "@/components/measurement/PairedInputFields";
import type { AuxiliaryInputConfig } from "@/hooks/use-available-metrics";

// PairedInputFields fetches a live preview via apiRequest on every keystroke.
// Not relevant to these tests — stub it out so the debounced effect resolves
// quietly instead of hitting the network.
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn().mockResolvedValue({
    json: async () => ({
      computedValue: 0,
      formula: "load * (1 + reps / 30)",
      primaryUnit: "lbs",
      auxiliaryLabel: "Reps",
    }),
  }),
}));

const REPS_CONFIG: AuxiliaryInputConfig = {
  label: "Reps",
  unit: "reps",
  validationMin: 1,
  validationMax: 15,
  required: true,
  computeFormula: "load * (1 + reps / 30)",
  primaryInputLabel: "Weight Lifted",
  primaryInputUnit: "lbs",
};

function TestHost({
  metricCode,
  onMetricSwitch,
}: {
  metricCode: string;
  onMetricSwitch?: (code: string) => void;
}) {
  const form = useForm<{ value: number; auxiliaryValue: number | null | undefined }>({
    defaultValues: { value: 315, auxiliaryValue: undefined },
  });

  return (
    <Form {...form}>
      <form>
        <PairedInputFields
          metricCode={metricCode}
          config={REPS_CONFIG}
          onMetricSwitch={onMetricSwitch}
        />
      </form>
    </Form>
  );
}

describe("PairedInputFields — auxiliary input NaN guard", () => {
  it("ignores a value the browser accepts as a number but parseInt cannot parse", () => {
    render(<TestHost metricCode="BENCH_1RM" />);

    const auxInput = screen.getByTestId("paired-auxiliary-input") as HTMLInputElement;

    // ".5" is a value a browser's type="number" input treats as valid (it
    // isn't stripped like "abc" would be), but `parseInt(".5", 10)` returns
    // NaN. `typeof NaN === "number"` is true, so an unguarded parseInt lets
    // NaN slip through the "is this a number" checks straight into the
    // highest guardrail tier.
    fireEvent.change(auxInput, { target: { value: ".5" } });

    // A NaN value must not be treated as a valid rep count — the redirect
    // ("block" tier) prompt should not appear for an unparseable value.
    expect(screen.queryByTestId("reps-redirect-prompt")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reps-warn-chip")).not.toBeInTheDocument();
  });

  it("still accepts a valid numeric rep count", () => {
    render(<TestHost metricCode="BENCH_1RM" />);

    const auxInput = screen.getByTestId("paired-auxiliary-input") as HTMLInputElement;
    fireEvent.change(auxInput, { target: { value: "5" } });

    expect(auxInput.value).toBe("5");
  });
});

describe("PairedInputFields — redirect target for high-rep sets", () => {
  function triggerBlockTier(metricCode: string, onMetricSwitch?: (code: string) => void) {
    render(<TestHost metricCode={metricCode} onMetricSwitch={onMetricSwitch} />);
    const auxInput = screen.getByTestId("paired-auxiliary-input") as HTMLInputElement;
    fireEvent.change(auxInput, { target: { value: "20" } });
  }

  it("redirects a bench-press metric to PUSHUPS_MAX", () => {
    const onMetricSwitch = vi.fn();
    triggerBlockTier("BENCH_1RM", onMetricSwitch);

    const button = screen.getByTestId("reps-redirect-button");
    fireEvent.click(button);
    expect(onMetricSwitch).toHaveBeenCalledWith("PUSHUPS_MAX");
  });

  it("does not redirect a squat metric to an unrelated bodyweight exercise", () => {
    triggerBlockTier("SQUAT_1RM", vi.fn());

    // There is no sensible bodyweight-count equivalent for a squat 1RM, so
    // the component must not offer a misleading redirect (previously
    // defaulted to PULLUPS_MAX for anything that wasn't bench/OHP/push).
    expect(screen.queryByTestId("reps-redirect-button")).not.toBeInTheDocument();
  });

  it("does not redirect a deadlift metric to an unrelated bodyweight exercise", () => {
    triggerBlockTier("DEADLIFT_1RM", vi.fn());

    expect(screen.queryByTestId("reps-redirect-button")).not.toBeInTheDocument();
  });
});
