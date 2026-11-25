import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportBatchHistory } from '../ImportBatchHistory';

const batch = (id: string, fileName: string, runsImported: number | null) => ({
  id, source: 'dashr_csv', fileName, status: 'completed', sessionDate: '2026-10-20',
  eventNameSnapshot: null, measurementsCreated: 6, runsImported, athletesImported: 1,
  createdAt: '2026-10-20T10:00:00Z', committedAt: '2026-10-20T10:00:00Z',
});

vi.mock('@/hooks/useImportBatches', () => ({
  useImportBatches: () => ({
    // b2: imported before runs were recorded, so its run count is unknown
    batches: [batch('b1', 'runs.csv', 2), batch('b2', 'legacy.csv', null)],
    isLoading: false,
    rollback: vi.fn(),
    isRollingBack: false,
    rollingBackBatchId: null,
  }),
}));

const rowOf = (fileName: string) => screen.getByText(fileName).closest('div.rounded-lg') as HTMLElement;

describe('ImportBatchHistory', () => {
  it('lists runs and measurements, and the rollback dialog reads as one sentence', async () => {
    render(<ImportBatchHistory organizationId="org-1" />);
    await userEvent.click(screen.getByText('Import History'));
    expect(within(rowOf('runs.csv')).getByText('2 runs')).toBeTruthy();
    expect(within(rowOf('runs.csv')).getByText('6 measurements')).toBeTruthy();

    await userEvent.click(within(rowOf('runs.csv')).getByRole('button', { name: /rollback/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('delete all 2 runs (6 measurements) imported from runs.csv');
  });

  it('shows no run count for a batch whose runs are unknown', async () => {
    render(<ImportBatchHistory organizationId="org-1" />);
    await userEvent.click(screen.getByText('Import History'));
    const row = rowOf('legacy.csv');
    expect(within(row).getByText('6 measurements')).toBeTruthy();
    expect(within(row).queryByText(/runs/)).toBeNull();

    await userEvent.click(within(row).getByRole('button', { name: /rollback/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('delete all 6 measurements imported from legacy.csv');
  });
});
