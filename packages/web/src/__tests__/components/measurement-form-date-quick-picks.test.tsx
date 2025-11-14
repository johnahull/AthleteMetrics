/**
 * Integration tests for DateQuickPicks with React Hook Form
 *
 * Test coverage:
 * - Quick picks integrate with React Hook Form
 * - Selected date appears in form input
 * - Form validation works with quick picks
 * - Custom calendar selection works in form context
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format, subDays } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DateQuickPicks from "@/components/ui/date-quick-picks";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Test form schema
const testFormSchema = z.object({
  date: z.string().min(1, "Date is required"),
  name: z.string().min(1, "Name is required"),
});

type TestFormValues = z.infer<typeof testFormSchema>;

// Test form component
function TestForm() {
  const form = useForm<TestFormValues>({
    resolver: zodResolver(testFormSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      name: "",
    },
  });

  const onSubmit = vi.fn((data: TestFormValues) => {
    console.log("Form submitted:", data);
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} data-testid="test-form">
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Test Date</FormLabel>
              <DateQuickPicks
                onSelect={(date) => field.onChange(date)}
                selectedDate={field.value}
                showCustom={true}
                className="mb-2"
              />
              <FormControl>
                <Input
                  {...field}
                  type="date"
                  data-testid="date-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} data-testid="name-input" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" data-testid="submit-button">
          Submit
        </Button>
      </form>
    </Form>
  );
}

describe("DateQuickPicks - React Hook Form Integration", () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const lastWeek = format(subDays(new Date(), 7), "yyyy-MM-dd");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Quick Pick Button Integration", () => {
    it("should render date quick picks above date input", () => {
      render(<TestForm />);

      expect(screen.getByRole("button", { name: /select today/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /select yesterday/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /select one week ago/i })).toBeInTheDocument();
      expect(screen.getByTestId("date-input")).toBeInTheDocument();
    });

    it("should update form date input when Today button clicked", async () => {
      const user = userEvent.setup();

      render(<TestForm />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      await user.click(todayButton);

      const dateInput = screen.getByTestId("date-input") as HTMLInputElement;
      expect(dateInput.value).toBe(today);
    });

    it("should update form date input when Yesterday button clicked", async () => {
      const user = userEvent.setup();

      render(<TestForm />);

      const yesterdayButton = screen.getByRole("button", { name: /select yesterday/i });
      await user.click(yesterdayButton);

      const dateInput = screen.getByTestId("date-input") as HTMLInputElement;
      expect(dateInput.value).toBe(yesterday);
    });

    it("should update form date input when Last Week button clicked", async () => {
      const user = userEvent.setup();

      render(<TestForm />);

      const lastWeekButton = screen.getByRole("button", { name: /select one week ago/i });
      await user.click(lastWeekButton);

      const dateInput = screen.getByTestId("date-input") as HTMLInputElement;
      expect(dateInput.value).toBe(lastWeek);
    });

    it("should highlight active quick pick button based on form date", async () => {
      const user = userEvent.setup();

      render(<TestForm />);

      // Form defaults to today, so today button should be pressed
      const todayButton = screen.getByRole("button", { name: /select today/i });
      expect(todayButton).toHaveAttribute("aria-pressed", "true");

      // Click yesterday
      const yesterdayButton = screen.getByRole("button", { name: /select yesterday/i });
      await user.click(yesterdayButton);

      // Yesterday should be pressed, today should not
      await waitFor(() => {
        expect(yesterdayButton).toHaveAttribute("aria-pressed", "true");
        expect(todayButton).toHaveAttribute("aria-pressed", "false");
      });
    });
  });

  describe("Custom Calendar Integration", () => {
    it("should open custom calendar when Custom button clicked", async () => {
      const user = userEvent.setup();

      render(<TestForm />);

      const customButton = screen.getByRole("button", { name: /custom/i });
      await user.click(customButton);

      await waitFor(() => {
        expect(screen.getByRole("grid")).toBeInTheDocument();
      });
    });

    it("should update form date when date selected from custom calendar", async () => {
      const user = userEvent.setup();

      render(<TestForm />);

      const customButton = screen.getByRole("button", { name: /custom/i });
      await user.click(customButton);

      await waitFor(() => {
        expect(screen.getByRole("grid")).toBeInTheDocument();
      });

      // Click on a date in the calendar
      const grid = screen.getByRole("grid");
      const todayDay = new Date().getDate();
      const dateButtons = Array.from(grid.querySelectorAll("button")).filter(
        (btn) =>
          !btn.hasAttribute("disabled") &&
          btn.textContent?.trim() === todayDay.toString()
      );

      expect(dateButtons.length).toBeGreaterThan(0);
      await user.click(dateButtons[0]);

      // Verify date input updated
      const dateInput = screen.getByTestId("date-input") as HTMLInputElement;
      expect(dateInput.value).toBe(today);
    });

    it.skip("should close calendar after date selection", async () => {
      const user = userEvent.setup();

      render(<TestForm />);

      const customButton = screen.getByRole("button", { name: /custom/i });
      await user.click(customButton);

      await waitFor(() => {
        expect(screen.getByRole("grid")).toBeInTheDocument();
      });

      const grid = screen.getByRole("grid");
      const todayDay = new Date().getDate();
      const dateButtons = Array.from(grid.querySelectorAll("button")).filter(
        (btn) =>
          !btn.hasAttribute("disabled") &&
          btn.textContent?.trim() === todayDay.toString()
      );

      await user.click(dateButtons[0]);

      // Calendar should close (with animation delay)
      await waitFor(() => {
        expect(screen.queryByRole("grid")).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe("Form Validation Integration", () => {
    it("should maintain quick pick selection through form validation", async () => {
      const user = userEvent.setup();

      render(<TestForm />);

      // Select yesterday
      const yesterdayButton = screen.getByRole("button", { name: /select yesterday/i });
      await user.click(yesterdayButton);

      // Verify form has the date
      const dateInput = screen.getByTestId("date-input") as HTMLInputElement;
      expect(dateInput.value).toBe(yesterday);

      // Try to submit form (will fail validation for missing name)
      const submitButton = screen.getByTestId("submit-button");
      await user.click(submitButton);

      // Date should still be yesterday after validation error
      await waitFor(() => {
        expect(dateInput.value).toBe(yesterday);
        expect(yesterdayButton).toHaveAttribute("aria-pressed", "true");
      });
    });

    it("should allow manual date input after quick pick selection", async () => {
      const user = userEvent.setup();

      render(<TestForm />);

      // Select today via quick pick (it's already today by default)
      const todayButton = screen.getByRole("button", { name: /select today/i });
      expect(todayButton).toHaveAttribute("aria-pressed", "true");

      const dateInput = screen.getByTestId("date-input") as HTMLInputElement;
      expect(dateInput.value).toBe(today);

      // Manually change date input
      const customDate = "2024-06-15";
      await user.clear(dateInput);
      await user.type(dateInput, customDate);

      // Form should have custom date
      await waitFor(() => {
        expect(dateInput.value).toBe(customDate);
      });

      // No quick pick button should be active
      expect(todayButton).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("button", { name: /select yesterday/i })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });
  });

  describe("Accessibility", () => {
    it("should maintain keyboard navigation flow from quick picks to date input", async () => {
      const user = userEvent.setup();

      render(<TestForm />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      todayButton.focus();
      expect(todayButton).toHaveFocus();

      // Activate with Enter
      await user.keyboard("{Enter}");

      const dateInput = screen.getByTestId("date-input") as HTMLInputElement;
      expect(dateInput.value).toBe(today);
    });

    it("should announce date changes to screen readers", async () => {
      const user = userEvent.setup();

      render(<TestForm />);

      const todayButton = screen.getByRole("button", { name: /select today/i });
      await user.click(todayButton);

      // Button should update aria-pressed
      await waitFor(() => {
        expect(todayButton).toHaveAttribute("aria-pressed", "true");
      });

      // Date input should be updated (screen readers will announce this)
      const dateInput = screen.getByTestId("date-input") as HTMLInputElement;
      expect(dateInput.value).toBe(today);
    });
  });
});
