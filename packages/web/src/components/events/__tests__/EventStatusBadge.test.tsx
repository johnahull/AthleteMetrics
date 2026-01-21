/**
 * Unit tests for EventStatusBadge component
 *
 * Tests the display of event status with appropriate labels and styling.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventStatusBadge } from '../EventStatusBadge';

describe('EventStatusBadge', () => {
  describe('Status Labels', () => {
    it('should display "Draft" for draft status', () => {
      render(<EventStatusBadge status="draft" />);
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('should display "Published" for published status', () => {
      render(<EventStatusBadge status="published" />);
      expect(screen.getByText('Published')).toBeInTheDocument();
    });

    it('should display "Active" for active status', () => {
      render(<EventStatusBadge status="active" />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should display "Completed" for completed status', () => {
      render(<EventStatusBadge status="completed" />);
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should display "Cancelled" for cancelled status', () => {
      render(<EventStatusBadge status="cancelled" />);
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  describe('Status Styling', () => {
    it('should have gray styling for draft status', () => {
      render(<EventStatusBadge status="draft" />);
      const badge = screen.getByText('Draft');
      expect(badge).toHaveClass('bg-gray-100', 'text-gray-700');
    });

    it('should have blue styling for published status', () => {
      render(<EventStatusBadge status="published" />);
      const badge = screen.getByText('Published');
      expect(badge).toHaveClass('bg-blue-100', 'text-blue-700');
    });

    it('should have green styling for active status', () => {
      render(<EventStatusBadge status="active" />);
      const badge = screen.getByText('Active');
      expect(badge).toHaveClass('bg-green-100', 'text-green-700');
    });

    it('should have purple styling for completed status', () => {
      render(<EventStatusBadge status="completed" />);
      const badge = screen.getByText('Completed');
      expect(badge).toHaveClass('bg-purple-100', 'text-purple-700');
    });

    it('should have red styling for cancelled status', () => {
      render(<EventStatusBadge status="cancelled" />);
      const badge = screen.getByText('Cancelled');
      expect(badge).toHaveClass('bg-red-100', 'text-red-700');
    });
  });

  describe('Custom className', () => {
    it('should apply custom className', () => {
      render(<EventStatusBadge status="active" className="my-custom-class" />);
      const badge = screen.getByText('Active');
      expect(badge).toHaveClass('my-custom-class');
    });

    it('should merge custom className with status styling', () => {
      render(<EventStatusBadge status="draft" className="mt-2" />);
      const badge = screen.getByText('Draft');
      expect(badge).toHaveClass('bg-gray-100', 'mt-2');
    });
  });

  describe('Edge Cases', () => {
    it('should fallback to draft styling for unknown status', () => {
      // @ts-expect-error Testing unknown status
      render(<EventStatusBadge status="unknown" />);
      // Should fall back to draft config
      const badge = screen.getByText('Draft');
      expect(badge).toHaveClass('bg-gray-100');
    });
  });
});
