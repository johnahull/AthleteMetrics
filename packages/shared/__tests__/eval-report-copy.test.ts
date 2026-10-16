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

describe("formatValue with a duration display format", () => {
  it("prints seconds as mm:ss", () => {
    expect(formatValue(402.5, "s", "duration")).toBe("6:42.5");
  });

  it("is unchanged when the format is decimal or missing", () => {
    expect(formatValue(402.5, "s", "decimal")).toBe("402.50 s");
    expect(formatValue(402.5, "s")).toBe("402.50 s");
  });
});
