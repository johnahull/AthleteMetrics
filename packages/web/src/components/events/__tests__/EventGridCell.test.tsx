import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventGridCell, type EventGridCellValue } from "../EventGridCell";

const renderCell = (cell: Partial<EventGridCellValue>) =>
  render(
    <EventGridCell
      cell={{ value: "", savedCount: 0, isDirty: false, ...cell }}
      cellKey="u1-m1"
      metricLabel="1KM Run"
      athleteName="Ann"
      isRequired={false}
      disabled={false}
      onChange={() => {}}
      onResolve={() => {}}
    />
  );

describe("EventGridCell keyboard", () => {
  it("uses the full keyboard for a time metric so m:ss can be typed", () => {
    renderCell({ isDuration: true });
    expect(screen.getByLabelText("1KM Run for Ann")).toHaveAttribute("inputMode", "text");
  });

  it("uses the decimal keypad for other metrics", () => {
    renderCell({});
    expect(screen.getByLabelText("1KM Run for Ann")).toHaveAttribute("inputMode", "decimal");
  });
});
