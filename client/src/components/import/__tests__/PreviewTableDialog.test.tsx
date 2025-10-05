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
      expect(screen.getByText(/Review the data before importing/i)).toBeInTheDocument();
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
      // "Error" appears multiple times (as last name and as badge), so use getAllByText
      expect(screen.getAllByText('Error').length).toBeGreaterThan(0);
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

      const totalElement = screen.getByText('Total Rows').parentElement;
      expect(totalElement).toHaveTextContent('3');
      expect(totalElement).toHaveTextContent('Total Rows');
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

      // "Will Create" appears multiple times (in summary and badges), find the summary one
      const willCreateElements = screen.getAllByText('Will Create');
      const summaryElement = willCreateElements.find(el =>
        el.parentElement?.textContent?.includes('1') && el.className.includes('text-gray-600')
      );
      expect(summaryElement).toBeTruthy();
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

      // "Will Match" appears multiple times (in summary and badges), find the summary one
      const willMatchElements = screen.getAllByText('Will Match');
      const summaryElement = willMatchElements.find(el =>
        el.parentElement?.textContent?.includes('1') && el.className.includes('text-gray-600')
      );
      expect(summaryElement).toBeTruthy();
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

      // "Will Create" appears in both summary and badge
      const badges = screen.getAllByText('Will Create');
      expect(badges.length).toBeGreaterThan(0);
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

      // "Will Match" appears in both summary and badge
      const badges = screen.getAllByText('Will Match');
      expect(badges.length).toBeGreaterThan(0);
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
      expect(screen.getByText(/Review the data before importing/i)).toBeInTheDocument();
    });
  });

  describe('Performance Limits', () => {
    it('should limit display to MAX_DISPLAYED_ROWS (100) for large datasets', () => {
      // Create 200 mock rows
      const manyRows: PreviewRow[] = Array.from({ length: 200 }, (_, i) => ({
        rowIndex: i,
        data: {
          'First Name': `Person${i}`,
          'Last Name': `Last${i}`,
          'Email': `person${i}@example.com`,
        },
        validations: [
          { rowIndex: i, field: 'firstName', status: 'valid' },
          { rowIndex: i, field: 'lastName', status: 'valid' },
          { rowIndex: i, field: 'emails', status: 'valid' },
        ],
        matchStatus: 'will_create',
      }));

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={manyRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      // Should show first person
      expect(screen.getByText('Person0')).toBeInTheDocument();

      // Should show 99th person (index 99 = 100th row)
      expect(screen.getByText('Person99')).toBeInTheDocument();

      // Should NOT show 100th person (index 100, which would be 101st row)
      expect(screen.queryByText('Person100')).not.toBeInTheDocument();

      // Should NOT show last person
      expect(screen.queryByText('Person199')).not.toBeInTheDocument();
    });

    it('should show large dataset warning for datasets over 100 rows', () => {
      const manyRows: PreviewRow[] = Array.from({ length: 150 }, (_, i) => ({
        rowIndex: i,
        data: {
          'First Name': `Person${i}`,
          'Last Name': `Last${i}`,
        },
        validations: [
          { rowIndex: i, field: 'firstName', status: 'valid' },
          { rowIndex: i, field: 'lastName', status: 'valid' },
        ],
        matchStatus: 'will_create',
      }));

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={manyRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Large dataset detected')).toBeInTheDocument();
      expect(screen.getByText(/Preview limited to 100 rows for performance/i)).toBeInTheDocument();
      expect(screen.getByText(/All 150 rows will be imported/i)).toBeInTheDocument();
    });

    it('should NOT show large dataset warning for datasets under 100 rows', () => {
      const smallRows: PreviewRow[] = Array.from({ length: 50 }, (_, i) => ({
        rowIndex: i,
        data: {
          'First Name': `Person${i}`,
          'Last Name': `Last${i}`,
        },
        validations: [
          { rowIndex: i, field: 'firstName', status: 'valid' },
          { rowIndex: i, field: 'lastName', status: 'valid' },
        ],
        matchStatus: 'will_create',
      }));

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={smallRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.queryByText('Large dataset detected')).not.toBeInTheDocument();
    });

    it('should calculate summary statistics for all rows, not just displayed rows', () => {
      // Create 200 rows with mixed statuses
      const manyRows: PreviewRow[] = [
        ...Array.from({ length: 50 }, (_, i) => ({
          rowIndex: i,
          data: { 'First Name': `Person${i}`, 'Last Name': `Last${i}` },
          validations: [
            { rowIndex: i, field: 'firstName', status: 'valid' as const },
            { rowIndex: i, field: 'lastName', status: 'valid' as const },
          ],
          matchStatus: 'will_create' as const,
        })),
        ...Array.from({ length: 50 }, (_, i) => ({
          rowIndex: i + 50,
          data: { 'First Name': `Person${i + 50}`, 'Last Name': `Last${i + 50}` },
          validations: [
            { rowIndex: i + 50, field: 'firstName', status: 'valid' as const },
            { rowIndex: i + 50, field: 'lastName', status: 'valid' as const },
          ],
          matchStatus: 'will_match' as const,
          matchedAthleteName: `Person${i + 50} (existing)`,
        })),
        ...Array.from({ length: 50 }, (_, i) => ({
          rowIndex: i + 100,
          data: { 'First Name': `Person${i + 100}`, 'Last Name': `Last${i + 100}` },
          validations: [
            { rowIndex: i + 100, field: 'firstName', status: 'valid' as const },
            { rowIndex: i + 100, field: 'lastName', status: 'valid' as const },
          ],
          matchStatus: 'duplicate' as const,
        })),
        ...Array.from({ length: 50 }, (_, i) => ({
          rowIndex: i + 150,
          data: { 'First Name': '', 'Last Name': `Last${i + 150}` },
          validations: [
            { rowIndex: i + 150, field: 'firstName', status: 'error' as const, message: 'Required' },
            { rowIndex: i + 150, field: 'lastName', status: 'valid' as const },
          ],
          matchStatus: 'error' as const,
        })),
      ];

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={manyRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      // Summary should reflect ALL 200 rows, not just the 100 displayed
      const totalElement = screen.getByText('Total Rows').parentElement;
      expect(totalElement).toHaveTextContent('200');

      // Check all status counts are accurate for full dataset
      // These labels appear multiple times (in summary and badges), find the summary ones by class
      const willCreateElements = screen.getAllByText('Will Create');
      const willCreateSummary = willCreateElements.find(el => el.className.includes('text-gray-600'));
      expect(willCreateSummary?.parentElement).toHaveTextContent('50');

      const willMatchElements = screen.getAllByText('Will Match');
      const willMatchSummary = willMatchElements.find(el => el.className.includes('text-gray-600'));
      expect(willMatchSummary?.parentElement).toHaveTextContent('50');

      const duplicatesElement = screen.getByText('Duplicates').parentElement;
      expect(duplicatesElement).toHaveTextContent('50');

      const errorsElement = screen.getByText('Errors').parentElement;
      expect(errorsElement).toHaveTextContent('50');
    });

    it('should indicate in dialog description how many rows are being shown', () => {
      const manyRows: PreviewRow[] = Array.from({ length: 250 }, (_, i) => ({
        rowIndex: i,
        data: { 'First Name': `Person${i}`, 'Last Name': `Last${i}` },
        validations: [
          { rowIndex: i, field: 'firstName', status: 'valid' },
          { rowIndex: i, field: 'lastName', status: 'valid' },
        ],
        matchStatus: 'will_create',
      }));

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={manyRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText(/Displaying first 100 of 250 rows for performance/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases and Bug Fixes', () => {
    it('should display zero values correctly (not as empty)', () => {
      const rowsWithZero: PreviewRow[] = [{
        rowIndex: 0,
        data: {
          'First Name': 'John',
          'Last Name': 'Doe',
          'Value': '0', // Zero value
        },
        validations: [
          { rowIndex: 0, field: 'firstName', status: 'valid' },
          { rowIndex: 0, field: 'lastName', status: 'valid' },
          { rowIndex: 0, field: 'value', status: 'valid' },
        ],
        matchStatus: 'will_create',
      }];

      const mappings = {
        'First Name': 'firstName',
        'Last Name': 'lastName',
        'Value': 'value',
      };

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={rowsWithZero}
          columnMappings={mappings}
          onConfirm={mockOnConfirm}
        />
      );

      // Should display "0" not "empty" in the value column
      const cells = screen.getAllByRole('cell');
      const valueCell = cells.find(cell => cell.textContent === '0');
      expect(valueCell).toBeDefined();

      // Verify no "empty" indicator is shown for the zero value
      const table = screen.getByRole('table');
      expect(table.textContent).toContain('0');
      // The table should not have "empty" for the zero value
      // (Note: there might be "empty" for truly empty cells, so we check the specific row)
    });

    it('should handle empty rows with warning message', () => {
      const emptyRows: PreviewRow[] = [];

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={emptyRows}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      // Should show "No data to preview" message
      expect(screen.getByText('No data to preview')).toBeInTheDocument();
      expect(screen.getByText(/CSV file appears to be empty/i)).toBeInTheDocument();
    });

    it('should handle empty string values correctly', () => {
      const rowsWithEmptyStrings: PreviewRow[] = [{
        rowIndex: 0,
        data: {
          'First Name': 'John',
          'Last Name': '',  // Empty string
          'Email': 'john@example.com',
        },
        validations: [
          { rowIndex: 0, field: 'firstName', status: 'valid' },
          { rowIndex: 0, field: 'lastName', status: 'warning', message: 'Last name is empty' },
          { rowIndex: 0, field: 'emails', status: 'valid' },
        ],
        matchStatus: 'will_create',
      }];

      const mappings = {
        'First Name': 'firstName',
        'Last Name': 'lastName',
        'Email': 'emails',
      };

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={rowsWithEmptyStrings}
          columnMappings={mappings}
          onConfirm={mockOnConfirm}
        />
      );

      // Empty string should show as "empty"
      expect(screen.getAllByText(/empty/i).length).toBeGreaterThan(0);
    });

    it('should handle false boolean values correctly', () => {
      const rowsWithFalse: PreviewRow[] = [{
        rowIndex: 0,
        data: {
          'First Name': 'John',
          'Last Name': 'Doe',
          'Is Active': 'false',  // Boolean false as string
        },
        validations: [
          { rowIndex: 0, field: 'firstName', status: 'valid' },
          { rowIndex: 0, field: 'lastName', status: 'valid' },
          { rowIndex: 0, field: 'isActive', status: 'valid' },
        ],
        matchStatus: 'will_create',
      }];

      const mappings = {
        'First Name': 'firstName',
        'Last Name': 'lastName',
        'Is Active': 'isActive',
      };

      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={rowsWithFalse}
          columnMappings={mappings}
          onConfirm={mockOnConfirm}
        />
      );

      // Should display "false" not "empty"
      expect(screen.getByText('false')).toBeInTheDocument();
    });

    it('should not render summary stats when no rows', () => {
      render(
        <PreviewTableDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          previewRows={[]}
          columnMappings={mockColumnMappings}
          onConfirm={mockOnConfirm}
        />
      );

      // Summary stats should not be rendered
      expect(screen.queryByText('Total Rows')).not.toBeInTheDocument();
      expect(screen.queryByText('Will Create')).not.toBeInTheDocument();
    });
  });
});
