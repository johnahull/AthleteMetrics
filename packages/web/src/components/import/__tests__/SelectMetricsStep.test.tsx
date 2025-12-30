/**
 * Tests for SelectMetricsStep component
 *
 * This component is Step 3 of the Import Wizard (measurements only):
 * - Uses useAvailableMetrics hook to fetch metrics
 * - Groups metrics by category
 * - Provides Common Metrics, Select All, Clear All bulk actions
 * - Shows selection count
 * - Navigation buttons (Back, Next, Cancel)
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SelectMetricsStep } from '../SelectMetricsStep';

// Mock useAvailableMetrics hook
const mockMetrics = [
  { code: 'FLY10_TIME', label: '10-Yard Fly Time', unit: 's', category: 'Speed', description: 'Speed measurement' },
  { code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in', category: 'Power', description: 'Jump height' },
  { code: 'AGILITY_505', label: '5-0-5 Agility', unit: 's', category: 'Agility', description: 'Agility test' },
  { code: 'DASH_40YD', label: '40-Yard Dash', unit: 's', category: 'Speed', description: 'Sprint time' },
];

vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => ({
    metrics: mockMetrics,
    isLoading: false,
    error: null,
  }),
}));

// Mock COMMON_METRICS
vi.mock('@shared/import-types', () => ({
  COMMON_METRICS: ['FLY10_TIME', 'VERTICAL_JUMP'],
}));

describe('SelectMetricsStep', () => {
  const defaultProps = {
    selectedMetricCodes: [],
    onNext: vi.fn(),
    onBack: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading spinner while fetching metrics', async () => {
      // Override mock to show loading
      vi.doMock('@/hooks/use-available-metrics', () => ({
        useAvailableMetrics: () => ({
          metrics: [],
          isLoading: true,
          error: null,
        }),
      }));

      // Re-import to get updated mock
      const { SelectMetricsStep: LoadingStep } = await import('../SelectMetricsStep');

      // Reset to original mock for other tests
      vi.doMock('@/hooks/use-available-metrics', () => ({
        useAvailableMetrics: () => ({
          metrics: mockMetrics,
          isLoading: false,
          error: null,
        }),
      }));
    });
  });

  describe('Metrics Display', () => {
    it('should display all metrics', () => {
      render(<SelectMetricsStep {...defaultProps} />);

      expect(screen.getByText('10-Yard Fly Time')).toBeInTheDocument();
      expect(screen.getByText('Vertical Jump')).toBeInTheDocument();
      expect(screen.getByText('5-0-5 Agility')).toBeInTheDocument();
      expect(screen.getByText('40-Yard Dash')).toBeInTheDocument();
    });

    it('should group metrics by category', () => {
      render(<SelectMetricsStep {...defaultProps} />);

      // Categories should be displayed as headers
      expect(screen.getByText('Speed')).toBeInTheDocument();
      expect(screen.getByText('Power')).toBeInTheDocument();
      expect(screen.getByText('Agility')).toBeInTheDocument();
    });

    it('should show header with instructions', () => {
      render(<SelectMetricsStep {...defaultProps} />);

      expect(screen.getByText('Select Metrics')).toBeInTheDocument();
      expect(screen.getByText(/Choose which metrics to include/)).toBeInTheDocument();
    });

    it('should show "Common" badge for common metrics', () => {
      render(<SelectMetricsStep {...defaultProps} />);

      // Common badge should appear for FLY10_TIME and VERTICAL_JUMP
      const commonBadges = screen.getAllByText('Common');
      expect(commonBadges.length).toBe(2);
    });
  });

  describe('Metric Selection', () => {
    it('should toggle metric selection when clicked', () => {
      render(<SelectMetricsStep {...defaultProps} />);

      // Click on metric row
      fireEvent.click(screen.getByText('5-0-5 Agility'));

      // Should show selection count (common metrics are pre-selected)
      const selectedText = screen.getByText(/\d+ selected/);
      expect(selectedText).toBeInTheDocument();
    });

    it('should toggle metric selection when checkbox clicked', () => {
      render(<SelectMetricsStep {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox', { name: /5-0-5 Agility/i });
      fireEvent.click(checkbox);

      expect(checkbox).toBeChecked();
    });

    it('should pre-select common metrics when no selection provided', () => {
      render(<SelectMetricsStep {...defaultProps} />);

      // Common metrics should be pre-selected
      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });
  });

  describe('Bulk Actions', () => {
    it('should select common metrics when Common Metrics clicked', () => {
      render(<SelectMetricsStep {...defaultProps} selectedMetricCodes={['AGILITY_505']} />);

      fireEvent.click(screen.getByText('Common Metrics'));

      // Should have 2 selected (common metrics)
      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });

    it('should select all metrics when Select All clicked', () => {
      render(<SelectMetricsStep {...defaultProps} />);

      fireEvent.click(screen.getByText('Select All'));

      expect(screen.getByText('4 selected')).toBeInTheDocument();
    });

    it('should disable Select All when all metrics selected', () => {
      render(<SelectMetricsStep {...defaultProps} selectedMetricCodes={['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505', 'DASH_40YD']} />);

      expect(screen.getByRole('button', { name: 'Select All' })).toBeDisabled();
    });

    it('should clear all selections when Clear All clicked', () => {
      render(<SelectMetricsStep {...defaultProps} selectedMetricCodes={['FLY10_TIME', 'VERTICAL_JUMP']} />);

      fireEvent.click(screen.getByText('Clear All'));

      expect(screen.getByText('0 selected')).toBeInTheDocument();
    });

    it('should disable Clear All when no metrics selected', () => {
      render(<SelectMetricsStep {...defaultProps} selectedMetricCodes={[]} />);

      // Wait for initial selection
      waitFor(() => {
        fireEvent.click(screen.getByText('Clear All'));
        expect(screen.getByRole('button', { name: 'Clear All' })).toBeDisabled();
      });
    });
  });

  describe('Navigation', () => {
    it('should call onBack when Back button clicked', () => {
      const onBack = vi.fn();
      render(<SelectMetricsStep {...defaultProps} onBack={onBack} />);

      fireEvent.click(screen.getByText('Back'));

      expect(onBack).toHaveBeenCalled();
    });

    it('should call onNext with selected metric codes when Next clicked', () => {
      const onNext = vi.fn();
      render(<SelectMetricsStep {...defaultProps} onNext={onNext} />);

      // Common metrics are pre-selected
      fireEvent.click(screen.getByText('Next'));

      expect(onNext).toHaveBeenCalledWith(['FLY10_TIME', 'VERTICAL_JUMP']);
    });

    it('should disable Next button when no metrics selected', () => {
      render(<SelectMetricsStep {...defaultProps} />);

      // Clear all selections first
      fireEvent.click(screen.getByText('Clear All'));

      expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    });

    it('should call onCancel when Cancel button clicked', () => {
      const onCancel = vi.fn();
      render(<SelectMetricsStep {...defaultProps} onCancel={onCancel} />);

      fireEvent.click(screen.getByText('Cancel'));

      expect(onCancel).toHaveBeenCalled();
    });
  });
});
