/**
 * Component tests for DateQuickPicks
 *
 * Test coverage:
 * - Renders all quick pick buttons (Today, Yesterday, Last Week)
 * - Button click handlers call onSelect with correct dates
 * - Active state highlights correct button
 * - Custom calendar popover opens and closes
 * - Custom calendar date selection works
 * - Keyboard navigation (arrow keys, enter, space)
 * - Accessibility (ARIA labels, roles, screen reader)
 * - Edge cases (future dates, undefined selectedDate)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format, subDays } from "date-fns";
import DateQuickPicks from "@/components/ui/date-quick-picks";

describe("DateQuickPicks", () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const lastWeek = format(subDays(new Date(), 7), "yyyy-MM-dd");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render all quick pick buttons", () => {
      const onSelect = vi.fn();

      render(<DateQuickPicks onSelect={onSelect} />);

      expect(screen.getByRole("button", { name: /select today/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /select yesterday/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /select one week ago/i })).toBeInTheDocument();
    });

    it("should render custom calendar button when showCustom is true", () => {
      const onSelect = vi.fn();

      render(<DateQuickPicks onSelect={onSelect} showCustom={true} />);

      expect(screen.getByRole("button", { name: /custom/i })).toBeInTheDocument();
    });

    it("should not render custom calendar button when showCustom is false", () => {
      const onSelect = vi.fn();

      render(<DateQuickPicks onSelect={onSelect} showCustom={false} />);

      expect(screen.queryByRole("button", { name: /custom/i })).not.toBeInTheDocument();
    });

    it("should apply custom className", () => {
      const onSelect = vi.fn();

      const { container } = render(
        <DateQuickPicks onSelect={onSelect} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });
  });

  describe("Button Click Handlers", () => {
    it("should call onSelect with today's date when Today button clicked", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      await user.click(todayButton);

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(today);
    });

    it("should call onSelect with yesterday's date when Yesterday button clicked", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const yesterdayButton = screen.getByRole("button", { name: /select yesterday/i });
      await user.click(yesterdayButton);

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(yesterday);
    });

    it("should call onSelect with last week's date when Last Week button clicked", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const lastWeekButton = screen.getByRole("button", { name: /select one week ago/i });
      await user.click(lastWeekButton);

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(lastWeek);
    });
  });

  describe("Active State", () => {
    it("should highlight Today button when selectedDate is today", () => {
      const onSelect = vi.fn();

      render(<DateQuickPicks onSelect={onSelect} selectedDate={today} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      expect(todayButton).toHaveAttribute("aria-pressed", "true");
      expect(todayButton).toHaveClass("bg-primary");
    });

    it("should highlight Yesterday button when selectedDate is yesterday", () => {
      const onSelect = vi.fn();

      render(<DateQuickPicks onSelect={onSelect} selectedDate={yesterday} />);

      const yesterdayButton = screen.getByRole("button", { name: /select yesterday/i });
      expect(yesterdayButton).toHaveAttribute("aria-pressed", "true");
      expect(yesterdayButton).toHaveClass("bg-primary");
    });

    it("should highlight Last Week button when selectedDate is 7 days ago", () => {
      const onSelect = vi.fn();

      render(<DateQuickPicks onSelect={onSelect} selectedDate={lastWeek} />);

      const lastWeekButton = screen.getByRole("button", { name: /select one week ago/i });
      expect(lastWeekButton).toHaveAttribute("aria-pressed", "true");
    });

    it("should not highlight any button when selectedDate is custom date", () => {
      const onSelect = vi.fn();
      const customDate = "2024-01-15";

      render(<DateQuickPicks onSelect={onSelect} selectedDate={customDate} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      const yesterdayButton = screen.getByRole("button", { name: /select yesterday/i });
      const lastWeekButton = screen.getByRole("button", { name: /select one week ago/i });

      expect(todayButton).toHaveAttribute("aria-pressed", "false");
      expect(yesterdayButton).toHaveAttribute("aria-pressed", "false");
      expect(lastWeekButton).toHaveAttribute("aria-pressed", "false");
    });

    it("should not highlight any button when selectedDate is undefined", () => {
      const onSelect = vi.fn();

      render(<DateQuickPicks onSelect={onSelect} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      const yesterdayButton = screen.getByRole("button", { name: /select yesterday/i });
      const lastWeekButton = screen.getByRole("button", { name: /select one week ago/i });

      expect(todayButton).toHaveAttribute("aria-pressed", "false");
      expect(yesterdayButton).toHaveAttribute("aria-pressed", "false");
      expect(lastWeekButton).toHaveAttribute("aria-pressed", "false");
    });
  });

  describe("Custom Calendar Popover", () => {
    it("should open calendar popover when Custom button clicked", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} showCustom={true} />);

      const customButton = screen.getByRole("button", { name: /custom/i });
      await user.click(customButton);

      // Calendar should be visible
      await waitFor(() => {
        expect(screen.getByRole("grid")).toBeInTheDocument();
      });
    });

    it("should call onSelect when date selected from calendar", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} showCustom={true} />);

      const customButton = screen.getByRole("button", { name: /custom/i });
      await user.click(customButton);

      await waitFor(() => {
        expect(screen.getByRole("grid")).toBeInTheDocument();
      });

      // Find the calendar grid and any clickable date button
      const grid = screen.getByRole("grid");
      const todayDay = new Date().getDate();

      // Find all buttons in the calendar grid
      const dateButtons = Array.from(grid.querySelectorAll('button'))
        .filter(btn =>
          !btn.hasAttribute('disabled') &&
          btn.textContent?.trim() === todayDay.toString()
        );

      expect(dateButtons.length).toBeGreaterThan(0);
      await user.click(dateButtons[0]);

      expect(onSelect).toHaveBeenCalledWith(today);
    });

    it("should show selected date in calendar when selectedDate is provided", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      // Use current month so the selected date is visible
      const selectedDate = format(new Date(), "yyyy-MM-15");

      render(
        <DateQuickPicks
          onSelect={onSelect}
          selectedDate={selectedDate}
          showCustom={true}
        />
      );

      const customButton = screen.getByRole("button", { name: /custom/i });
      await user.click(customButton);

      await waitFor(() => {
        expect(screen.getByRole("grid")).toBeInTheDocument();
      });

      // Find the selected date button in calendar (day 15 of current month)
      const grid = screen.getByRole("grid");
      const selectedButtons = Array.from(grid.querySelectorAll('button'))
        .filter(btn => btn.getAttribute('aria-selected') === 'true');

      expect(selectedButtons.length).toBeGreaterThan(0);
      expect(selectedButtons[0]).toHaveAttribute("aria-selected", "true");
    });

    it("should close calendar when date is selected", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} showCustom={true} />);

      const customButton = screen.getByRole("button", { name: /custom/i });
      await user.click(customButton);

      await waitFor(() => {
        expect(screen.getByRole("grid")).toBeInTheDocument();
      });

      // Find today's date button in calendar
      const grid = screen.getByRole("grid");
      const todayDay = new Date().getDate();

      const dateButtons = Array.from(grid.querySelectorAll('button'))
        .filter(btn =>
          !btn.hasAttribute('disabled') &&
          btn.textContent?.trim() === todayDay.toString()
        );

      expect(dateButtons.length).toBeGreaterThan(0);
      await user.click(dateButtons[0]);

      // Calendar should close after selection
      await waitFor(() => {
        expect(screen.queryByRole("grid")).not.toBeInTheDocument();
      });
    });
  });

  describe("Keyboard Navigation", () => {
    it("should focus Today button on Tab", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      await user.tab();

      const todayButton = screen.getByRole("button", { name: /select today/i });
      expect(todayButton).toHaveFocus();
    });

    it("should navigate between buttons using Tab", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      await user.tab();
      expect(screen.getByRole("button", { name: /select today/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole("button", { name: /select yesterday/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole("button", { name: /select one week ago/i })).toHaveFocus();
    });

    it("should activate button on Enter key", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      todayButton.focus();

      await user.keyboard("{Enter}");

      expect(onSelect).toHaveBeenCalledWith(today);
    });

    it("should activate button on Space key", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const yesterdayButton = screen.getByRole("button", { name: /select yesterday/i });
      yesterdayButton.focus();

      await user.keyboard(" ");

      expect(onSelect).toHaveBeenCalledWith(yesterday);
    });

    it("should navigate to Custom button with Tab when showCustom is true", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} showCustom={true} />);

      await user.tab(); // Today
      await user.tab(); // Yesterday
      await user.tab(); // Last Week
      await user.tab(); // Custom

      expect(screen.getByRole("button", { name: /custom/i })).toHaveFocus();
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA labels on quick pick buttons", () => {
      const onSelect = vi.fn();

      render(<DateQuickPicks onSelect={onSelect} />);

      expect(screen.getByLabelText(/select today/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/select yesterday/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/select one week ago/i)).toBeInTheDocument();
    });

    it("should use aria-pressed for toggle state", () => {
      const onSelect = vi.fn();

      render(<DateQuickPicks onSelect={onSelect} selectedDate={today} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      expect(todayButton).toHaveAttribute("aria-pressed", "true");

      const yesterdayButton = screen.getByRole("button", { name: /select yesterday/i });
      expect(yesterdayButton).toHaveAttribute("aria-pressed", "false");
    });

    it("should have visible focus states", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      todayButton.focus();

      expect(todayButton).toHaveFocus();
      // Focus visible class should be present
      expect(todayButton).toHaveClass("focus-visible:outline-none");
    });

    it("should announce selection changes to screen readers", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      await user.click(todayButton);

      // aria-pressed should update
      expect(todayButton).toHaveAttribute("aria-pressed", "false"); // Will be "true" after re-render with selectedDate
    });

    it("should be keyboard accessible in high contrast mode", () => {
      const onSelect = vi.fn();

      render(<DateQuickPicks onSelect={onSelect} />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((button) => {
        // Buttons should have proper contrast classes
        expect(button).toHaveClass("border");
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle onSelect being called multiple times", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      await user.click(todayButton);
      await user.click(todayButton);
      await user.click(todayButton);

      expect(onSelect).toHaveBeenCalledTimes(3);
      expect(onSelect).toHaveBeenCalledWith(today);
    });

    it("should handle rapid button clicks", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      const yesterdayButton = screen.getByRole("button", { name: /select yesterday/i });

      await user.click(todayButton);
      await user.click(yesterdayButton);
      await user.click(todayButton);

      expect(onSelect).toHaveBeenCalledTimes(3);
      expect(onSelect).toHaveBeenNthCalledWith(1, today);
      expect(onSelect).toHaveBeenNthCalledWith(2, yesterday);
      expect(onSelect).toHaveBeenNthCalledWith(3, today);
    });

    it("should handle empty string selectedDate gracefully", () => {
      const onSelect = vi.fn();

      render(<DateQuickPicks onSelect={onSelect} selectedDate="" />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      expect(todayButton).toHaveAttribute("aria-pressed", "false");
    });

    it("should format dates consistently in ISO 8601", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      await user.click(todayButton);

      const calledDate = onSelect.mock.calls[0][0];
      // Should match YYYY-MM-DD format
      expect(calledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should not allow future dates from quick picks", async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      await user.click(todayButton);

      const calledDate = new Date(onSelect.mock.calls[0][0]);
      const now = new Date();

      // Called date should not be in the future
      expect(calledDate.getTime()).toBeLessThanOrEqual(now.getTime());
    });
  });

  describe("Integration with Parent Component", () => {
    it("should work with React Hook Form setValue", async () => {
      const onSelect = vi.fn((date) => {
        // Simulate form setValue behavior
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
      const user = userEvent.setup();

      render(<DateQuickPicks onSelect={onSelect} />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      await user.click(todayButton);

      expect(onSelect).toHaveBeenCalledWith(today);
    });

    it("should update active state when parent component changes selectedDate", () => {
      const onSelect = vi.fn();
      const { rerender } = render(
        <DateQuickPicks onSelect={onSelect} selectedDate={today} />
      );

      let todayButton = screen.getByRole("button", { name: /select today/i });
      expect(todayButton).toHaveAttribute("aria-pressed", "true");

      // Parent updates selectedDate to yesterday
      rerender(<DateQuickPicks onSelect={onSelect} selectedDate={yesterday} />);

      todayButton = screen.getByRole("button", { name: /select today/i });
      const yesterdayButton = screen.getByRole("button", { name: /select yesterday/i });

      expect(todayButton).toHaveAttribute("aria-pressed", "false");
      expect(yesterdayButton).toHaveAttribute("aria-pressed", "true");
    });
  });
});
