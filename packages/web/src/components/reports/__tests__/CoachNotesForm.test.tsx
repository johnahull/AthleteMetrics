import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CoachingInsightsCard } from '../CoachingInsightsCard';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const saveNotes = vi.fn();
const generate = vi.fn();
vi.mock('@/lib/reports-api', () => ({
  useGenerateInsights: () => ({ mutate: generate, isPending: false }),
  useUpdateInsights: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCoachNotes: () => ({ mutateAsync: saveNotes, isPending: false }),
}));

const props = {
  reportId: 'r1',
  aiEnabled: true,
  initialInsights: null,
  canEditNotes: true,
  metricOptions: [{ code: 'DASH_40YD', label: '40 Yard Dash' }],
};

const open = () => fireEvent.click(screen.getByRole('button', { name: /coach notes for the ai/i }));

describe('CoachNotesForm in CoachingInsightsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveNotes.mockImplementation(async (n) => ({ coachNotes: n }));
  });

  it('renders collapsed for a writer, then shows goals first with placeholder', () => {
    render(<CoachingInsightsCard {...props} />);
    expect(screen.queryByLabelText(/^goals/i)).toBeNull();
    open();
    const goals = screen.getByLabelText(/^goals/i);
    expect(goals).toHaveAttribute('placeholder', expect.stringContaining('sub 5.0 40 yd dash'));
    expect(screen.getByLabelText(/what i saw/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/coach's limiter call/i)).toBeInTheDocument();
  });

  it('has a "Use in the family report" switch that is off by default, with help text', () => {
    render(<CoachingInsightsCard {...props} />);
    open();
    const sw = screen.getByRole('switch', { name: /use in the family report/i });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/keep injury, weight and private details out/i)).toBeInTheDocument();
  });

  it('saves shareWhatISaw: true when on with text, and omits it when off or with no text', async () => {
    render(<CoachingInsightsCard {...props} />);
    open();
    fireEvent.change(screen.getByLabelText(/what i saw/i), { target: { value: 'quick feet' } });
    fireEvent.click(screen.getByRole('switch', { name: /use in the family report/i }));
    fireEvent.click(screen.getByRole('button', { name: /save notes/i }));
    await waitFor(() => expect(saveNotes).toHaveBeenCalledWith({ whatISaw: 'quick feet', shareWhatISaw: true }));

    fireEvent.click(screen.getByRole('switch', { name: /use in the family report/i }));
    fireEvent.click(screen.getByRole('button', { name: /save notes/i }));
    await waitFor(() => expect(saveNotes).toHaveBeenLastCalledWith({ whatISaw: 'quick feet' }));
  });

  it('the switch is off and disabled until there is text in What I saw, with a hint', () => {
    render(<CoachingInsightsCard {...props} />);
    open();
    const sw = screen.getByRole('switch', { name: /use in the family report/i });
    expect(sw).toBeDisabled();
    expect(screen.getByText(/write what you saw first/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/what i saw/i), { target: { value: 'quick feet' } });
    expect(sw).not.toBeDisabled();
    expect(screen.queryByText(/write what you saw first/i)).toBeNull();
  });

  it('when the server locks the switch: disables it with the reason and tells the coach to regenerate', async () => {
    saveNotes.mockImplementationOnce(async () => ({ coachNotes: { whatISaw: 'quick feet' }, shareLocked: true }));
    render(<CoachingInsightsCard {...props} coachNotes={{ whatISaw: 'quick feet', shareWhatISaw: true }} />);
    fireEvent.click(screen.getByRole('button', { name: /save notes/i }));
    await waitFor(() => expect(screen.getByRole('switch', { name: /use in the family report/i })).toBeDisabled());
    expect(screen.getByRole('switch', { name: /use in the family report/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/not available for this athlete/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Regenerate the insights to remove coach observations');
  });

  it('shows the regenerate notice after a save turns the switch off, but not when it was never on', async () => {
    const { unmount } = render(<CoachingInsightsCard {...props} coachNotes={{ whatISaw: 'quick feet', shareWhatISaw: true }} />);
    fireEvent.click(screen.getByRole('switch', { name: /use in the family report/i }));
    fireEvent.click(screen.getByRole('button', { name: /save notes/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Regenerate the insights to remove coach observations'));
    unmount();

    render(<CoachingInsightsCard {...props} coachNotes={{ whatISaw: 'quick feet' }} />);
    fireEvent.click(screen.getByRole('button', { name: /save notes/i }));
    await waitFor(() => expect(saveNotes).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('prefills the switch from saved notes', () => {
    render(<CoachingInsightsCard {...props} coachNotes={{ whatISaw: 'x', shareWhatISaw: true }} />);
    expect(screen.getByRole('switch', { name: /use in the family report/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('starts open when notes exist and prefills them', () => {
    render(<CoachingInsightsCard {...props} coachNotes={{ goals: 'make varsity' }} />);
    expect(screen.getByLabelText(/^goals/i)).toHaveValue('make varsity');
  });

  it('keeps saved notes reachable for a writer after AI is turned off (read, edit, clear)', () => {
    render(<CoachingInsightsCard {...props} aiEnabled={false} coachNotes={{ goals: 'make varsity' }} />);
    expect(screen.getByLabelText(/^goals/i)).toHaveValue('make varsity');
    expect(screen.getByRole('button', { name: /^clear$/i })).toBeInTheDocument();
  });

  it.each([
    ['non-writer', { canEditNotes: false }],
    ['team/eval (no flag)', { canEditNotes: undefined }],
  ])('hides the form for %s', (_n, extra) => {
    render(<CoachingInsightsCard {...props} {...extra} />);
    expect(screen.queryByRole('button', { name: /coach notes for the ai/i })).toBeNull();
  });

  it('blocks over-length goals and shows the counter', async () => {
    render(<CoachingInsightsCard {...props} />);
    open();
    fireEvent.change(screen.getByLabelText(/^goals/i), { target: { value: 'x'.repeat(1001) } });
    expect(screen.getByText('1001 / 1000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save notes/i }));
    expect(await screen.findByText(/too big|at most 1000|1000 character/i)).toBeInTheDocument();
    expect(saveNotes).not.toHaveBeenCalled();
  });

  it('submits only filled fields in the schema shape', async () => {
    render(<CoachingInsightsCard {...props} />);
    open();
    fireEvent.change(screen.getByLabelText(/^goals/i), { target: { value: 'sub 5.0 40' } });
    fireEvent.change(screen.getByLabelText(/season phase/i), { target: { value: 'pre' } });
    fireEvent.change(screen.getByLabelText(/training age/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/restriction area/i), { target: { value: 'left ankle' } });
    fireEvent.change(screen.getByLabelText(/restriction status/i), { target: { value: 'light jog' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /pt-cleared/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /weather/i }));
    fireEvent.change(screen.getByLabelText(/coach's limiter call/i), { target: { value: 'DASH_40YD' } });
    fireEvent.change(screen.getByLabelText(/sessions per week/i), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(/next retest date/i), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: /save notes/i }));
    await waitFor(() => expect(saveNotes).toHaveBeenCalledTimes(1));
    expect(saveNotes.mock.calls[0][0]).toEqual({
      goals: 'sub 5.0 40',
      seasonPhase: 'pre',
      trainingAgeYears: 3,
      restriction: { area: 'left ankle', status: 'light jog', ptCleared: true },
      testDayFlags: ['weather'],
      limiterOverride: 'DASH_40YD',
      sessionsPerWeek: 4,
      nextRetestDate: '2026-12-01',
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' })));
  });

  it('clear sends an empty object', async () => {
    render(<CoachingInsightsCard {...props} coachNotes={{ goals: 'make varsity' }} />);
    fireEvent.click(screen.getByRole('button', { name: /^clear/i }));
    await waitFor(() => expect(saveNotes).toHaveBeenCalledWith({}));
    await waitFor(() => expect(screen.getByLabelText(/^goals/i)).toHaveValue(''));
  });

  it('toasts on save error', async () => {
    saveNotes.mockRejectedValueOnce(new Error('boom'));
    render(<CoachingInsightsCard {...props} />);
    open();
    fireEvent.change(screen.getByLabelText(/^goals/i), { target: { value: 'g' } });
    fireEvent.click(screen.getByRole('button', { name: /save notes/i }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'boom' })),
    );
  });

  it('generate saves a dirty form first, then generates', async () => {
    render(<CoachingInsightsCard {...props} />);
    open();
    fireEvent.change(screen.getByLabelText(/^goals/i), { target: { value: 'make varsity' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(saveNotes).toHaveBeenCalledWith({ goals: 'make varsity' });
    expect(saveNotes.mock.invocationCallOrder[0]).toBeLessThan(generate.mock.invocationCallOrder[0]);
  });

  it('generate does not save a clean form, and does not generate when save fails', async () => {
    const { unmount } = render(<CoachingInsightsCard {...props} coachNotes={{ goals: 'a' }} />);
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(saveNotes).not.toHaveBeenCalled();
    unmount();

    saveNotes.mockRejectedValueOnce(new Error('nope'));
    render(<CoachingInsightsCard {...props} coachNotes={{ goals: 'a' }} />);
    fireEvent.change(screen.getByLabelText(/^goals/i), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));
    await waitFor(() => expect(saveNotes).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('saves dirty notes before Write Insights and keeps them if the save fails', async () => {
    render(<CoachingInsightsCard {...props} />);
    open();
    fireEvent.change(screen.getByLabelText(/^goals/i), { target: { value: 'keep me' } });
    saveNotes.mockRejectedValueOnce(new Error('413 too large'));
    fireEvent.click(screen.getByRole('button', { name: /write insights/i }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: '413 too large' })),
    );
    expect(screen.getByLabelText(/^goals/i)).toHaveValue('keep me');
    expect(screen.queryByTestId('insights-editor')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /write insights/i }));
    expect(await screen.findByTestId('insights-editor')).toBeInTheDocument();
    expect(saveNotes).toHaveBeenLastCalledWith({ goals: 'keep me' });
  });

  it('saves dirty notes before Edit', async () => {
    render(<CoachingInsightsCard {...props} initialInsights="Some insights" generatedAt="2026-01-01T00:00:00Z" />);
    open();
    fireEvent.change(screen.getByLabelText(/^goals/i), { target: { value: 'g2' } });
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }));
    expect(await screen.findByTestId('insights-editor')).toBeInTheDocument();
    expect(saveNotes).toHaveBeenCalledWith({ goals: 'g2' });
  });

  it('two rapid Generate clicks save once and generate once', async () => {
    render(<CoachingInsightsCard {...props} />);
    open();
    fireEvent.change(screen.getByLabelText(/^goals/i), { target: { value: 'g' } });
    const btn = screen.getByRole('button', { name: /generate insights/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(saveNotes).toHaveBeenCalledTimes(1);
  });

  it('invalid form aborts Generate', async () => {
    render(<CoachingInsightsCard {...props} />);
    open();
    fireEvent.change(screen.getByLabelText(/^goals/i), { target: { value: 'x'.repeat(1001) } });
    fireEvent.click(screen.getByRole('button', { name: /generate insights/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText(/^goals/i)).toHaveAttribute('aria-invalid', 'true');
    expect(saveNotes).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it('hides the form when COPPA-locked, but not when AI is merely disabled', () => {
    const { unmount } = render(<CoachingInsightsCard {...props} aiConsentGranted={false} />);
    expect(screen.queryByRole('button', { name: /coach notes for the ai/i })).toBeNull();
    unmount();
    render(<CoachingInsightsCard {...props} aiEnabled={false} />);
    expect(screen.getByRole('button', { name: /coach notes for the ai/i })).toBeInTheDocument();
  });

  it('appends a saved limiter missing from the metric list', () => {
    render(<CoachingInsightsCard {...props} coachNotes={{ limiterOverride: 'OLD_METRIC' }} />);
    expect(screen.getByRole('option', { name: 'OLD_METRIC' })).toBeInTheDocument();
    expect(screen.getByLabelText(/coach's limiter call/i)).toHaveValue('OLD_METRIC');
  });

  it('two same-tick Generate clicks (no re-render between them) save once and generate once', async () => {
    render(<CoachingInsightsCard {...props} />);
    open();
    fireEvent.change(screen.getByLabelText(/^goals/i), { target: { value: 'g' } });
    const btn = screen.getByRole('button', { name: /generate insights/i });
    act(() => {
      btn.click();
      btn.click();
    });
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(saveNotes).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['restriction area', /restriction area/i, 'cn-r-area-err'],
    ['restriction status', /restriction status/i, 'cn-r-status-err'],
  ])('marks an invalid %s with aria-invalid and a described error', async (_n, label, errId) => {
    render(<CoachingInsightsCard {...props} />);
    open();
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'x'.repeat(201) } });
    fireEvent.click(screen.getByRole('button', { name: /save notes/i }));
    const input = screen.getByLabelText(label);
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(input).toHaveAttribute('aria-describedby', errId);
    expect(document.getElementById(errId)).toHaveAttribute('role', 'alert');
  });

  it('hides the form on a COPPA-locked card that already has insights', () => {
    render(<CoachingInsightsCard {...props} initialInsights="Some text" aiConsentGranted={false} />);
    expect(screen.queryByRole('button', { name: /coach notes for the ai/i })).toBeNull();
  });

  it('two same-tick Edit clicks save the dirty notes once', async () => {
    render(<CoachingInsightsCard {...props} initialInsights="Some text" />);
    open();
    fireEvent.change(screen.getByLabelText(/^goals/i), { target: { value: 'g2' } });
    const btn = screen.getByRole('button', { name: /^edit/i });
    act(() => {
      btn.click();
      btn.click();
    });
    expect(await screen.findByTestId('insights-editor')).toBeInTheDocument();
    expect(saveNotes).toHaveBeenCalledTimes(1);
  });
});
