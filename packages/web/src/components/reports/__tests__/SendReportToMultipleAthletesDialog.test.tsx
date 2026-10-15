import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SendReportToMultipleAthletesDialog } from '../SendReportToMultipleAthletesDialog';

vi.mock('@/hooks/use-share-report', () => ({
  useBulkShareReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReportShares: () => ({ data: { shares: [] } }),
}));

vi.mock('@/components/ui/team-athlete-selector', () => ({
  TeamAthleteSelector: () => <div data-testid="team-athlete-selector" />,
}));

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  reportId: 'report-1',
  reportName: 'Spring Eval',
  organizationId: 'org-1',
};

describe('SendReportToMultipleAthletesDialog under-13 note', () => {
  it('shows a muted helper line about skipped athletes that is not an alert', () => {
    render(<SendReportToMultipleAthletesDialog {...baseProps} />);

    const note = screen.getByTestId('under-13-bulk-note');
    expect(note).toHaveTextContent(/under 13/i);
    expect(note).toHaveTextContent(/date of birth/i);
    expect(note).toHaveTextContent(/parent/i);
    expect(note).toHaveClass('text-muted-foreground');
    expect(note).not.toHaveAttribute('role', 'alert');
    expect(note.closest('[role="alert"]')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
