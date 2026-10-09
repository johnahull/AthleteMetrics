/**
 * AM-FEAT-017: required, no-default "10-yard fly run-in" choice on the photo upload form.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhotoUpload } from '../../photo-upload';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ userOrganizations: [{ organizationId: 'org-1' }] }),
}));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ getLabel: (c: string) => c, labels: {}, isLoading: false }),
}));

const RUN_IN_MSG = 'Choose the run-in distance for 10-yard fly readings';

const success = {
  success: true,
  message: 'OCR processing completed',
  results: {
    totalExtracted: 1, successful: 1, failed: 0, ocrConfidence: 90, extractedText: 'x',
    processedData: [{ measurement: { metric: 'FLY10_TIME_RI15', value: '1.45', date: '2026-01-01' }, athlete: 'John Smith', rawText: 'x', confidence: 90 }],
    errors: [], warnings: [],
  },
};
const ok = (body: unknown) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });
const runInRequired422 = () => ({
  ok: false, status: 422, statusText: 'Unprocessable Entity',
  json: async () => ({ message: RUN_IN_MSG, code: 'FLY10_RUN_IN_REQUIRED' }),
});

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><PhotoUpload /></QueryClientProvider>);
}
function selectFile(container: HTMLElement, name = 'sheet.png') {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'image/png' })] } });
}
const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
const sentOptions = (call: number) => JSON.parse((fetchMock().mock.calls[call][1].body as FormData).get('options') as string);
const UPLOAD = /extract & import data/i;

describe('PhotoUpload fly-10 run-in', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok(success)) as any;
  });
  afterEach(() => cleanup());

  it('renders a labelled radio group with the five distances and nothing selected', () => {
    renderForm();
    const group = screen.getByRole('radiogroup', { name: /10-yard fly run-in/i });
    expect(group.closest('fieldset')).not.toBeNull();
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(5);
    radios.forEach((r) => expect(r).toHaveAttribute('aria-checked', 'false'));
    expect(group).toHaveAttribute('aria-required', 'true');
  });

  it('does not send flyRunIn until a choice is made, then sends it as a number', async () => {
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(sentOptions(0)).not.toHaveProperty('flyRunIn');
    await screen.findByText('OCR Results', {}, { timeout: 5000 });

    selectFile(container, 'b.png');
    fireEvent.click(screen.getByRole('radio', { name: '15 yd' }));
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(sentOptions(1).flyRunIn).toBe(15);
  });

  it('selecting a new file or Clear resets the choice', () => {
    const { container } = renderForm();
    selectFile(container, 'a.png');
    fireEvent.click(screen.getByRole('radio', { name: '10 yd' }));
    expect(screen.getByRole('radio', { name: '10 yd' })).toHaveAttribute('aria-checked', 'true');
    selectFile(container, 'b.png');
    expect(screen.getByRole('radio', { name: '10 yd' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('radio', { name: '30 yd' }));
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.getByRole('radio', { name: '30 yd' })).toHaveAttribute('aria-checked', 'false');
  });

  it('a 422 shows an inline alert tied to the fly picker, focuses it, keeps file and Upload, no results card', async () => {
    fetchMock().mockResolvedValueOnce(runInRequired422());
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));

    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(RUN_IN_MSG);
    expect(alert).toHaveTextContent(/nothing was saved/i);
    const group = screen.getByRole('radiogroup', { name: /10-yard fly run-in/i });
    expect(group).toHaveAttribute('aria-describedby', expect.stringContaining(alert.id));
    await waitFor(() => expect(group.contains(document.activeElement)).toBe(true));
    expect(screen.queryByText('OCR Results')).toBeNull();
    expect(screen.getByRole('button', { name: UPLOAD })).toBeEnabled();
    expect(screen.getByText('sheet.png')).toBeInTheDocument();
  });

  it('retry after a 422 sends the same file with the chosen run-in', async () => {
    fetchMock().mockResolvedValueOnce(runInRequired422());
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    await screen.findByRole('alert', {}, { timeout: 5000 });

    fireEvent.click(screen.getByRole('radio', { name: '5 yd' }));
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(sentOptions(1).flyRunIn).toBe(5);
    expect(((fetchMock().mock.calls[1][1].body as FormData).get('file') as File).name).toBe('sheet.png');
    expect(await screen.findByText('OCR Results', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the 5-0-5 and fly choices independent: one 422 only flags its own picker', async () => {
    fetchMock().mockResolvedValueOnce(runInRequired422());
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('radio', { name: /meters/i }));
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(screen.getByRole('radiogroup', { name: /5-0-5 protocol/i })).not.toHaveAttribute('aria-describedby');
    expect(screen.getByRole('radio', { name: /meters/i })).toHaveAttribute('aria-checked', 'true');
    expect(sentOptions(0).protocol505).toBe('M');
  });

  it('one 422 listing both choices flags both pickers; one retry carries both choices', async () => {
    fetchMock().mockResolvedValueOnce({
      ok: false, status: 422, statusText: 'Unprocessable Entity',
      json: async () => ({
        message: 'Choose meters or yards for 5-0-5 readings',
        code: 'PROTOCOL_505_REQUIRED',
        required: ['protocol505', 'flyRunIn'],
      }),
    });
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('Choose meters or yards for 5-0-5 readings');
    expect(alerts[1]).toHaveTextContent(RUN_IN_MSG);
    expect(screen.getByRole('radiogroup', { name: /5-0-5 protocol/i })).toHaveAttribute('aria-describedby', expect.stringContaining(alerts[0].id));
    expect(screen.getByRole('radiogroup', { name: /10-yard fly run-in/i })).toHaveAttribute('aria-describedby', expect.stringContaining(alerts[1].id));
    // focus goes to the first missing picker
    const first = screen.getByRole('radiogroup', { name: /5-0-5 protocol/i });
    await waitFor(() => expect(first.contains(document.activeElement)).toBe(true));
    expect(screen.queryByText('OCR Results')).toBeNull();

    // choosing one clears only its own alert
    fireEvent.click(screen.getByRole('radio', { name: /yards/i }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    fireEvent.click(screen.getByRole('radio', { name: '20 yd' }));
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(sentOptions(1)).toMatchObject({ protocol505: 'YD', flyRunIn: 20 });
  });

  it('a 422 that lists only the fly choice flags only the fly picker', async () => {
    fetchMock().mockResolvedValueOnce({
      ok: false, status: 422, statusText: 'Unprocessable Entity',
      json: async () => ({ message: RUN_IN_MSG, code: 'FLY10_RUN_IN_REQUIRED', required: ['flyRunIn'] }),
    });
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(RUN_IN_MSG);
  });
});
