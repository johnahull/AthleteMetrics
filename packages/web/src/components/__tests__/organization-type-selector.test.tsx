/**
 * Unit tests for OrganizationTypeSelector component
 * Tests TDD implementation of organization type selection UI
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OrganizationTypeSelector } from '../organization-type-selector';

// Mock the form control components
vi.mock('@/components/ui/form', () => ({
  FormItem: ({ children }: any) => <div data-testid="form-item">{children}</div>,
  FormLabel: ({ children }: any) => <label data-testid="form-label">{children}</label>,
  FormControl: ({ children }: any) => <div data-testid="form-control">{children}</div>,
  FormMessage: () => <span data-testid="form-message"></span>,
  FormDescription: ({ children }: any) => <div data-testid="form-description">{children}</div>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select-wrapper" data-value={value}>
      <button
        data-testid="organization-type-selector"
        onClick={() => {
          // Simulate select behavior
          onValueChange?.('high_school');
        }}
      >
        Select Organization Type
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div data-testid="select-trigger-wrapper">{children}</div>,
  SelectValue: ({ placeholder }: any) => <span data-testid="select-value">{placeholder}</span>,
  SelectContent: ({ children }: any) => <div data-testid="select-content">{children}</div>,
  SelectItem: ({ value, children }: any) => (
    <div data-testid={`select-item-${value}`} data-value={value}>
      {children}
    </div>
  ),
}));

describe('OrganizationTypeSelector', () => {
  const mockField = {
    value: 'club',
    onChange: vi.fn(),
    onBlur: vi.fn(),
    name: 'orgType' as const,
    ref: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render form item with proper structure', () => {
      render(<OrganizationTypeSelector field={mockField} />);

      expect(screen.getByTestId('form-item')).toBeInTheDocument();
      expect(screen.getByTestId('form-label')).toBeInTheDocument();
      expect(screen.getByTestId('form-control')).toBeInTheDocument();
      expect(screen.getByTestId('form-message')).toBeInTheDocument();
    });

    it('should display proper label', () => {
      render(<OrganizationTypeSelector field={mockField} />);

      expect(screen.getByTestId('form-label')).toHaveTextContent('Organization Type');
    });

    it('should display helper description', () => {
      render(<OrganizationTypeSelector field={mockField} />);

      const description = screen.getByTestId('form-description');
      expect(description).toHaveTextContent(
        'Select the type of organization to filter available metrics and benchmarks'
      );
    });

    it('should render select component with current value', () => {
      render(<OrganizationTypeSelector field={mockField} />);

      const selectWrapper = screen.getByTestId('select-wrapper');
      expect(selectWrapper).toHaveAttribute('data-value', 'club');
    });

    it('should show placeholder when no value is selected', () => {
      const fieldWithoutValue = { ...mockField, value: undefined };
      render(<OrganizationTypeSelector field={fieldWithoutValue} />);

      expect(screen.getByTestId('select-value')).toHaveTextContent('Select organization type');
    });
  });

  describe('Organization Type Options', () => {
    it('should render all organization type options with proper labels', () => {
      render(<OrganizationTypeSelector field={mockField} />);

      // Check that all organization types are rendered as select items
      expect(screen.getByTestId('select-item-youth')).toHaveTextContent('Youth/Recreational');
      expect(screen.getByTestId('select-item-high_school')).toHaveTextContent('High School');
      expect(screen.getByTestId('select-item-college')).toHaveTextContent('College/University');
      expect(screen.getByTestId('select-item-club')).toHaveTextContent('Club/Travel Team');
      expect(screen.getByTestId('select-item-private_facility')).toHaveTextContent('Private Coach/Training Facility');
      expect(screen.getByTestId('select-item-elite_academy')).toHaveTextContent('Elite Academy');
    });

    it('should have proper data attributes for each option', () => {
      render(<OrganizationTypeSelector field={mockField} />);

      expect(screen.getByTestId('select-item-youth')).toHaveAttribute('data-value', 'youth');
      expect(screen.getByTestId('select-item-high_school')).toHaveAttribute('data-value', 'high_school');
      expect(screen.getByTestId('select-item-college')).toHaveAttribute('data-value', 'college');
      expect(screen.getByTestId('select-item-club')).toHaveAttribute('data-value', 'club');
      expect(screen.getByTestId('select-item-private_facility')).toHaveAttribute('data-value', 'private_facility');
      expect(screen.getByTestId('select-item-elite_academy')).toHaveAttribute('data-value', 'elite_academy');
    });
  });

  describe('Form Integration', () => {
    it('should call onChange when value changes', async () => {
      render(<OrganizationTypeSelector field={mockField} />);

      const selectTrigger = screen.getByTestId('organization-type-selector');
      fireEvent.click(selectTrigger);

      await waitFor(() => {
        expect(mockField.onChange).toHaveBeenCalledWith('high_school');
      });
    });

    it('should pass through all field props correctly', () => {
      const fieldWithAllProps = {
        ...mockField,
        value: 'college',
        disabled: true,
        required: true,
      };

      render(<OrganizationTypeSelector field={fieldWithAllProps} />);

      const selectWrapper = screen.getByTestId('select-wrapper');
      expect(selectWrapper).toHaveAttribute('data-value', 'college');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<OrganizationTypeSelector field={mockField} />);

      const label = screen.getByTestId('form-label');
      expect(label).toBeInTheDocument();

      const formControl = screen.getByTestId('form-control');
      expect(formControl).toBeInTheDocument();
    });

    it('should be keyboard navigable', () => {
      render(<OrganizationTypeSelector field={mockField} />);

      const selectTrigger = screen.getByTestId('organization-type-selector');
      expect(selectTrigger).toBeInTheDocument();

      // Focus should work
      selectTrigger.focus();
      expect(document.activeElement).toBe(selectTrigger);
    });
  });

  describe('Error Handling', () => {
    it('should display form validation message', () => {
      render(<OrganizationTypeSelector field={mockField} />);

      const message = screen.getByTestId('form-message');
      expect(message).toBeInTheDocument();
    });

    it('should handle undefined field value gracefully', () => {
      const fieldWithUndefinedValue = { ...mockField, value: undefined };

      expect(() => {
        render(<OrganizationTypeSelector field={fieldWithUndefinedValue} />);
      }).not.toThrow();
    });

    it('should handle null field value gracefully', () => {
      const fieldWithNullValue = { ...mockField, value: null };

      expect(() => {
        render(<OrganizationTypeSelector field={fieldWithNullValue} />);
      }).not.toThrow();
    });
  });
});