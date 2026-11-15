/**
 * "AI insights prompt" card on the site admin page.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminPage from '../admin';

let mockUser: Record<string, unknown> | null;
let stored: Record<string, string> | null;
const mockToast = vi.fn();
const mockApiRequest = vi.fn();
let invalidateSpy: any;

const DEFAULTS = {
  role: 'You are an expert athletic performance coach.',
  philosophy: '',
  toneParent: 'Write for a parent: warm, plain language.',
  toneAthlete: 'Write for the athlete: direct and motivating.',
  toneCoach: 'Write for the coach: technical and concise.',
  analysisChecklist: 'Check each item against the data.',
};

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mockUser, isLoading: false }) }));
vi.mock('wouter', () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/admin', vi.fn()],
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/components/notifications/admin-notification-settings-card', () => ({ AdminNotificationSettingsCard: () => null }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: (...a: unknown[]) => mockApiRequest(...a) }));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const key = queryKey[0] as string;
          if (key === '/api/site-settings') return { aiModel: 'x', wellnessModuleEnabled: true, sprintFvEnabled: false, aiPromptOverrides: stored };
          if (key === '/api/site-settings/ai-prompt-defaults')
            return { defaults: DEFAULTS, roleMaxLength: 200, checklistLines: 7, systemPrompt: 'SYSTEM PROMPT TEXT', systemPromptNote: 'Read-only note' };
          return { all: [] };
        },
      },
    },
  });
  invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  return render(<QueryClientProvider client={queryClient}><AdminPage /></QueryClientProvider>);
}

const field = (label: string) => screen.findByLabelText(label);

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { id: 'u1', username: 'sa', role: 'site_admin', isSiteAdmin: true };
  stored = null;
  mockApiRequest.mockResolvedValue({ json: async () => ({}) });
});

describe('AI insights prompt card', () => {
  it('shows the banner and default text as placeholders', async () => {
    renderPage();
    expect(await screen.findByText(/changes apply to all organizations immediately/i)).toBeInTheDocument();
    const tone = await field('Parent tone');
    await waitFor(() => expect(tone).toHaveAttribute('placeholder', DEFAULTS.toneParent));
    expect(tone).toHaveValue('');
    expect(screen.getByLabelText('Role')).toHaveAttribute('placeholder', DEFAULTS.role);
    for (const l of ['Coaching philosophy', 'Athlete tone', 'Coach tone', 'Analysis checklist'])
      expect(screen.getByLabelText(l)).toBeInTheDocument();
  });

  it('Role is a single-line input and says so', async () => {
    renderPage();
    const role = await field('Role');
    expect(role.tagName).toBe('INPUT');
    expect(screen.getByText(/one line, up to 200 characters/i)).toBeInTheDocument();
  });

  it('Role over 200 characters shows the 200 limit, not 1500', async () => {
    renderPage();
    fireEvent.change(await field('Role'), { target: { value: 'r'.repeat(201) } });
    expect(screen.getByText('201 / 200')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save prompt/i }));
    expect(await screen.findByText(/Role must be 200 characters or less/)).toBeInTheDocument();
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('a checklist with 6 lines is blocked with the schema message and the 7-line rule is in the help', async () => {
    renderPage();
    expect(await screen.findByText(/exactly 7 lines/i)).toBeInTheDocument();
    fireEvent.change(await field('Analysis checklist'), { target: { value: 'a\nb\nc\nd\ne\nf' } });
    fireEvent.click(screen.getByRole('button', { name: /save prompt/i }));
    expect(await screen.findByText(/needs exactly 7 lines/i)).toBeInTheDocument();
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('a checklist with 7 lines is saved', async () => {
    renderPage();
    const seven = 'a\nb\nc\nd\ne\nf\ng';
    fireEvent.change(await field('Analysis checklist'), { target: { value: seven } });
    fireEvent.click(screen.getByRole('button', { name: /save prompt/i }));
    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith('PATCH', '/api/site-settings', { aiPromptOverrides: { analysisChecklist: seven } }),
    );
  });

  it('says which characters are removed on save', async () => {
    renderPage();
    expect(await screen.findByText(/removed when you save/i)).toBeInTheDocument();
  });

  it('after a save the fields show the sanitized text and the form is clean', async () => {
    renderPage();
    const tone = await field('Parent tone');
    fireEvent.change(tone, { target: { value: '# <b>Hi</b> {{x}}' } });
    fireEvent.click(screen.getByRole('button', { name: /save prompt/i }));
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledWith('PATCH', '/api/site-settings', { aiPromptOverrides: { toneParent: 'bHi/b x' } }));
    await waitFor(() => expect(tone).toHaveValue('bHi/b x'));
    expect(screen.getByRole('button', { name: /save prompt/i })).toBeDisabled();
  });

  it('Save is disabled until something changes', async () => {
    renderPage();
    const save = await screen.findByRole('button', { name: /save prompt/i });
    expect(save).toBeDisabled();
    fireEvent.change(await field('Parent tone'), { target: { value: 'x' } });
    expect(save).toBeEnabled();
  });

  it('maps a server 400 to the field and never shows raw JSON', async () => {
    mockApiRequest.mockRejectedValue(
      new Error('400: {"message":"Validation error","errors":[{"path":["aiPromptOverrides","toneParent"],"message":"Server says no"}]}'),
    );
    renderPage();
    fireEvent.change(await field('Parent tone'), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: /save prompt/i }));
    expect(await screen.findByText('Server says no')).toBeInTheDocument();
    const call = mockToast.mock.calls[mockToast.mock.calls.length - 1][0];
    expect(call.variant).toBe('destructive');
    expect(String(call.description)).not.toMatch(/[{}]/);
  });

  it('a 400 without field errors shows its message, not JSON', async () => {
    mockApiRequest.mockRejectedValue(new Error('400: {"message":"Selected thing is bad"}'));
    renderPage();
    fireEvent.change(await field('Parent tone'), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: /save prompt/i }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Selected thing is bad' })));
  });

  it('gives each field a counter and helper text linked by aria-describedby', async () => {
    renderPage();
    const tone = await field('Parent tone');
    expect(screen.getAllByText('0 / 1500').length).toBe(5);
    expect(screen.getByText('0 / 200')).toBeInTheDocument();
    const ids = tone.getAttribute('aria-describedby')!.split(' ');
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids.every((id) => document.getElementById(id))).toBe(true);
  });

  it('loads stored overrides into the fields', async () => {
    stored = { toneParent: 'Be kind.' };
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Parent tone')).toHaveValue('Be kind.'));
    expect(screen.getByText('8 / 1500')).toBeInTheDocument();
  });

  it('save sends the whole object with only non-empty fields', async () => {
    stored = { toneParent: 'Be kind.' };
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Parent tone')).toHaveValue('Be kind.'));
    fireEvent.change(screen.getByLabelText('Coach tone'), { target: { value: 'Be brief.' } });
    fireEvent.click(screen.getByRole('button', { name: /save prompt/i }));
    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith('PATCH', '/api/site-settings', {
        aiPromptOverrides: { toneParent: 'Be kind.', toneCoach: 'Be brief.' },
      }),
    );
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/updated|saved/i) })));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/site-settings'] });
  });

  it('per-field reset clears only that field', async () => {
    stored = { toneParent: 'Be kind.', toneCoach: 'Be brief.' };
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Parent tone')).toHaveValue('Be kind.'));
    fireEvent.click(screen.getByRole('button', { name: /reset parent tone to default/i }));
    expect(screen.getByLabelText('Parent tone')).toHaveValue('');
    expect(screen.getByLabelText('Coach tone')).toHaveValue('Be brief.');
    fireEvent.click(screen.getByRole('button', { name: /save prompt/i }));
    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith('PATCH', '/api/site-settings', { aiPromptOverrides: { toneCoach: 'Be brief.' } }),
    );
  });

  it('reset all asks for confirmation, then clears every field; save sends {}', async () => {
    stored = { toneParent: 'Be kind.', toneCoach: 'Be brief.' };
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Parent tone')).toHaveValue('Be kind.'));
    fireEvent.click(screen.getByRole('button', { name: /reset all to defaults/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(screen.getByLabelText('Parent tone')).toHaveValue('Be kind.'); // not yet
    fireEvent.click(within(dialog).getByRole('button', { name: /reset all/i }));
    await waitFor(() => expect(screen.getByLabelText('Parent tone')).toHaveValue(''));
    expect(screen.getByLabelText('Coach tone')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: /save prompt/i }));
    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith('PATCH', '/api/site-settings', { aiPromptOverrides: {} }),
    );
  });

  it('cancelling the reset-all dialog keeps the text', async () => {
    stored = { toneParent: 'Be kind.' };
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Parent tone')).toHaveValue('Be kind.'));
    fireEvent.click(screen.getByRole('button', { name: /reset all to defaults/i }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Parent tone')).toHaveValue('Be kind.');
  });

  it('blocks save and shows an error when a field is over 1500 characters', async () => {
    renderPage();
    const tone = await field('Parent tone');
    fireEvent.change(tone, { target: { value: 'a'.repeat(1501) } });
    fireEvent.click(screen.getByRole('button', { name: /save prompt/i }));
    expect(await screen.findByText(/1500 characters or less/i)).toBeInTheDocument();
    expect(tone).toHaveAttribute('aria-invalid', 'true');
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('shows an error toast when the save fails', async () => {
    mockApiRequest.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.change(await field('Parent tone'), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: /save prompt/i }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'boom' })),
    );
  });

  it('shows the assembled system prompt read-only, with a note that tone lives in the user message', async () => {
    renderPage();
    const trigger = await screen.findByRole('button', { name: /show assembled system prompt/i });
    expect(screen.queryByText('SYSTEM PROMPT TEXT')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(await screen.findByText('SYSTEM PROMPT TEXT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide assembled system prompt/i })).toBeInTheDocument();
    expect(screen.getByText(/user message/i)).toBeInTheDocument();
  });

  it('is not rendered for a non-site-admin', () => {
    mockUser = { id: 'u2', username: 'oa', role: 'org_admin', isSiteAdmin: false };
    renderPage();
    expect(screen.queryByText(/ai insights prompt/i)).not.toBeInTheDocument();
  });
});
