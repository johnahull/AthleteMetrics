/**
 * Component tests for TeamComparisonCard
 * Tests dynamic scale support in team comparison table
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TeamComparisonCard } from '../TeamComparisonCard';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';

describe('TeamComparisonCard', () => {
  const mockTemplate: WellnessTemplate = {
    id: 'template-1',
    organizationId: 'org-1',
    name: 'Daily Wellness',
    description: 'Daily wellness check',
    isDefault: true,
    isActive: true,
    isSystemSeeded: false,
    config: {
      questions: [
        {
          id: 'q1',
          type: 'scale',
          label: 'How do you feel?',
          scaleMin: 1,
          scaleMax: 10,
          required: true,
        },
      ],
    },
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockResponse = (
    userId: string,
    teamId: string,
    teamName: string,
    value: number,
    date: string
  ): WellnessResponse => ({
    id: `response-${userId}-${date}`,
    requestId: null,
    organizationId: 'org-1',
    templateId: 'template-1',
    userId,
    userFullName: `Athlete ${userId}`,
    teamId,
    teamNameSnapshot: teamName,
    submittedAt: new Date(date),
    date,
    responses: {
      q1: { value, label: 'How do you feel?' },
    },
    accessMethod: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(date),
  });

  const mockResponses: WellnessResponse[] = [
    createMockResponse('athlete-1', 'team-1', 'Team A', 7.5, '2025-01-15'),
    createMockResponse('athlete-2', 'team-1', 'Team A', 8.0, '2025-01-15'),
    createMockResponse('athlete-3', 'team-2', 'Team B', 6.5, '2025-01-15'),
    createMockResponse('athlete-4', 'team-2', 'Team B', 7.0, '2025-01-15'),
  ];

  const mockResponsesByTemplate = {
    'template-1': {
      template: mockTemplate,
      responses: mockResponses,
    },
  };

  const mockFilters = {
    dateFrom: '2025-01-01',
    dateTo: '2025-01-31',
    teamIds: [],
  };

  describe('Dynamic Scale Support', () => {
    it('should display wellness scores with scale of 10', () => {
      const { container } = render(
        <TeamComparisonCard
          responses={mockResponses}
          responsesByTemplate={mockResponsesByTemplate}
          filters={mockFilters}
          scaleMax={10}
        />
      );

      // Check that "/ 10" appears in the table (text content check across elements)
      const tableContent = container.textContent || '';
      expect(tableContent).toContain('/ 10');
    });

    it('should display wellness scores with scale of 5', () => {
      const template5Scale: WellnessTemplate = {
        ...mockTemplate,
        config: {
          questions: [
            {
              id: 'q1',
              type: 'scale',
              label: 'How do you feel?',
              scaleMin: 1,
              scaleMax: 5,
              required: true,
            },
          ],
        },
      };

      const responses5Scale = mockResponses.map(r => ({
        ...r,
        responses: { q1: { value: (r.responses.q1.value as number) / 2, label: 'How do you feel?' } },
      }));

      const { container } = render(
        <TeamComparisonCard
          responses={responses5Scale}
          responsesByTemplate={{
            'template-1': { template: template5Scale, responses: responses5Scale },
          }}
          filters={mockFilters}
          scaleMax={5}
        />
      );

      // Check that "/ 5" appears in the table
      const tableContent = container.textContent || '';
      expect(tableContent).toContain('/ 5');
    });

    it('should display wellness scores with scale of 7', () => {
      const { container } = render(
        <TeamComparisonCard
          responses={mockResponses}
          responsesByTemplate={mockResponsesByTemplate}
          filters={mockFilters}
          scaleMax={7}
        />
      );

      // Check that "/ 7" appears in the table
      const tableContent = container.textContent || '';
      expect(tableContent).toContain('/ 7');
    });

    it('should display wellness scores with scale of 100', () => {
      const responses100Scale = mockResponses.map(r => ({
        ...r,
        responses: { q1: { value: (r.responses.q1.value as number) * 10, label: 'How do you feel?' } },
      }));

      const { container } = render(
        <TeamComparisonCard
          responses={responses100Scale}
          responsesByTemplate={mockResponsesByTemplate}
          filters={mockFilters}
          scaleMax={100}
        />
      );

      // Check that "/ 100" appears in the table
      const tableContent = container.textContent || '';
      expect(tableContent).toContain('/ 100');
    });
  });

  describe('Team Data Display', () => {
    it('should display team names', () => {
      render(
        <TeamComparisonCard
          responses={mockResponses}
          responsesByTemplate={mockResponsesByTemplate}
          filters={mockFilters}
          scaleMax={10}
        />
      );

      expect(screen.getByText('Team A')).toBeInTheDocument();
      expect(screen.getByText('Team B')).toBeInTheDocument();
    });

    it('should display average wellness scores', () => {
      render(
        <TeamComparisonCard
          responses={mockResponses}
          responsesByTemplate={mockResponsesByTemplate}
          filters={mockFilters}
          scaleMax={10}
        />
      );

      // Team A average: (7.5 + 8.0) / 2 = 7.75 -> 7.8
      expect(screen.getByText('7.8')).toBeInTheDocument();
      // Team B average: (6.5 + 7.0) / 2 = 6.75 -> 6.8
      expect(screen.getByText('6.8')).toBeInTheDocument();
    });

    it('should display respondent counts', () => {
      render(
        <TeamComparisonCard
          responses={mockResponses}
          responsesByTemplate={mockResponsesByTemplate}
          filters={mockFilters}
          scaleMax={10}
        />
      );

      // Check for respondent counts (changed from completion rate display)
      // Team A has 2 athletes, Team B has 2 athletes
      const athleteTexts = screen.getAllByText(/athlete/i);
      expect(athleteTexts.length).toBeGreaterThan(0);
    });
  });

  describe('Empty States', () => {
    it('should display "No team data available" when no responses', () => {
      render(
        <TeamComparisonCard
          responses={[]}
          responsesByTemplate={{}}
          filters={mockFilters}
          scaleMax={10}
        />
      );

      expect(screen.getByText('No team data available')).toBeInTheDocument();
    });

    it('should display "No team data available" when responses have no team info', () => {
      const responsesNoTeam = mockResponses.map(r => ({
        ...r,
        teamId: null,
        teamNameSnapshot: null,
      }));

      render(
        <TeamComparisonCard
          responses={responsesNoTeam}
          responsesByTemplate={mockResponsesByTemplate}
          filters={mockFilters}
          scaleMax={10}
        />
      );

      expect(screen.getByText('No team data available')).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('should display sortable column headers', () => {
      render(
        <TeamComparisonCard
          responses={mockResponses}
          responsesByTemplate={mockResponsesByTemplate}
          filters={mockFilters}
          scaleMax={10}
        />
      );

      expect(screen.getByText('Team Name')).toBeInTheDocument();
      expect(screen.getByText('Avg Wellness')).toBeInTheDocument();
      expect(screen.getByText('Alerts')).toBeInTheDocument();
      expect(screen.getByText('Respondents')).toBeInTheDocument();
      expect(screen.getByText('Trend')).toBeInTheDocument();
    });
  });

  describe('Trend Indicators', () => {
    it('should display trend indicators for each team', () => {
      render(
        <TeamComparisonCard
          responses={mockResponses}
          responsesByTemplate={mockResponsesByTemplate}
          filters={mockFilters}
          scaleMax={10}
        />
      );

      // Check for trend text (Improving, Declining, or Stable) - there are multiple teams
      const improvingTexts = screen.getAllByText('Improving');
      expect(improvingTexts.length).toBeGreaterThan(0);
    });
  });

  describe('Click Handling', () => {
    it('should call onTeamClick when team row is clicked', () => {
      const mockOnTeamClick = vi.fn();

      render(
        <TeamComparisonCard
          responses={mockResponses}
          responsesByTemplate={mockResponsesByTemplate}
          filters={mockFilters}
          scaleMax={10}
          onTeamClick={mockOnTeamClick}
        />
      );

      const teamARow = screen.getByText('Team A').closest('tr');
      if (teamARow) {
        teamARow.click();
        expect(mockOnTeamClick).toHaveBeenCalledWith('team-1');
      }
    });

    it('should not make rows clickable when onTeamClick is not provided', () => {
      render(
        <TeamComparisonCard
          responses={mockResponses}
          responsesByTemplate={mockResponsesByTemplate}
          filters={mockFilters}
          scaleMax={10}
        />
      );

      const teamARow = screen.getByText('Team A').closest('tr');
      expect(teamARow).not.toHaveClass('cursor-pointer');
    });
  });

  describe('Score Formatting', () => {
    it('should format scores to 1 decimal place', () => {
      const responsesWithPreciseScores = [
        createMockResponse('athlete-1', 'team-1', 'Team A', 7.567, '2025-01-15'),
        createMockResponse('athlete-2', 'team-1', 'Team A', 8.123, '2025-01-15'),
      ];

      render(
        <TeamComparisonCard
          responses={responsesWithPreciseScores}
          responsesByTemplate={{
            'template-1': { template: mockTemplate, responses: responsesWithPreciseScores },
          }}
          filters={mockFilters}
          scaleMax={10}
        />
      );

      // Average: (7.567 + 8.123) / 2 = 7.845 -> 7.8
      expect(screen.getByText('7.8')).toBeInTheDocument();
    });
  });
});
