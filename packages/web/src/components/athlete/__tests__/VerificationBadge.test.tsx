/**
 * VerificationBadge Component Tests
 *
 * Tests for the verification status badge on athlete measurements
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerificationBadge } from '../VerificationBadge';

describe('VerificationBadge', () => {
  describe('Verified state', () => {
    it('should render verified badge with green styling', () => {
      render(<VerificationBadge isVerified={true} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('bg-green-100');
      expect(badge).toHaveClass('text-green-800');
    });

    it('should display CheckCircle icon for verified state', () => {
      render(<VerificationBadge isVerified={true} />);

      // Check for SVG icon with appropriate test id or accessible label
      const icon = screen.getByTestId('check-circle-icon');
      expect(icon).toBeInTheDocument();
    });

    it('should display "Official" label text by default', () => {
      render(<VerificationBadge isVerified={true} />);

      expect(screen.getByText('Official')).toBeInTheDocument();
    });

    it('should have accessible tooltip for verified state', () => {
      render(<VerificationBadge isVerified={true} />);

      const badge = screen.getByRole('status');
      const ariaLabel = badge.getAttribute('aria-label');
      expect(ariaLabel?.toLowerCase()).toContain('official');
    });
  });

  describe('Unverified state', () => {
    it('should render unverified badge with amber styling', () => {
      render(<VerificationBadge isVerified={false} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('bg-amber-100');
      expect(badge).toHaveClass('text-amber-800');
    });

    it('should display AlertTriangle icon for unverified state', () => {
      render(<VerificationBadge isVerified={false} />);

      const icon = screen.getByTestId('alert-triangle-icon');
      expect(icon).toBeInTheDocument();
    });

    it('should display "Self-entered" label text by default', () => {
      render(<VerificationBadge isVerified={false} />);

      expect(screen.getByText('Self-entered')).toBeInTheDocument();
    });

    it('should have accessible tooltip for self-entered state', () => {
      render(<VerificationBadge isVerified={false} />);

      const badge = screen.getByRole('status');
      const ariaLabel = badge.getAttribute('aria-label');
      expect(ariaLabel?.toLowerCase()).toContain('self-entered');
    });
  });

  describe('Label visibility', () => {
    it('should show label when showLabel is true (default)', () => {
      render(<VerificationBadge isVerified={true} showLabel={true} />);

      expect(screen.getByText('Official')).toBeInTheDocument();
    });

    it('should hide label when showLabel is false', () => {
      render(<VerificationBadge isVerified={true} showLabel={false} />);

      expect(screen.queryByText('Official')).not.toBeInTheDocument();
    });

    it('should still show icon when label is hidden', () => {
      render(<VerificationBadge isVerified={true} showLabel={false} />);

      const icon = screen.getByTestId('check-circle-icon');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Size variants', () => {
    it('should apply medium size classes by default', () => {
      render(<VerificationBadge isVerified={true} />);

      const badge = screen.getByRole('status');
      // Medium size should use default text-sm
      expect(badge).toHaveClass('text-sm');
    });

    it('should apply small size classes when size is sm', () => {
      render(<VerificationBadge isVerified={true} size="sm" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('text-xs');
    });

    it('should apply medium size classes when size is md', () => {
      render(<VerificationBadge isVerified={true} size="md" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('text-sm');
    });
  });

  describe('Accessibility', () => {
    it('should have role="status" for screen readers', () => {
      render(<VerificationBadge isVerified={true} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should have descriptive aria-label for official state', () => {
      render(<VerificationBadge isVerified={true} />);

      const badge = screen.getByRole('status');
      const ariaLabel = badge.getAttribute('aria-label');
      expect(ariaLabel?.toLowerCase()).toContain('official');
      expect(ariaLabel?.toLowerCase()).toContain('coach');
    });

    it('should have descriptive aria-label for self-entered state', () => {
      render(<VerificationBadge isVerified={false} />);

      const badge = screen.getByRole('status');
      const ariaLabel = badge.getAttribute('aria-label');
      expect(ariaLabel?.toLowerCase()).toContain('self-entered');
      expect(ariaLabel?.toLowerCase()).toContain('athlete');
    });
  });
});
