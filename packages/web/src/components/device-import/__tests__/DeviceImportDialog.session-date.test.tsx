import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeviceImportDialog } from '../DeviceImportDialog';

vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ getLabel: (code: string) => code, types: {} }),
}));

const parseBodies: FormData[] = [];
const MAR_5 = { sessionDate: '2019-03-05', sessionLabel: 'Mar 5, 2019', athleteCount: 1, drillCount: 1 };
const MAR_7 = { sessionDate: '2019-03-07', sessionLabel: 'Mar 7, 2019', athleteCount: 1, drillCount: 1 };
// The dates in the uploaded file; like the server, a parse with a session date returns only that one
let fileSessions = [MAR_5];

beforeEach(() => {
  parseBodies.length = 0;
  fileSessions = [MAR_5];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/import/device/parse') parseBodies.push(init!.body as FormData);
    const body =
      url === '/api/csrf-token' ? { csrfToken: 't' }
      : url === '/api/import/device/parse' ? {
          batchId: 'b1',
          preview: {
            athletes: [],
            summary: { totalAthletes: 0, exactMatches: 0, fuzzyMatches: 0, partialMatches: 0, unmatched: 0, totalDrills: 0, outlierCount: 0 },
          },
          sessions: fileSessions.filter(s => {
            const chosen = (init!.body as FormData).get('sessionDate');
            return !chosen || s.sessionDate === chosen;
          }),
          warnings: [],
        }
      : [];
    return { ok: true, json: async () => body };
  }));
});
afterEach(() => vi.unstubAllGlobals());

const chooseAndParse = async (name: string) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File(['x'], name, { type: 'text/csv' }));
  await userEvent.click(screen.getByRole('button', { name: 'Parse File' }));
};

const renderDialog = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeviceImportDialog open onOpenChange={() => {}} organizationId="org-1" />
    </QueryClientProvider>,
  );

describe('DeviceImportDialog session date', () => {
  it('shows the session date that will be saved on the review and confirm steps', async () => {
    renderDialog();
    await chooseAndParse('one.csv');
    expect((await screen.findByTestId('session-date')).textContent).toContain('Mar 5, 2019');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByTestId('session-date').textContent).toContain('Mar 5, 2019');
  });

  it("does not send the previous file's session date with the next file", async () => {
    renderDialog();
    await chooseAndParse('one.csv');
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await chooseAndParse('two.csv');
    await screen.findByTestId('session-date');
    expect(parseBodies).toHaveLength(2);
    expect(parseBodies[1].get('sessionDate')).toBeNull();
  });

  it('sends the chosen date of a several-date file and shows it', async () => {
    fileSessions = [MAR_7, MAR_5];
    renderDialog();
    await chooseAndParse('two-dates.csv');
    await userEvent.click(await screen.findByText('Mar 7, 2019'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect((await screen.findByTestId('session-date')).textContent).toContain('Mar 7, 2019');
    expect(parseBodies.map(b => b.get('sessionDate'))).toEqual([null, '2019-03-07']);
  });
});
