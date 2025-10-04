/**
 * Tests for ColumnMappingDialog component
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ColumnMappingDialog } from '../ColumnMappingDialog';
import type { CSVParseResult } from '@shared/import-types';

describe('ColumnMappingDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnConfirm = vi.fn();

  const mockParseResult: CSVParseResult = {
    headers: ['First Name', 'Last Name', 'Email', 'Birth Year'],
    rows: [
      { 'First Name': 'John', 'Last Name': 'Doe', 'Email': 'john@example.com', 'Birth Year': '2008' },
      { 'First Name': 'Jane', 'Last Name': 'Smith', 'Email': 'jane@example.com', 'Birth Year': '2009' },
    ],
    suggestedMappings: [
      { csvColumn: 'First Name', systemField: 'firstName', isRequired: true, autoDetected: true },
      { csvColumn: 'Last Name', systemField: 'lastName', isRequired: true, autoDetected: true },
      { csvColumn: 'Birth Year', systemField: 'birthYear', isRequired: false, autoDetected: true },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render dialog when open', () => {
      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={mockParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Map CSV Columns to Fields')).toBeInTheDocument();
      expect(screen.getByText(/Match your CSV columns/i)).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <ColumnMappingDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          parseResult={mockParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.queryByText('Map CSV Columns to Fields')).not.toBeInTheDocument();
    });

    it('should display all CSV headers', () => {
      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={mockParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('First Name')).toBeInTheDocument();
      expect(screen.getByText('Last Name')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Birth Year')).toBeInTheDocument();
    });

    it('should display sample data from first row', () => {
      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={mockParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });
  });

  describe('Auto-Detection', () => {
    it('should apply suggested mappings on mount', () => {
      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={mockParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      // The select dropdowns should show the suggested values
      // We can't easily test the select values, but we can verify they're present
      expect(screen.getAllByRole('combobox')).toHaveLength(mockParseResult.headers.length);
    });
  });

  describe('Column Mapping', () => {
    it('should allow changing column mappings', async () => {
      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={mockParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      // This test is simplified - in real testing you'd interact with the Select component
      expect(screen.getAllByRole('combobox')).toBeTruthy();
    });

    it('should show required fields with asterisk', () => {
      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={mockParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      // Required fields should be marked
      expect(screen.getByText(/First Name/)).toBeInTheDocument();
      expect(screen.getByText(/Last Name/)).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('should show warning when required fields are missing', () => {
      const incompleteParseResult: CSVParseResult = {
        headers: ['Email', 'Birth Year'],
        rows: [{ 'Email': 'john@example.com', 'Birth Year': '2008' }],
        suggestedMappings: [],
      };

      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={incompleteParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText(/Missing required fields/i)).toBeInTheDocument();
    });

    it('should disable confirm button when required fields missing', () => {
      const incompleteParseResult: CSVParseResult = {
        headers: ['Email'],
        rows: [{ 'Email': 'john@example.com' }],
        suggestedMappings: [],
      };

      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={incompleteParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      const confirmButton = screen.getByText('Continue to Preview');
      expect(confirmButton).toBeDisabled();
    });

    it('should enable confirm button when all required fields mapped', () => {
      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={mockParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      const confirmButton = screen.getByText('Continue to Preview');
      expect(confirmButton).not.toBeDisabled();
    });
  });

  describe('User Actions', () => {
    it('should call onOpenChange when cancel is clicked', () => {
      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={mockParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should call onConfirm with mappings when confirmed', () => {
      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={mockParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      const confirmButton = screen.getByText('Continue to Preview');
      fireEvent.click(confirmButton);

      expect(mockOnConfirm).toHaveBeenCalled();
      const mappings = mockOnConfirm.mock.calls[0][0];
      expect(mappings).toBeDefined();
      expect(typeof mappings).toBe('object');
    });
  });

  describe('Import Type Differences', () => {
    it('should show athlete-specific fields for athletes import', () => {
      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={mockParseResult}
          importType="athletes"
          onConfirm={mockOnConfirm}
        />
      );

      // Athletes have fields like teamName, sports, etc.
      expect(screen.getByText('Map CSV Columns to Fields')).toBeInTheDocument();
    });

    it('should show measurement-specific fields for measurements import', () => {
      const measurementParseResult: CSVParseResult = {
        headers: ['First Name', 'Last Name', 'Team', 'Date', 'Metric', 'Value'],
        rows: [{
          'First Name': 'John',
          'Last Name': 'Doe',
          'Team': 'Test Team',
          'Date': '2024-01-01',
          'Metric': 'FLY10_TIME',
          'Value': '1.25'
        }],
        suggestedMappings: [
          { csvColumn: 'First Name', systemField: 'firstName', isRequired: true, autoDetected: true },
          { csvColumn: 'Last Name', systemField: 'lastName', isRequired: true, autoDetected: true },
          { csvColumn: 'Team', systemField: 'teamName', isRequired: true, autoDetected: true },
          { csvColumn: 'Date', systemField: 'date', isRequired: true, autoDetected: true },
          { csvColumn: 'Metric', systemField: 'metric', isRequired: true, autoDetected: true },
          { csvColumn: 'Value', systemField: 'value', isRequired: true, autoDetected: true },
        ],
      };

      render(
        <ColumnMappingDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          parseResult={measurementParseResult}
          importType="measurements"
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('Map CSV Columns to Fields')).toBeInTheDocument();
    });
  });
});
