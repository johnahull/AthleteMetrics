import { describe, it, expect } from "vitest";
import { formatValue } from "../eval-report-copy";

describe("formatValue (shared by the PDF and the web view)", () => {
  it("always shows two decimals for seconds", () => {
    expect(formatValue(1.9, "s")).toBe("1.90 s");
    expect(formatValue(2, "s")).toBe("2.00 s");
    expect(formatValue(1.85, "s")).toBe("1.85 s");
  });

  it("trims other units to at most two decimals", () => {
    expect(formatValue(18.2, "in")).toBe("18.2 in");
    expect(formatValue(17, "mph")).toBe("17 mph");
    expect(formatValue(92.345, "%")).toBe("92.35%");
  });
});
