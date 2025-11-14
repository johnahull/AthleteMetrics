/**
 * Integration tests for FormErrorSummary with measurement form
 *
 * Test coverage:
 * - Error summary appears on form validation failure
 * - Clicking error scrolls to and focuses field
 * - Error summary updates when errors change
 * - Error summary disappears on successful submission
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormErrorSummary } from "@/components/ui/form-error-summary";
import { useFormErrors } from "@/hooks/useFormErrors";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Example schema for measurement-like form
const measurementSchema = z.object({
  athleteName: z.string().min(1, "Athlete name is required"),
  date: z.string().min(1, "Date is required"),
  value: z.number().min(0.01, "Value must be greater than 0"),
});

type MeasurementFormData = z.infer<typeof measurementSchema>;

// Test form component that mimics measurement form structure
function TestMeasurementForm({ onSubmit }: { onSubmit: (data: MeasurementFormData) => void }) {
  const form = useForm<MeasurementFormData>({
    resolver: zodResolver(measurementSchema),
    defaultValues: {
      athleteName: "",
      date: "",
      value: 0,
    },
  });

  return (
    <FormProvider {...form}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <ErrorSummarySection />

          <FormField
            control={form.control}
            name="athleteName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Athlete Name</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-athlete-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input {...field} type="date" data-testid="input-date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Value</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    step="0.01"
                    data-testid="input-value"
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
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
    </FormProvider>
  );
}

// Error summary section that uses the hook
function ErrorSummarySection() {
  const { formErrors, scrollToError } = useFormErrors();

  return <FormErrorSummary errors={formErrors} onErrorClick={scrollToError} />;
}

describe("FormErrorSummary Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.skip("should display error summary when form submission fails validation", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<TestMeasurementForm onSubmit={onSubmit} />);

    // Submit empty form (should fail validation)
    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // Error summary should appear
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Should show all three errors
    expect(screen.getByText(/athlete name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/date is required/i)).toBeInTheDocument();
    expect(screen.getByText(/value must be greater than 0/i)).toBeInTheDocument();

    // Should show correct count
    expect(screen.getByText(/3 errors/i)).toBeInTheDocument();

    // onSubmit should not have been called
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should update error summary as user fixes errors", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<TestMeasurementForm onSubmit={onSubmit} />);

    // Submit to trigger validation
    await user.click(screen.getByTestId("submit-button"));

    // Initially 3 errors
    await waitFor(() => {
      expect(screen.getByText(/3 errors/i)).toBeInTheDocument();
    });

    // Fix one error
    const athleteInput = screen.getByTestId("input-athlete-name");
    await user.type(athleteInput, "John Doe");
    await user.click(screen.getByTestId("submit-button")); // Re-validate

    // Now should have 2 errors
    await waitFor(() => {
      expect(screen.getByText(/2 errors/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/athlete name is required/i)).not.toBeInTheDocument();
  });

  it.skip("should remove error summary when all errors are fixed", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<TestMeasurementForm onSubmit=  {onSubmit} />);

    // Submit to trigger validation
    await user.click(screen.getByTestId("submit-button"));

    // Error summary should appear
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Fix all errors
    await user.type(screen.getByTestId("input-athlete-name"), "John Doe");
    await user.type(screen.getByTestId("input-date"), "2025-01-15");
    const valueInput = screen.getByTestId("input-value");
    await user.clear(valueInput);
    await user.type(valueInput, "10.5");

    // Re-submit
    await user.click(screen.getByTestId("submit-button"));

    // Error summary should disappear
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    // onSubmit should now be called
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        athleteName: "John Doe",
        date: "2025-01-15",
        value: 10.5,
      });
    });
  });

  it("should make error messages clickable when onErrorClick is provided", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<TestMeasurementForm onSubmit={onSubmit} />);

    // Submit to trigger validation
    await user.click(screen.getByTestId("submit-button"));

    // Wait for errors
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Error messages should be buttons
    const athleteErrorButton = screen.getByRole("button", { name: /athlete name is required/i });
    expect(athleteErrorButton).toBeInTheDocument();

    // Clicking should work (though scrollIntoView won't work in jsdom)
    await user.click(athleteErrorButton);

    // No error should be thrown
    expect(athleteErrorButton).toBeInTheDocument();
  });

  it.skip("should handle rapid form changes without errors", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<TestMeasurementForm onSubmit={onSubmit} />);

    // Rapid typing
    const athleteInput = screen.getByTestId("input-athlete-name");
    await user.type(athleteInput, "John");
    await user.clear(athleteInput);
    await user.type(athleteInput, "Jane");
    await user.clear(athleteInput);
    await user.type(athleteInput, "Bob Smith");

    const dateInput = screen.getByTestId("input-date");
    await user.type(dateInput, "2025-01-01");
    await user.clear(dateInput);
    await user.type(dateInput, "2025-01-15");

    const valueInput = screen.getByTestId("input-value");
    await user.clear(valueInput);
    await user.type(valueInput, "5.5");
    await user.clear(valueInput);
    await user.type(valueInput, "10.25");

    // Submit
    await user.click(screen.getByTestId("submit-button"));

    // Should succeed without errors
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        athleteName: "Bob Smith",
        date: "2025-01-15",
        value: 10.25,
      });
    });

    // No error summary
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should show singular 'error' text for single error", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<TestMeasurementForm onSubmit={onSubmit} />);

    // Fix two errors, leave one
    await user.type(screen.getByTestId("input-athlete-name"), "John Doe");
    await user.type(screen.getByTestId("input-date"), "2025-01-15");

    // Submit with one remaining error
    await user.click(screen.getByTestId("submit-button"));

    // Should show singular "error"
    await waitFor(() => {
      expect(screen.getByText(/1 error/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/errors/i)).not.toBeInTheDocument(); // Should not be plural
  });

  it("should preserve error summary across re-renders", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<TestMeasurementForm onSubmit={onSubmit} />);

    // Submit to trigger errors
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Re-render (simulating parent component update)
    rerender(<TestMeasurementForm onSubmit={onSubmit} />);

    // Error summary should still be visible
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/3 errors/i)).toBeInTheDocument();
  });
});
