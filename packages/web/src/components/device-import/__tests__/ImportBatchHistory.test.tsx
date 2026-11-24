import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportBatchHistory } from '../ImportBatchHistory';

vi.mock('@/hooks/useImportBatches', () => ({
  useImportBatches: () => ({
    batches: [
      {
        id: 'b1', source: 'dashr_csv', fileName: 'runs.csv', status: 'completed', sessionDate: '2026-10-20',
        eventNameSnapshot: null, measurementsCreated: 6, runsImported: 2, athletesImported: 1,
        createdAt: '2026-10-20T10:00:00Z', committedAt: '2026-10-20T10:00:00Z',
      },
    ],
    isLoading: false,
    rollback: vi.fn(),
    isRollingBack: false,
    rollingBackBatchId: null,
  }),
}));

describe('ImportBatchHistory', () => {
  it('lists runs and measurements, and the rollback dialog reads as one sentence', async () => {
    render(<ImportBatchHistory organizationId="org-1" />);
    await userEvent.click(screen.getByText('Import History'));
    expect(screen.getByText('2 runs')).toBeTruthy();
    expect(screen.getByText('6 measurements')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /rollback/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('delete all 2 runs (6 measurements) imported from runs.csv');
  });
});
