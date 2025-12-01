/**
 * Tests for MetricEducationCard Component
 * Week 3: Metric Education & Context
 *
 * TDD: RED phase - These tests define the expected behavior
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricEducationCard } from '@/components/athlete/MetricEducationCard';

describe('MetricEducationCard', () => {
  describe('Rendering', () => {
    it('should render metric name as title', () => {
      render(<MetricEducationCard metric="FLY10_TIME" />);

      expect(screen.getByText('10-Yard Fly')).toBeInTheDocument();
    });

    it('should render metric description', () => {
      render(<MetricEducationCard metric="VERTICAL_JUMP" />);

      expect(screen.getByText(/explosive lower body power/i)).toBeInTheDocument();
    });

    it('should render "Why It Matters" section', () => {
      render(<MetricEducationCard metric="FLY10_TIME" />);

      expect(screen.getByText(/why it matters/i)).toBeInTheDocument();
    });

    it('should render sport relevance tags', () => {
      render(<MetricEducationCard metric="DASH_40YD" />);

      expect(screen.getByText('Football')).toBeInTheDocument();
      expect(screen.getByText('Track & Field')).toBeInTheDocument();
    });

    it('should render with data-testid for testing', () => {
      render(<MetricEducationCard metric="FLY10_TIME" />);

      expect(screen.getByTestId('metric-education-card')).toBeInTheDocument();
    });

    it('should have accessible card with aria-label', () => {
      render(<MetricEducationCard metric="FLY10_TIME" />);

      const card = screen.getByTestId('metric-education-card');
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('10-Yard Fly'));
    });
  });

  describe('Expandable Content', () => {
    it('should show "How to Improve" section collapsed by default', () => {
      render(<MetricEducationCard metric="VERTICAL_JUMP" />);

      // The button should be visible
      expect(screen.getByRole('button', { name: /how to improve/i })).toBeInTheDocument();

      // But the content should not be visible initially
      expect(screen.queryByText(/plyometric exercises/i)).not.toBeInTheDocument();
    });

    it('should expand "How to Improve" section when clicked', async () => {
      const user = userEvent.setup();
      render(<MetricEducationCard metric="VERTICAL_JUMP" />);

      const expandButton = screen.getByRole('button', { name: /how to improve/i });
      await user.click(expandButton);

      // Now the training tips should be visible
      expect(screen.getByText(/plyometric exercises/i)).toBeInTheDocument();
    });

    it('should collapse "How to Improve" section when clicked again', async () => {
      const user = userEvent.setup();
      render(<MetricEducationCard metric="VERTICAL_JUMP" />);

      const expandButton = screen.getByRole('button', { name: /how to improve/i });

      // Expand
      await user.click(expandButton);
      expect(screen.getByText(/plyometric exercises/i)).toBeInTheDocument();

      // Collapse
      await user.click(expandButton);
      expect(screen.queryByText(/plyometric exercises/i)).not.toBeInTheDocument();
    });

    it('should have aria-expanded attribute on collapsible button', async () => {
      const user = userEvent.setup();
      render(<MetricEducationCard metric="FLY10_TIME" />);

      const expandButton = screen.getByRole('button', { name: /how to improve/i });
      expect(expandButton).toHaveAttribute('aria-expanded', 'false');

      await user.click(expandButton);
      expect(expandButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('should display all training tips when expanded', async () => {
      const user = userEvent.setup();
      render(<MetricEducationCard metric="FLY10_TIME" />);

      const expandButton = screen.getByRole('button', { name: /how to improve/i });
      await user.click(expandButton);

      // FLY10_TIME has 5 training tips
      const listItems = screen.getAllByRole('listitem');
      expect(listItems.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Compact Mode', () => {
    it('should render in compact mode when prop is true', () => {
      render(<MetricEducationCard metric="FLY10_TIME" compact />);

      const card = screen.getByTestId('metric-education-card');
      expect(card).toHaveClass('compact');
    });

    it('should hide sport relevance in compact mode', () => {
      render(<MetricEducationCard metric="DASH_40YD" compact />);

      // Sport tags should not be visible in compact mode
      expect(screen.queryByText('Football')).not.toBeInTheDocument();
    });

    it('should show shorter description in compact mode', () => {
      render(<MetricEducationCard metric="VERTICAL_JUMP" compact />);

      // Should show metric name and brief description only
      expect(screen.getByText('Vertical Jump')).toBeInTheDocument();
      // Full "Why It Matters" should not be shown
      expect(screen.queryByText(/why it matters/i)).not.toBeInTheDocument();
    });
  });

  describe('Interactive Mode', () => {
    it('should call onClick when card is clicked in interactive mode', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<MetricEducationCard metric="FLY10_TIME" onClick={handleClick} />);

      const card = screen.getByTestId('metric-education-card');
      await user.click(card);

      expect(handleClick).toHaveBeenCalledWith('FLY10_TIME');
    });

    it('should have cursor pointer when onClick is provided', () => {
      render(<MetricEducationCard metric="FLY10_TIME" onClick={() => {}} />);

      const card = screen.getByTestId('metric-education-card');
      expect(card).toHaveClass('cursor-pointer');
    });

    it('should not call onClick when clicking expand button', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<MetricEducationCard metric="FLY10_TIME" onClick={handleClick} />);

      const expandButton = screen.getByRole('button', { name: /how to improve/i });
      await user.click(expandButton);

      // Click should not propagate to card
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Unknown Metric', () => {
    it('should render error state for unknown metric', () => {
      render(<MetricEducationCard metric="UNKNOWN_METRIC" />);

      expect(screen.getByText(/unknown metric/i)).toBeInTheDocument();
    });

    it('should not crash for unknown metric', () => {
      expect(() => {
        render(<MetricEducationCard metric="INVALID" />);
      }).not.toThrow();
    });
  });

  describe('Unit Display', () => {
    it('should show unit information for time-based metrics', () => {
      render(<MetricEducationCard metric="DASH_40YD" />);

      expect(screen.getByText(/seconds/i)).toBeInTheDocument();
    });

    it('should show unit information for distance metrics', () => {
      render(<MetricEducationCard metric="VERTICAL_JUMP" />);

      expect(screen.getByText(/inches/i)).toBeInTheDocument();
    });

    it('should indicate if lower or higher is better', () => {
      render(<MetricEducationCard metric="FLY10_TIME" />);

      expect(screen.getByText(/lower.*(better|faster)/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<MetricEducationCard metric="VERTICAL_JUMP" />);

      // Main title should be h3 (within card context)
      const heading = screen.getByRole('heading', { name: 'Vertical Jump' });
      expect(heading.tagName).toBe('H3');
    });

    it('should have keyboard accessible expand button', async () => {
      render(<MetricEducationCard metric="FLY10_TIME" />);

      const expandButton = screen.getByRole('button', { name: /how to improve/i });

      // Should be focusable
      expandButton.focus();
      expect(document.activeElement).toBe(expandButton);

      // Should respond to Enter key
      fireEvent.keyDown(expandButton, { key: 'Enter' });
      expect(screen.getByText(/flying sprints/i)).toBeInTheDocument();
    });

    it('should announce section state to screen readers', async () => {
      const user = userEvent.setup();
      render(<MetricEducationCard metric="FLY10_TIME" />);

      const expandButton = screen.getByRole('button', { name: /how to improve/i });

      // Should have aria-controls pointing to content
      expect(expandButton).toHaveAttribute('aria-controls');
    });
  });
});
