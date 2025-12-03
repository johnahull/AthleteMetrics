/**
 * SelfEntryForm Component Tests
 *
 * TDD Test Suite for athlete self-entry measurement form
 * Following test-first approach: Write failing tests, then implement component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelfEntryForm } from '../SelfEntryForm';

describe('SelfEntryForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Form Structure', () => {
    it('should render all required form fields', () => {
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      // Check for all required fields
      expect(screen.getByLabelText(/metric/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/value/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    });

    it('should show warning banner about personal tracking', () => {
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      expect(
        screen.getByText(/personal entry/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/not be included in peer comparisons/i)
      ).toBeInTheDocument();
    });

    it('should render Submit and Cancel buttons', () => {
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('Metric Selection', () => {
    it('should have a metric select field with proper accessibility', () => {
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      // Verify metric select is rendered with proper role (Radix Select uses combobox)
      const metricTrigger = screen.getByRole('combobox', { name: /metric/i });
      expect(metricTrigger).toBeInTheDocument();
      // Radix Select uses aria-expanded instead of aria-haspopup
      expect(metricTrigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('should not submit form when metric is not selected', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      // Fill other fields but leave metric empty
      const valueInput = screen.getByLabelText(/value/i);
      await user.type(valueInput, '28.5');

      // Submit without selecting metric
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Form should not submit when metric is not selected
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Value Input Validation', () => {
    it('should accept positive numbers for value', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const valueInput = screen.getByLabelText(/value/i);
      await user.type(valueInput, '28.5');

      expect(valueInput).toHaveValue(28.5);
    });

    it('should not submit form with negative numbers', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const valueInput = screen.getByLabelText(/value/i);
      await user.type(valueInput, '-10');

      // Attempt submit to trigger validation
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Should not call onSubmit with negative value
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should accept decimal values with up to 2 decimal places', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const valueInput = screen.getByLabelText(/value/i);
      await user.type(valueInput, '1.52');

      expect(valueInput).toHaveValue(1.52);
    });

    it('should show validation error for empty value', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      // Don't fill value, just submit
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Should show required error
      await waitFor(() => {
        expect(screen.getByText('Value is required')).toBeInTheDocument();
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Date Selection', () => {
    it('should default date to today', () => {
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const dateInput = screen.getByLabelText(/date/i);
      const today = new Date().toISOString().split('T')[0];

      expect(dateInput).toHaveValue(today);
    });

    it('should allow selecting a past date', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const dateInput = screen.getByLabelText(/date/i);
      await user.clear(dateInput);
      await user.type(dateInput, '2024-03-01');

      expect(dateInput).toHaveValue('2024-03-01');
    });

    it('should reject future dates', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const dateInput = screen.getByLabelText(/date/i);

      // Try to set a future date (1 year from now)
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      await user.clear(dateInput);
      await user.type(dateInput, futureDateStr);

      // Attempt submit to trigger validation
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/cannot be in the future|must be today or earlier/i)).toBeInTheDocument();
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should show validation error for empty date', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const dateInput = screen.getByLabelText(/date/i);
      await user.clear(dateInput);

      // Attempt submit
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Should show required error (exact message)
      await waitFor(() => {
        expect(screen.getByText('Date is required')).toBeInTheDocument();
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Notes Field', () => {
    it('should allow entering notes (optional)', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const notesTextarea = screen.getByLabelText(/notes/i);
      await user.type(notesTextarea, 'Felt good today');

      expect(notesTextarea).toHaveValue('Felt good today');
    });

    it('should allow notes field to be empty (optional)', () => {
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      // Verify notes field exists and is not required
      const notesTextarea = screen.getByLabelText(/notes/i);
      expect(notesTextarea).toBeInTheDocument();
      expect(notesTextarea).not.toBeRequired();
    });
  });

  describe('Form Submission', () => {
    it('should have a submit button', () => {
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton).toBeInTheDocument();
      expect(submitButton).toHaveAttribute('type', 'submit');
    });

    it('should disable submit button when isSubmitting is true', () => {
      render(
        <SelfEntryForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton).toBeDisabled();
    });

    it('should show loading state on submit button when submitting', () => {
      render(
        <SelfEntryForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      );

      // Should show loading text or spinner
      expect(screen.getByText(/submitting|saving/i)).toBeInTheDocument();
    });

    it('should not submit form with invalid data', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      // Only fill value, leave metric empty
      const valueInput = screen.getByLabelText(/value/i);
      await user.type(valueInput, '28.5');

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Should not call onSubmit when form has validation errors
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Cancel Functionality', () => {
    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('should not call onSubmit when canceling', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Form Validation Summary', () => {
    it('should show all validation errors when multiple fields are invalid', async () => {
      const user = userEvent.setup();
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      // Clear date and try to submit empty form
      const dateInput = screen.getByLabelText(/date/i);
      await user.clear(dateInput);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Should show multiple validation errors (exact messages)
      // Using findByText with longer timeout for async validation
      const metricError = await screen.findByText('Metric is required', {}, { timeout: 3000 });
      expect(metricError).toBeInTheDocument();

      const valueError = await screen.findByText('Value is required', {}, { timeout: 3000 });
      expect(valueError).toBeInTheDocument();

      const dateError = await screen.findByText('Date is required', {}, { timeout: 3000 });
      expect(dateError).toBeInTheDocument();

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      // All form fields should have associated labels
      expect(screen.getByLabelText(/metric/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/value/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    });

    it('should have accessible warning banner', () => {
      render(<SelfEntryForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      // Warning should be accessible (role="alert" or similar)
      const warningBanner = screen.getByText(/personal entry/i).closest('[role="alert"]');
      expect(warningBanner).toBeInTheDocument();
    });
  });
});
