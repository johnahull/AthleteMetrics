/**
 * Tests for SelectTypeStep component
 *
 * This component is Step 1 of the Import Wizard:
 * - Shows two cards: Athletes and Measurements
 * - Cards are clickable and keyboard accessible
 * - Selecting a type triggers onSelect callback
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SelectTypeStep } from '../SelectTypeStep';

describe('SelectTypeStep', () => {
  const defaultProps = {
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should display header with instructions', () => {
      render(<SelectTypeStep {...defaultProps} />);

      expect(screen.getByText('What would you like to import?')).toBeInTheDocument();
      expect(screen.getByText(/Choose the type of data you want to import/)).toBeInTheDocument();
    });

    it('should render Athletes card', () => {
      render(<SelectTypeStep {...defaultProps} />);

      expect(screen.getByText('Athletes')).toBeInTheDocument();
      expect(screen.getByText(/Import athlete profiles/)).toBeInTheDocument();
    });

    it('should render Measurements card', () => {
      render(<SelectTypeStep {...defaultProps} />);

      expect(screen.getByText('Measurements')).toBeInTheDocument();
      expect(screen.getByText(/Import performance measurements/)).toBeInTheDocument();
    });

    it('should display Athletes features list', () => {
      render(<SelectTypeStep {...defaultProps} />);

      expect(screen.getByText('• Personal information')).toBeInTheDocument();
      expect(screen.getByText('• Team assignments')).toBeInTheDocument();
      expect(screen.getByText('• Contact details')).toBeInTheDocument();
      expect(screen.getByText('• Physical attributes')).toBeInTheDocument();
    });

    it('should display Measurements features list', () => {
      render(<SelectTypeStep {...defaultProps} />);

      expect(screen.getByText('• Speed tests (10-yard fly, 40-yard dash)')).toBeInTheDocument();
      expect(screen.getByText('• Power metrics (vertical jump)')).toBeInTheDocument();
      expect(screen.getByText('• Agility tests (5-0-5, T-test)')).toBeInTheDocument();
      expect(screen.getByText('• Custom metrics')).toBeInTheDocument();
    });
  });

  describe('Click Interactions', () => {
    it('should call onSelect with "athletes" when Athletes card clicked', () => {
      const onSelect = vi.fn();
      render(<SelectTypeStep onSelect={onSelect} />);

      fireEvent.click(screen.getByRole('button', { name: 'Import athletes' }));

      expect(onSelect).toHaveBeenCalledWith('athletes');
    });

    it('should call onSelect with "measurements" when Measurements card clicked', () => {
      const onSelect = vi.fn();
      render(<SelectTypeStep onSelect={onSelect} />);

      fireEvent.click(screen.getByRole('button', { name: 'Import measurements' }));

      expect(onSelect).toHaveBeenCalledWith('measurements');
    });
  });

  describe('Keyboard Accessibility', () => {
    it('should call onSelect when Enter pressed on Athletes card', () => {
      const onSelect = vi.fn();
      render(<SelectTypeStep onSelect={onSelect} />);

      const athletesCard = screen.getByRole('button', { name: 'Import athletes' });
      fireEvent.keyDown(athletesCard, { key: 'Enter' });

      expect(onSelect).toHaveBeenCalledWith('athletes');
    });

    it('should call onSelect when Space pressed on Athletes card', () => {
      const onSelect = vi.fn();
      render(<SelectTypeStep onSelect={onSelect} />);

      const athletesCard = screen.getByRole('button', { name: 'Import athletes' });
      fireEvent.keyDown(athletesCard, { key: ' ' });

      expect(onSelect).toHaveBeenCalledWith('athletes');
    });

    it('should call onSelect when Enter pressed on Measurements card', () => {
      const onSelect = vi.fn();
      render(<SelectTypeStep onSelect={onSelect} />);

      const measurementsCard = screen.getByRole('button', { name: 'Import measurements' });
      fireEvent.keyDown(measurementsCard, { key: 'Enter' });

      expect(onSelect).toHaveBeenCalledWith('measurements');
    });

    it('should call onSelect when Space pressed on Measurements card', () => {
      const onSelect = vi.fn();
      render(<SelectTypeStep onSelect={onSelect} />);

      const measurementsCard = screen.getByRole('button', { name: 'Import measurements' });
      fireEvent.keyDown(measurementsCard, { key: ' ' });

      expect(onSelect).toHaveBeenCalledWith('measurements');
    });

    it('should not call onSelect for other keys', () => {
      const onSelect = vi.fn();
      render(<SelectTypeStep onSelect={onSelect} />);

      const athletesCard = screen.getByRole('button', { name: 'Import athletes' });
      fireEvent.keyDown(athletesCard, { key: 'Tab' });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('should have tabIndex=0 for keyboard navigation', () => {
      render(<SelectTypeStep {...defaultProps} />);

      const athletesCard = screen.getByRole('button', { name: 'Import athletes' });
      const measurementsCard = screen.getByRole('button', { name: 'Import measurements' });

      expect(athletesCard).toHaveAttribute('tabindex', '0');
      expect(measurementsCard).toHaveAttribute('tabindex', '0');
    });
  });

  describe('Accessibility', () => {
    it('should have proper role="button" for both cards', () => {
      render(<SelectTypeStep {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Import athletes' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Import measurements' })).toBeInTheDocument();
    });

    it('should have aria-label for both cards', () => {
      render(<SelectTypeStep {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Import athletes' })).toHaveAttribute('aria-label', 'Import athletes');
      expect(screen.getByRole('button', { name: 'Import measurements' })).toHaveAttribute('aria-label', 'Import measurements');
    });
  });
});
