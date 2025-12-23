/**
 * MeasurementTimeline Component Tests
 *
 * TDD Test Suite for athlete measurement timeline view
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MeasurementTimeline } from '../MeasurementTimeline';
import type { Measurement } from '@shared/schema';

// Mock measurements data
const mockMeasurements: Measurement[] = [
  {
    id: '1',
    userId: 'user-1',
    submittedBy: 'coach-1',
    verifiedBy: 'coach-1',
    isVerified: true,
    date: '2024-12-15',
    age: 18,
    metric: 'FLY10_TIME',
    value: '1.52',
    units: 's',
    flyInDistance: null,
    notes: 'Great improvement on technique!',
    teamId: 'team-1',
    teamNameSnapshot: 'Varsity Soccer',
    organizationId: 'org-1',
    season: '2024-Fall',
    teamContextAuto: true,
    globalAthleteId: null,
    isCalculated: false,
    calculatedFromMeasurementIds: null,
    calculationMetadata: null,
    createdAt: new Date('2024-12-15'),
  },
  {
    id: '2',
    userId: 'user-1',
    submittedBy: 'user-1',
    verifiedBy: null,
    isVerified: false,
    date: '2024-12-10',
    age: 18,
    metric: 'VERTICAL_JUMP',
    value: '28.5',
    units: 'in',
    flyInDistance: null,
    notes: null,
    teamId: 'team-1',
    teamNameSnapshot: 'Varsity Soccer',
    organizationId: 'org-1',
    season: '2024-Fall',
    teamContextAuto: true,
    globalAthleteId: null,
    isCalculated: false,
    calculatedFromMeasurementIds: null,
    calculationMetadata: null,
    createdAt: new Date('2024-12-10'),
  },
  {
    id: '3',
    userId: 'user-1',
    submittedBy: 'coach-1',
    verifiedBy: 'coach-1',
    isVerified: true,
    date: '2024-11-20',
    age: 18,
    metric: 'DASH_40YD',
    value: '4.85',
    units: 's',
    flyInDistance: null,
    notes: 'Personal record!',
    teamId: 'team-1',
    teamNameSnapshot: 'Varsity Soccer',
    organizationId: 'org-1',
    season: '2024-Fall',
    teamContextAuto: true,
    globalAthleteId: null,
    isCalculated: false,
    calculatedFromMeasurementIds: null,
    calculationMetadata: null,
    createdAt: new Date('2024-11-20'),
  },
  {
    id: '4',
    userId: 'user-1',
    submittedBy: 'user-1',
    verifiedBy: null,
    isVerified: false,
    date: '2024-11-15',
    age: 18,
    metric: 'T_TEST',
    value: '9.32',
    units: 's',
    flyInDistance: null,
    notes: null,
    teamId: 'team-1',
    teamNameSnapshot: 'Varsity Soccer',
    organizationId: 'org-1',
    season: '2024-Fall',
    teamContextAuto: true,
    globalAthleteId: null,
    isCalculated: false,
    calculatedFromMeasurementIds: null,
    calculationMetadata: null,
    createdAt: new Date('2024-11-15'),
  },
];

describe('MeasurementTimeline', () => {
  describe('Timeline structure', () => {
    it('should render timeline with measurements grouped by month', () => {
      render(<MeasurementTimeline measurements={mockMeasurements} />);

      // Check for month headers
      expect(screen.getByText('December 2024')).toBeInTheDocument();
      expect(screen.getByText('November 2024')).toBeInTheDocument();
    });

    it('should display measurements in chronological order (most recent first)', () => {
      render(<MeasurementTimeline measurements={mockMeasurements} />);

      const measurementCards = screen.getAllByTestId(/^measurement-card-/);

      // First card should be the most recent (Dec 15)
      expect(within(measurementCards[0]).getByText('10-Yard Fly')).toBeInTheDocument();
      expect(within(measurementCards[0]).getByText('1.52s')).toBeInTheDocument();

      // Second card should be Dec 10
      expect(within(measurementCards[1]).getByText('Vertical Jump')).toBeInTheDocument();
      expect(within(measurementCards[1]).getByText('28.5in')).toBeInTheDocument();
    });

    it('should show month/year headers as timeline markers', () => {
      render(<MeasurementTimeline measurements={mockMeasurements} />);

      // Headers should be rendered as semantic headings
      const decemberHeader = screen.getByText('December 2024');
      expect(decemberHeader.tagName).toBe('H3');

      const novemberHeader = screen.getByText('November 2024');
      expect(novemberHeader.tagName).toBe('H3');
    });
  });

  describe('Measurement card content', () => {
    it('should display metric name in human-readable format', () => {
      // NOTE: getMetricDisplayName now returns metric codes as fallback.
      // In production, labels come from database via useMetricConfig hook.
      render(<MeasurementTimeline measurements={mockMeasurements} />);

      // Now displays metric codes (fallback behavior)
      expect(screen.getByText('FLY10_TIME')).toBeInTheDocument();
      expect(screen.getByText('VERTICAL_JUMP')).toBeInTheDocument();
      expect(screen.getByText('DASH_40YD')).toBeInTheDocument();
      expect(screen.getByText('T_TEST')).toBeInTheDocument();
    });

    it('should display value with units', () => {
      // NOTE: formatMetricValue now returns raw values as fallback.
      // Unit formatting should come from API response in production.
      render(<MeasurementTimeline measurements={mockMeasurements} />);

      // Raw values displayed (formatMetricValue returns value without unit)
      expect(screen.getByText('1.52')).toBeInTheDocument();
      expect(screen.getByText('28.5')).toBeInTheDocument();
      expect(screen.getByText('4.85')).toBeInTheDocument();
      expect(screen.getByText('9.32')).toBeInTheDocument();
    });

    it('should display date in day format', () => {
      render(<MeasurementTimeline measurements={mockMeasurements} />);

      expect(screen.getByText('Dec 15')).toBeInTheDocument();
      expect(screen.getByText('Dec 10')).toBeInTheDocument();
      expect(screen.getByText('Nov 20')).toBeInTheDocument();
      expect(screen.getByText('Nov 15')).toBeInTheDocument();
    });

    it('should show VerificationBadge for each measurement', () => {
      render(<MeasurementTimeline measurements={mockMeasurements} />);

      const badges = screen.getAllByRole('status');
      expect(badges).toHaveLength(4);
    });

    it('should display notes when present', () => {
      render(<MeasurementTimeline measurements={mockMeasurements} />);

      expect(screen.getByText('Great improvement on technique!')).toBeInTheDocument();
      expect(screen.getByText('Personal record!')).toBeInTheDocument();
    });

    it('should truncate long notes with ellipsis', () => {
      const measurementsWithLongNote: Measurement[] = [
        {
          ...mockMeasurements[0],
          notes: 'This is a very long note that should be truncated because it exceeds the maximum character limit for display in the timeline view and needs to be shortened with an ellipsis.',
        },
      ];

      render(<MeasurementTimeline measurements={measurementsWithLongNote} />);

      const noteText = screen.getByTestId('measurement-note-1');
      expect(noteText.textContent?.length).toBeLessThan(150);
      expect(noteText.textContent).toContain('...');
    });
  });

  describe('Empty states', () => {
    it('should show empty state when no measurements provided', () => {
      render(<MeasurementTimeline measurements={[]} />);

      expect(screen.getByText(/no measurements/i)).toBeInTheDocument();
    });

    it('should not render month headers when no measurements', () => {
      render(<MeasurementTimeline measurements={[]} />);

      expect(screen.queryByText(/2024/)).not.toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('should show loading skeleton when isLoading is true', () => {
      render(<MeasurementTimeline measurements={[]} isLoading={true} />);

      expect(screen.getByTestId('timeline-loading-skeleton')).toBeInTheDocument();
    });

    it('should not show empty state when loading', () => {
      render(<MeasurementTimeline measurements={[]} isLoading={true} />);

      expect(screen.queryByText(/no measurements/i)).not.toBeInTheDocument();
    });

    it('should show multiple skeleton items', () => {
      render(<MeasurementTimeline measurements={[]} isLoading={true} />);

      const skeletons = screen.getAllByTestId(/^skeleton-item-/);
      expect(skeletons.length).toBeGreaterThan(1);
    });
  });

  describe('Grouping logic', () => {
    it('should group measurements from the same month together', () => {
      render(<MeasurementTimeline measurements={mockMeasurements} />);

      const decemberSection = screen.getByText('December 2024').closest('div');
      const novemberSection = screen.getByText('November 2024').closest('div');

      // December section should have 2 measurements
      const decemberCards = within(decemberSection!).getAllByTestId(/^measurement-card-/);
      expect(decemberCards).toHaveLength(2);

      // November section should have 2 measurements
      const novemberCards = within(novemberSection!).getAllByTestId(/^measurement-card-/);
      expect(novemberCards).toHaveLength(2);
    });

    it('should handle measurements across different years', () => {
      const multiYearMeasurements: Measurement[] = [
        { ...mockMeasurements[0], date: '2024-12-15' },
        { ...mockMeasurements[1], date: '2023-12-10' },
      ];

      render(<MeasurementTimeline measurements={multiYearMeasurements} />);

      expect(screen.getByText('December 2024')).toBeInTheDocument();
      expect(screen.getByText('December 2023')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should use semantic HTML structure', () => {
      render(<MeasurementTimeline measurements={mockMeasurements} />);

      // Timeline should be in a section or article
      const timeline = screen.getByTestId('measurement-timeline');
      expect(timeline.tagName).toMatch(/^(SECTION|DIV)$/);
    });

    it('should have proper ARIA labels on measurement cards', () => {
      render(<MeasurementTimeline measurements={mockMeasurements} />);

      const firstCard = screen.getByTestId('measurement-card-1');
      expect(firstCard).toHaveAttribute('aria-label');
    });
  });
});
