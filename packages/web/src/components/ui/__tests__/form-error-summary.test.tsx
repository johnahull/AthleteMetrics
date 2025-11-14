/**
 * Component tests for FormErrorSummary
 *
 * Test coverage:
 * - Renders nothing when errors array is empty
 * - Renders error list when errors present
 * - Displays correct error count (singular/plural)
 * - Shows AlertCircle icon
 * - Error items are clickable
 * - onErrorClick callback fires with correct field
 * - Keyboard accessible (Tab, Enter, Space)
 * - Accessibility (role="alert", aria-live="polite")
 * - Color coding (red border, background)
 * - Truncates long error messages
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormErrorSummary } from "@/components/ui/form-error-summary";

describe("FormErrorSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render nothing when errors array is empty", () => {
      const { container } = render(<FormErrorSummary errors={[]} />);

      expect(container.firstChild).toBeNull();
    });

    it("should render error summary when errors are present", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];

      render(<FormErrorSummary errors={errors} />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
    });

    it("should display correct error count for single error", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];

      render(<FormErrorSummary errors={errors} />);

      expect(screen.getByText(/please fix the following 1 error/i)).toBeInTheDocument();
    });

    it("should display correct error count for multiple errors (plural)", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
        { field: "email", message: "Email is invalid" },
        { field: "birthDate", message: "Birth date is required" },
      ];

      render(<FormErrorSummary errors={errors} />);

      expect(screen.getByText(/please fix the following 3 errors/i)).toBeInTheDocument();
    });

    it("should display AlertCircle icon", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];

      const { container } = render(<FormErrorSummary errors={errors} />);

      // Check for SVG icon (AlertCircle from lucide-react)
      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveClass("text-red-600");
    });

    it("should apply custom className", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];

      const { container } = render(
        <FormErrorSummary errors={errors} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("should have red border and background styling", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];

      const { container } = render(<FormErrorSummary errors={errors} />);

      const alertDiv = container.firstChild as HTMLElement;
      expect(alertDiv).toHaveClass("border-red-300");
      expect(alertDiv).toHaveClass("bg-red-50");
    });

    it("should render all error messages in a list", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
        { field: "email", message: "Email is invalid" },
        { field: "birthDate", message: "Birth date is required" },
      ];

      render(<FormErrorSummary errors={errors} />);

      expect(screen.getByText("First name is required")).toBeInTheDocument();
      expect(screen.getByText("Email is invalid")).toBeInTheDocument();
      expect(screen.getByText("Birth date is required")).toBeInTheDocument();
    });

    it("should truncate very long error messages", () => {
      const longMessage = "This is a very long error message that should be truncated to prevent layout issues and maintain a clean user interface design pattern across the application".repeat(3);
      const errors = [
        { field: "description", message: longMessage },
      ];

      const { container } = render(<FormErrorSummary errors={errors} />);

      const listItem = container.querySelector('li');
      expect(listItem).toHaveClass("truncate");
    });
  });

  describe("Click Handlers", () => {
    it("should render error messages as plain text when onErrorClick is not provided", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];

      render(<FormErrorSummary errors={errors} />);

      const buttons = screen.queryAllByRole("button");
      // Should not render error messages as buttons (only the component itself might be a button)
      expect(screen.queryByRole("button", { name: /first name is required/i })).not.toBeInTheDocument();
    });

    it("should render error messages as clickable buttons when onErrorClick is provided", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];
      const onErrorClick = vi.fn();

      render(<FormErrorSummary errors={errors} onErrorClick={onErrorClick} />);

      const errorButton = screen.getByRole("button", { name: /first name is required/i });
      expect(errorButton).toBeInTheDocument();
    });

    it("should call onErrorClick with correct field when error clicked", async () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
        { field: "email", message: "Email is invalid" },
      ];
      const onErrorClick = vi.fn();
      const user = userEvent.setup();

      render(<FormErrorSummary errors={errors} onErrorClick={onErrorClick} />);

      const firstErrorButton = screen.getByRole("button", { name: /first name is required/i });
      await user.click(firstErrorButton);

      expect(onErrorClick).toHaveBeenCalledTimes(1);
      expect(onErrorClick).toHaveBeenCalledWith("firstName");
    });

    it("should call onErrorClick for each different error", async () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
        { field: "email", message: "Email is invalid" },
        { field: "birthDate", message: "Birth date is required" },
      ];
      const onErrorClick = vi.fn();
      const user = userEvent.setup();

      render(<FormErrorSummary errors={errors} onErrorClick={onErrorClick} />);

      const firstNameButton = screen.getByRole("button", { name: /first name is required/i });
      const emailButton = screen.getByRole("button", { name: /email is invalid/i });
      const birthDateButton = screen.getByRole("button", { name: /birth date is required/i });

      await user.click(firstNameButton);
      await user.click(emailButton);
      await user.click(birthDateButton);

      expect(onErrorClick).toHaveBeenCalledTimes(3);
      expect(onErrorClick).toHaveBeenNthCalledWith(1, "firstName");
      expect(onErrorClick).toHaveBeenNthCalledWith(2, "email");
      expect(onErrorClick).toHaveBeenNthCalledWith(3, "birthDate");
    });

    it("should allow clicking the same error multiple times", async () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];
      const onErrorClick = vi.fn();
      const user = userEvent.setup();

      render(<FormErrorSummary errors={errors} onErrorClick={onErrorClick} />);

      const errorButton = screen.getByRole("button", { name: /first name is required/i });
      await user.click(errorButton);
      await user.click(errorButton);
      await user.click(errorButton);

      expect(onErrorClick).toHaveBeenCalledTimes(3);
      expect(onErrorClick).toHaveBeenCalledWith("firstName");
    });
  });

  describe("Keyboard Navigation", () => {
    it("should make error buttons keyboard focusable with Tab", async () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
        { field: "email", message: "Email is invalid" },
      ];
      const onErrorClick = vi.fn();
      const user = userEvent.setup();

      render(<FormErrorSummary errors={errors} onErrorClick={onErrorClick} />);

      // Tab to first error button
      await user.tab();
      const firstErrorButton = screen.getByRole("button", { name: /first name is required/i });
      expect(firstErrorButton).toHaveFocus();

      // Tab to second error button
      await user.tab();
      const secondErrorButton = screen.getByRole("button", { name: /email is invalid/i });
      expect(secondErrorButton).toHaveFocus();
    });

    it("should activate error button on Enter key", async () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];
      const onErrorClick = vi.fn();
      const user = userEvent.setup();

      render(<FormErrorSummary errors={errors} onErrorClick={onErrorClick} />);

      const errorButton = screen.getByRole("button", { name: /first name is required/i });
      errorButton.focus();

      await user.keyboard("{Enter}");

      expect(onErrorClick).toHaveBeenCalledWith("firstName");
    });

    it("should activate error button on Space key", async () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];
      const onErrorClick = vi.fn();
      const user = userEvent.setup();

      render(<FormErrorSummary errors={errors} onErrorClick={onErrorClick} />);

      const errorButton = screen.getByRole("button", { name: /first name is required/i });
      errorButton.focus();

      await user.keyboard(" ");

      expect(onErrorClick).toHaveBeenCalledWith("firstName");
    });

    it("should show focus outline on focused error button", async () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];
      const onErrorClick = vi.fn();
      const user = userEvent.setup();

      render(<FormErrorSummary errors={errors} onErrorClick={onErrorClick} />);

      const errorButton = screen.getByRole("button", { name: /first name is required/i });
      errorButton.focus();

      expect(errorButton).toHaveFocus();
      expect(errorButton).toHaveClass("focus:outline-none");
      expect(errorButton).toHaveClass("focus:underline");
    });
  });

  describe("Accessibility", () => {
    it("should have role='alert' for immediate announcement", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];

      render(<FormErrorSummary errors={errors} />);

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
    });

    it("should have aria-live='polite' for non-interrupting announcements", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];

      render(<FormErrorSummary errors={errors} />);

      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("aria-live", "polite");
    });

    it("should have semantic heading for error count", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];

      render(<FormErrorSummary errors={errors} />);

      const heading = screen.getByRole("heading", { level: 3 });
      expect(heading).toHaveTextContent(/please fix the following 1 error/i);
    });

    it("should use list structure for errors", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
        { field: "email", message: "Email is invalid" },
      ];

      render(<FormErrorSummary errors={errors} />);

      const list = screen.getByRole("list");
      expect(list).toBeInTheDocument();

      const listItems = screen.getAllByRole("listitem");
      expect(listItems).toHaveLength(2);
    });

    it("should have sufficient color contrast (WCAG AA)", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];

      const { container } = render(<FormErrorSummary errors={errors} />);

      const heading = screen.getByRole("heading");
      const list = container.querySelector("ul");

      // Red text classes should provide sufficient contrast
      expect(heading).toHaveClass("text-red-800");
      expect(list).toHaveClass("text-red-700");
    });

    it("should announce updates when errors change", () => {
      const initialErrors = [
        { field: "firstName", message: "First name is required" },
      ];
      const updatedErrors = [
        { field: "firstName", message: "First name is required" },
        { field: "email", message: "Email is invalid" },
      ];

      const { rerender } = render(<FormErrorSummary errors={initialErrors} />);

      let heading = screen.getByRole("heading");
      expect(heading).toHaveTextContent(/1 error/i);

      rerender(<FormErrorSummary errors={updatedErrors} />);

      heading = screen.getByRole("heading");
      expect(heading).toHaveTextContent(/2 errors/i);
    });
  });

  describe("Edge Cases", () => {
    it("should handle errors with missing field gracefully", () => {
      const errors = [
        { field: "", message: "Unknown field error" },
      ];

      render(<FormErrorSummary errors={errors} />);

      expect(screen.getByText("Unknown field error")).toBeInTheDocument();
    });

    it("should handle errors with missing message gracefully", () => {
      const errors = [
        { field: "firstName", message: "" },
      ];

      render(<FormErrorSummary errors={errors} />);

      const list = screen.getByRole("list");
      const listItems = screen.getAllByRole("listitem");

      // Should still render but might show empty message
      expect(listItems).toHaveLength(1);
    });

    it("should handle many errors without layout issues", () => {
      const errors = Array.from({ length: 20 }, (_, i) => ({
        field: `field${i}`,
        message: `Error message ${i}`,
      }));

      const { container } = render(<FormErrorSummary errors={errors} />);

      expect(screen.getByText(/20 errors/i)).toBeInTheDocument();

      // Container should have fixed max height to prevent layout shift
      const alertDiv = container.firstChild as HTMLElement;
      expect(alertDiv).toHaveClass("max-h-60");
      expect(alertDiv).toHaveClass("overflow-y-auto");
    });

    it("should preserve order of errors as provided", () => {
      const errors = [
        { field: "z_field", message: "Z field error" },
        { field: "a_field", message: "A field error" },
        { field: "m_field", message: "M field error" },
      ];

      render(<FormErrorSummary errors={errors} />);

      const listItems = screen.getAllByRole("listitem");

      expect(listItems[0]).toHaveTextContent("Z field error");
      expect(listItems[1]).toHaveTextContent("A field error");
      expect(listItems[2]).toHaveTextContent("M field error");
    });

    it("should handle rapid error updates", () => {
      const errors1 = [
        { field: "firstName", message: "First name is required" },
      ];
      const errors2 = [
        { field: "email", message: "Email is invalid" },
      ];
      const errors3 = [
        { field: "birthDate", message: "Birth date is required" },
      ];

      const { rerender } = render(<FormErrorSummary errors={errors1} />);

      expect(screen.getByText("First name is required")).toBeInTheDocument();

      rerender(<FormErrorSummary errors={errors2} />);
      expect(screen.getByText("Email is invalid")).toBeInTheDocument();
      expect(screen.queryByText("First name is required")).not.toBeInTheDocument();

      rerender(<FormErrorSummary errors={errors3} />);
      expect(screen.getByText("Birth date is required")).toBeInTheDocument();
      expect(screen.queryByText("Email is invalid")).not.toBeInTheDocument();
    });

    it("should handle disappearing errors (validation passing)", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
      ];

      const { rerender, container } = render(<FormErrorSummary errors={errors} />);

      expect(screen.getByRole("alert")).toBeInTheDocument();

      rerender(<FormErrorSummary errors={[]} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe("Integration with Forms", () => {
    it("should work with React Hook Form error format", () => {
      // React Hook Form provides errors in format: { field: { message: string, ref: RefObject } }
      const errors = [
        { field: "firstName", message: "First name is required" },
        { field: "emails.0", message: "Invalid email format" },
        { field: "teamIds", message: "At least one team is required" },
      ];

      render(<FormErrorSummary errors={errors} />);

      expect(screen.getByText("First name is required")).toBeInTheDocument();
      expect(screen.getByText("Invalid email format")).toBeInTheDocument();
      expect(screen.getByText("At least one team is required")).toBeInTheDocument();
    });

    it("should display user-friendly field names in error messages", () => {
      const errors = [
        { field: "firstName", message: "First name is required" },
        { field: "lastName", message: "Last name is required" },
        { field: "birthDate", message: "Birth date is required" },
      ];

      render(<FormErrorSummary errors={errors} />);

      // Messages should already be user-friendly from Zod schema
      expect(screen.getByText("First name is required")).toBeInTheDocument();
      expect(screen.getByText("Last name is required")).toBeInTheDocument();
      expect(screen.getByText("Birth date is required")).toBeInTheDocument();
    });
  });
});
