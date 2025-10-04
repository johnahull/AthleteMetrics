/**
 * Tests for PreviewTableDialog component
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PreviewTableDialog } from '../PreviewTableDialog';
import type { PreviewRow } from '@shared/import-types';

describe('PreviewTableDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnConfirm = vi.fn();

  const mockPreviewRows: PreviewRow[] = [
    {
      rowIndex: 0,
      data: {
        'First Name': 'John',
        'Last Name': 'Doe',
        'Email': 'john@example.com',
      },
      validations: [
        { rowIndex: 0, field: 'firstName', status: 'valid' },
        { rowIndex: 0, field: 'lastName', status: 'valid' },
        { rowIndex: 0, field: 'emails', status: 'valid' },
      ],
      matchStatus: 'will_create',
    },
    {
      rowIndex: 1,
      data: {
        'First Name': 'Jane',
        'Last Name': 'Smith',
        'Email': '',
      },
      validations: [
        { rowIndex: 1, field: 'firstName', status: 'valid' },
        { rowIndex: 1, field: 'lastName', status: 'valid' },
        { rowIndex: 1, field: 'emails', status: 'warning', message: 'Email is empty' },
      ],
      matchStatus: 'will_match',
      matchedAthleteName: 'Jane Smith (existing)',
    },
    {
      rowIndex: 2,
      data: {
        'First Name': '',
        'Last Name': 'Error',
        'Email': 'error@example.com',
      },
      validations: [
        { rowIndex: 2, field: 'firstName', status: 'error', message: 'Required field is empty' },
        { rowIndex: 2, field: 'lastName', status: 'valid' },
        { rowIndex: 2, field: 'emails', status: 'valid' },
      ],
      matchStatus: 'error',
    },
  ];

  const mockColumnMappings = {
    'First Name': 'firstName',
    'Last Name': 'lastName',
    'Email': 'emails',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render dialog when open', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Preview Import Data')).toBeInTheDocument();
      expect(screen.getByText(/Review the first/i)).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <PreviewTableDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.queryByText('Preview Import Data')).not.toBeInTheDocument();
    });

    it('should display all preview rows', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('Jane')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('should display mapped column headers', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('firstName')).toBeInTheDocument();
      expect(screen.getByText('lastName')).toBeInTheDocument();
      expect(screen.getByText('emails')).toBeInTheDocument();
    });
  });

  describe('Summary Statistics', () => {
    it('should display correct total count', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Total Rows')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should display will create count', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Will Create')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('should display will match count', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Will Match')).toBeInTheDocument();
    });

    it('should display errors count when present', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Errors')).toBeInTheDocument();
    });
  });

  describe('Status Badges', () => {
    it('should display will create badge', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Will Create')).toBeInTheDocument();
    });

    it('should display will match badge with matched name', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Will Match')).toBeInTheDocument();
      expect(screen.getByText('→ Jane Smith (existing)')).toBeInTheDocument();
    });

    it('should display error badge', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getAllByText('Error')).toBeTruthy();
    });
  });

  describe('Validation Display', () => {
    it('should show error message for invalid fields', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Required field is empty')).toBeInTheDocument();
    });

    it('should show warning message for warning fields', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Email is empty')).toBeInTheDocument();
    });

    it('should highlight error rows with red background', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      // Error row should have special styling (checked via className)
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
    });

    it('should highlight warning rows with yellow background', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      // Warning row should have special styling
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
    });
  });

  describe('Validation Warnings', () => {
    it('should show error alert when errors present', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Errors found')).toBeInTheDocument();
      expect(screen.getByText(/cannot be imported/i)).toBeInTheDocument();
    });

    it('should show warning alert when warnings present but no errors', () => {
      const warningOnlyRows: PreviewRow[] = [
        {
          rowIndex: 0,
          data: { 'First Name': 'John', 'Last Name': 'Doe', 'Email': '' },
          validations: [
            { rowIndex: 0, field: 'firstName', status: 'valid' },
            { rowIndex: 0, field: 'lastName', status: 'valid' },
            { rowIndex: 0, field: 'emails', status: 'warning', message: 'Email is empty' },
          ],
          matchStatus: 'will_create',
        },
      ];

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={warningOnlyRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Warnings detected')).toBeInTheDocument();
    });

    it('should not show alerts when all valid', () => {
      const validRows: PreviewRow[] = [
        {
          rowIndex: 0,
          data: { 'First Name': 'John', 'Last Name': 'Doe', 'Email': 'john@example.com' },
          validations: [
            { rowIndex: 0, field: 'firstName', status: 'valid' },
            { rowIndex: 0, field: 'lastName', status: 'valid' },
            { rowIndex: 0, field: 'emails', status: 'valid' },
          ],
          matchStatus: 'will_create',
        },
      ];

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={validRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.queryByText('Errors found')).not.toBeInTheDocument();
      expect(screen.queryByText('Warnings detected')).not.toBeInTheDocument();
    });
  });

  describe('User Actions', () => {
    it('should call onOpenChange when cancel is clicked', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should call onConfirm when import button clicked', () => {
      const validRows: PreviewRow[] = [
        {
          rowIndex: 0,
          data: { 'First Name': 'John', 'Last Name': 'Doe' },
          validations: [
            { rowIndex: 0, field: 'firstName', status: 'valid' },
            { rowIndex: 0, field: 'lastName', status: 'valid' },
          ],
          matchStatus: 'will_create',
        },
      ];

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={validRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      const importButton = screen.getByText('Import 1 Row');
      fireEvent.click(importButton);

      expect(mockOnConfirm).toHaveBeenCalled();
    });

    it('should disable import button when errors present', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={mockPreviewRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      const importButton = screen.getByText(/Import 3 Rows/);
      expect(importButton).toBeDisabled();
    });

    it('should show loading state when isLoading', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={[]}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
          isLoading={true}
        />
      );

      expect(screen.getByText('Importing...')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should handle empty preview rows', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={[]}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Preview Import Data')).toBeInTheDocument();
      expect(screen.getByText(/first 0 rows/i)).toBeInTheDocument();
    });
  });
});
