import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SendReportToAthleteDialog } from '../SendReportToAthleteDialog';

vi.mock('@/hooks/use-share-report', () => ({
  useShareReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  reportId: 'report-1',
  reportName: 'Spring Eval',
  athleteId: 'athlete-1',
  athleteName: 'Sam Young',
};

describe('SendReportToAthleteDialog under-13 guard', () => {
  it('warns and disables sending when shareBlockedUnder13 is true', () => {
    render(<SendReportToAthleteDialog {...baseProps} shareBlockedUnder13 />);

    expect(screen.getByTestId('under-13-share-warning')).toHaveTextContent(/under 13|date of birth/i);
    expect(screen.getByTestId('under-13-share-warning')).toHaveTextContent(/parent/i);
    expect(screen.getByTestId('confirm-share-button')).toBeDisabled();
  });

  it('keeps the send button enabled and shows no warning otherwise', () => {
    render(<SendReportToAthleteDialog {...baseProps} />);

    expect(screen.queryByTestId('under-13-share-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('confirm-share-button')).toBeEnabled();
  });
});
