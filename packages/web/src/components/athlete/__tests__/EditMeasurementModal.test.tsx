/**
 * Tests for EditMeasurementModal Component
 *
 * Tests the modal for editing self-entered (unverified) measurements.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { EditMeasurementModal } from '../EditMeasurementModal';
import type { Measurement } from '@shared/schema';

// Mock measurement data
const mockMeasurement: Measurement = {
  id: 'measurement-1',
  metric: 'FLY10_TIME',
  value: '1.23',
  units: 's',
  date: '2024-01-15',
  notes: 'Test notes',
  isVerified: false,
  userId: 'user-1',
  submittedBy: 'user-1',
  verifiedBy: null,
  age: 18,
  flyInDistance: null,
  auxiliaryValue: null,
  teamId: null,
  teamNameSnapshot: null,
  organizationId: 'org-1',
  season: null,
  teamContextAuto: true,
  globalAthleteId: null,
  isCalculated: false,
  calculatedFromMeasurementIds: null,
  calculationMetadata: null,
  createdAt: new Date('2024-01-15'),
  eventId: null,
  eventNameSnapshot: null,
  eventDateSnapshot: null,
  importSource: null,
  importBatchId: null,
};

describe('EditMeasurementModal', () => {
  let mockOnSave: ReturnType<typeof vi.fn>;
  let mockOnClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave = vi.fn();
    mockOnClose = vi.fn();
  });

  describe('Modal Structure', () => {
    it('should render modal when open is true', () => {
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render modal when open is false', () => {
      render(
        <EditMeasurementModal
          open={false}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should display "Edit Measurement" title', () => {
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('heading', { name: /edit measurement/i })).toBeInTheDocument();
    });

    it('should display metric name in title or description', () => {
      // NOTE: getMetricDisplayName now returns metric codes as fallback.
      // In production, labels come from database via useMetricConfig hook.
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      // Now displays metric code (fallback behavior)
      expect(screen.getByText(/FLY10_TIME/i)).toBeInTheDocument();
    });
  });

  describe('Form Fields', () => {
    it('should pre-fill value field with current measurement value', () => {
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      const valueInput = screen.getByLabelText(/value/i);
      expect(valueInput).toHaveValue(1.23);
    });

    it('should pre-fill date field with current measurement date', () => {
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      const dateInput = screen.getByLabelText(/date/i);
      expect(dateInput).toHaveValue('2024-01-15');
    });

    it('should pre-fill notes field with current measurement notes', () => {
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      const notesInput = screen.getByLabelText(/notes/i);
      expect(notesInput).toHaveValue('Test notes');
    });

    it('should display units next to value field', () => {
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      // Should show units (s for seconds)
      expect(screen.getByText(/\(s\)|seconds/i)).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should call onSave with updated data when form is submitted', async () => {
      const user = userEvent.setup();
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      // Change value
      const valueInput = screen.getByLabelText(/value/i);
      await user.clear(valueInput);
      await user.type(valueInput, '1.45');

      // Submit form
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({
          measurementId: 'measurement-1',
          value: 1.45,
          date: '2024-01-15',
          notes: 'Test notes',
        });
      });
    });

    it('should call onSave with updated notes', async () => {
      const user = userEvent.setup();
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      // Change notes
      const notesInput = screen.getByLabelText(/notes/i);
      await user.clear(notesInput);
      await user.type(notesInput, 'Updated notes');

      // Submit form
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            notes: 'Updated notes',
          })
        );
      });
    });

    it('should disable save button while saving', () => {
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
          isSaving={true}
        />
      );

      const saveButton = screen.getByRole('button', { name: /sav/i });
      expect(saveButton).toBeDisabled();
    });

    it('should show loading indicator while saving', () => {
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
          isSaving={true}
        />
      );

      expect(screen.getByText(/saving/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should show error when value is empty', async () => {
      const user = userEvent.setup();
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      const valueInput = screen.getByLabelText(/value/i);
      await user.clear(valueInput);

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        // z.coerce converts empty string to 0, which fails "positive" validation
        expect(screen.getByText(/value is required|required|must be positive/i)).toBeInTheDocument();
      });
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should show error when value is negative', async () => {
      const user = userEvent.setup();
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      const valueInput = screen.getByLabelText(/value/i) as HTMLInputElement;
      await user.clear(valueInput);
      // Use fireEvent for reliable negative number input in jsdom
      valueInput.value = '-5';
      valueInput.dispatchEvent(new Event('input', { bubbles: true }));

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        // Should show validation error (either "must be positive" or "required" depending on how the input handles negatives)
        expect(screen.getByText(/must be positive|value is required|required/i)).toBeInTheDocument();
      });
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should show error when date is empty', async () => {
      const user = userEvent.setup();
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      const dateInput = screen.getByLabelText(/date/i);
      await user.clear(dateInput);

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/date is required|required/i)).toBeInTheDocument();
      });
      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  describe('Cancel Action', () => {
    it('should call onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not save changes when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(
        <EditMeasurementModal
          open={true}
          measurement={mockMeasurement}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      // Make a change
      const valueInput = screen.getByLabelText(/value/i);
      await user.clear(valueInput);
      await user.type(valueInput, '2.00');

      // Cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  describe('Null Measurement', () => {
    it('should not render when measurement is null', () => {
      render(
        <EditMeasurementModal
          open={true}
          measurement={null}
          onSave={mockOnSave}
          onClose={mockOnClose}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
