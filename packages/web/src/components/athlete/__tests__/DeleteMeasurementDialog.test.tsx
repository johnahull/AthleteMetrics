/**
 * Tests for DeleteMeasurementDialog Component
 *
 * Tests the confirmation dialog for deleting self-entered measurements.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DeleteMeasurementDialog } from '../DeleteMeasurementDialog';
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

describe('DeleteMeasurementDialog', () => {
  let mockOnConfirm: ReturnType<typeof vi.fn>;
  let mockOnCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConfirm = vi.fn();
    mockOnCancel = vi.fn();
  });

  describe('Dialog Structure', () => {
    it('should render dialog when open is true', () => {
      render(
        <DeleteMeasurementDialog
          open={true}
          measurement={mockMeasurement}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('should not render dialog when open is false', () => {
      render(
        <DeleteMeasurementDialog
          open={false}
          measurement={mockMeasurement}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('should display delete confirmation title', () => {
      render(
        <DeleteMeasurementDialog
          open={true}
          measurement={mockMeasurement}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByRole('heading', { name: /delete measurement/i })).toBeInTheDocument();
    });

    it('should display warning message about permanent deletion', () => {
      render(
        <DeleteMeasurementDialog
          open={true}
          measurement={mockMeasurement}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText(/cannot be undone|permanent/i)).toBeInTheDocument();
    });

    it('should display metric name in message', () => {
      // NOTE: getMetricDisplayName now returns metric codes as fallback.
      // In production, labels come from database via useMetricConfig hook.
      render(
        <DeleteMeasurementDialog
          open={true}
          measurement={mockMeasurement}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // Now displays metric code (fallback behavior)
      expect(screen.getByText(/FLY10_TIME/i)).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('should call onConfirm when delete button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <DeleteMeasurementDialog
          open={true}
          measurement={mockMeasurement}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      expect(mockOnConfirm).toHaveBeenCalledWith('measurement-1');
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <DeleteMeasurementDialog
          open={true}
          measurement={mockMeasurement}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should disable delete button while deleting', () => {
      render(
        <DeleteMeasurementDialog
          open={true}
          measurement={mockMeasurement}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
          isDeleting={true}
        />
      );

      const deleteButton = screen.getByRole('button', { name: /delet/i });
      expect(deleteButton).toBeDisabled();
    });

    it('should show loading state while deleting', () => {
      render(
        <DeleteMeasurementDialog
          open={true}
          measurement={mockMeasurement}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
          isDeleting={true}
        />
      );

      expect(screen.getByText(/deleting/i)).toBeInTheDocument();
    });
  });

  describe('Null Measurement', () => {
    it('should not render when measurement is null', () => {
      render(
        <DeleteMeasurementDialog
          open={true}
          measurement={null}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });
});
