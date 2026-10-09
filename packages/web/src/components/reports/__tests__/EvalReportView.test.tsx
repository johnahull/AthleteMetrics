import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EvalReportView, EvalReportBody, formatEvalEventDate } from '../EvalReportView';
import { SharedReportCard } from '../SharedReportCard';
import { AthleteReportView } from '../AthleteReportView';
import type { Report, EvalReportModelView, EvalMetricResultView } from '@/types/report-types';
import { exportEventReportPDF } from '@/lib/events-api';
import { LOAD_LABELS, BALANCE_LABELS, LEFT_RIGHT_SUFFIX } from '@shared/eval-report-copy';
import { LOAD_LABELS as API_LOAD, BALANCE_LABELS as API_BALANCE, PDF_COPY } from '../../../../../api/services/eval-report/copy';

vi.mock('@/lib/events-api', () => ({ exportEventReportPDF: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
// The individual view generates data; an eval must never reach it
const generate = vi.fn();
vi.mock('@/hooks/use-reports', () => ({ useGenerateReport: () => ({ mutate: generate, isPending: false, isError: false }) }));

const model: EvalReportModelView = {
  athlete: { name: 'Avery Stone', age: 15, graduationYear: 2028, sport: 'Soccer', team: 'U16' },
  eventDate: '2026-05-01',
  metrics: [
    {
      key: 'DASH_10', code: 'DASH_10YD', label: '10-yard dash', value: 1.85, unit: 's',
      comparison: { kind: 'average', name: null, averageValue: 1.9, status: 'at_or_better', distancePct: 2 },
      collegeStandard: null, collegeGauge: false, trend: null,
    },
    {
      key: 'CMJ_HOH', code: 'JUMP_CMJ', label: 'Jump height', value: 18, unit: 'in',
      comparison: null, collegeStandard: null, collegeGauge: false, trend: null,
    },
  ],
  freshAndHealthy: { load: 'medium', balance: { status: 'balanced', label: 'Balanced', lsiPercent: 97 }, movement: 'Efficient' },
  strengths: ['DASH_10'],
  coachNote: 'Strong day <b>today</b>',
};

const evalReport = (config: Record<string, unknown> = { eventId: 'e1', athleteId: 'a1', metrics: [], model }): Report =>
  ({
    id: 'r1', organizationId: 'o1', createdBy: 'u1', name: 'Eval - Avery', reportType: 'eval',
    config, isTemplate: false, isPinned: false, createdAt: '2026-05-01T00:00:00Z',
  }) as unknown as Report;

describe('EvalReportView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('formats the event date without a timezone shift', () => {
    expect(formatEvalEventDate('2026-05-01')).toBe('May 1, 2026');
    expect(formatEvalEventDate(undefined)).toBe('');
  });

  it('shows the header, comparisons, Fresh & Healthy, strengths and the coach note', () => {
    render(<EvalReportView report={evalReport()} />);
    expect(screen.getByText('Avery Stone')).toBeInTheDocument();
    expect(screen.getByText('Eval report')).toBeInTheDocument();
    expect(screen.getByTestId('eval-event-date')).toHaveTextContent('May 1, 2026');
    expect(screen.getByTestId('eval-metric-DASH_10YD')).toHaveTextContent('1.85 s');
    expect(screen.getByText('At or better than the age-group average')).toBeInTheDocument();
    // a metric with no comparison shows value and unit only
    expect(screen.getByTestId('eval-metric-JUMP_CMJ')).toHaveTextContent('18 in');
    expect(screen.getByText(/Fresh & Healthy/)).toBeInTheDocument();
    expect(screen.getByText('Balanced')).toBeInTheDocument();
    expect(screen.getByText('Efficient')).toBeInTheDocument();
    expect(screen.getByText('10-yard dash', { selector: 'p' })).toBeInTheDocument();
    // coach note is plain text, not HTML
    expect(screen.getByText('Strong day <b>today</b>')).toBeInTheDocument();
  });

  it('has real headings, a captioned progress bar and the PDF extras', () => {
    const full = {
      ...model,
      metrics: [
        { ...model.metrics[0], comparison: { kind: 'tiers', comparison: { benchmarkName: 'Varsity (16-18)', tierName: 'Silver', tierGroupName: 'Varsity (16-18)', tierOrder: 2, allTiers: [{}, {}, {}, {}] } } },
        model.metrics[1],
      ],
      developmentAreas: ['CMJ_HOH'],
      limiter: 'CMJ_HOH',
    } as unknown as EvalReportModelView;
    render(<EvalReportBody model={full} />);
    expect(screen.getByRole('heading', { name: 'Fresh & Healthy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /compares for their age/ })).toBeInTheDocument();
    expect(screen.getByText('Compared with the age group')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', expect.stringContaining('percent'));
    // the raw benchmark row name is never printed
    expect(screen.queryByText(/Varsity/)).not.toBeInTheDocument();
    expect(screen.getByText(/Biggest opportunity:/)).toBeInTheDocument();
    expect(screen.getByText(/Areas to develop:/)).toBeInTheDocument();
  });

  it('renders a partial or old model without throwing', () => {
    const partial = { eventDate: '2026-05-01', metrics: [{ code: 'X', label: 'X', value: 'oops', unit: 's' }] } as unknown as EvalReportModelView;
    expect(() => render(<EvalReportBody model={partial} />)).not.toThrow();
    const bare = {} as unknown as EvalReportModelView;
    expect(() => render(<EvalReportBody model={bare} />)).not.toThrow();
  });

  it('formats the retest trend like the PDF (seconds to 2 decimals, % without a space)', () => {
    const withTrend = {
      ...model,
      metrics: [
        { ...model.metrics[0], trend: { direction: 'improved', change: -0.2 } },
        { ...model.metrics[1], unit: '%', trend: { direction: 'improved', change: 8 } },
      ],
    } as unknown as EvalReportModelView;
    render(<EvalReportBody model={withTrend} />);
    expect(screen.getByText('Improved by 0.20 s since the last evaluation')).toBeInTheDocument();
    expect(screen.getByText('Improved by 8% since the last evaluation')).toBeInTheDocument();
  });

  it('omits sections the saved selection turned off', () => {
    const off = { ...model, selection: { freshAndHealthy: false, strengths: false, coachNote: false } };
    render(<EvalReportBody model={off} />);
    expect(screen.queryByText(/Fresh & Healthy/)).not.toBeInTheDocument();
    expect(screen.queryByText('Strengths')).not.toBeInTheDocument();
    expect(screen.queryByText('What we saw')).not.toBeInTheDocument();
  });

  it('downloads the PDF through GET /api/reports/:id/pdf', async () => {
    (exportEventReportPDF as any).mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
    (window.URL as any).createObjectURL = vi.fn(() => 'blob:x');
    (window.URL as any).revokeObjectURL = vi.fn();
    render(<EvalReportView report={evalReport()} />);
    await userEvent.click(screen.getByTestId('eval-download-pdf'));
    await waitFor(() => expect(exportEventReportPDF).toHaveBeenCalledWith('r1'));
  });

  it('hides the download button when showDownload is false', () => {
    render(<EvalReportView report={evalReport()} showDownload={false} />);
    expect(screen.queryByTestId('eval-download-pdf')).not.toBeInTheDocument();
  });

  it('does not crash on a row without a model', () => {
    render(<EvalReportView report={evalReport({ eventId: 'e1', athleteId: 'a1', metrics: [] })} />);
    expect(screen.getByText(/no saved content/)).toBeInTheDocument();
  });

  it('AthleteReportView renders an eval from its model and never calls /generate', () => {
    render(<AthleteReportView report={evalReport()} />);
    expect(screen.getByText('Avery Stone')).toBeInTheDocument();
    expect(screen.queryByTestId('eval-download-pdf')).not.toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
  });

  it('SharedReportCard labels an eval row', () => {
    render(
      <SharedReportCard
        shareId="s1" reportId="r1" reportName="Eval - Avery" reportType="eval" sharedBy={null}
        createdAt="2026-05-01T00:00:00Z" isNew={false} onView={() => {}}
      />
    );
    expect(screen.getByTestId('eval-report-badge')).toHaveTextContent('Eval report');
  });

  describe('college gauge is per metric only', () => {
    const college = { status: 'at_or_better', name: 'D1' } as unknown as EvalMetricResultView['collegeStandard'];
    const withGauge = (reportWide: boolean, metricOn: boolean): EvalReportModelView =>
      ({
        ...model,
        selection: { collegeGauge: reportWide },
        metrics: [{ ...model.metrics[0], collegeStandard: college, collegeGauge: metricOn }],
      }) as EvalReportModelView;

    it('report-wide ON does not override a per-metric OFF', () => {
      render(<EvalReportBody model={withGauge(true, false)} />);
      expect(screen.queryByText(/college average/)).not.toBeInTheDocument();
    });

    it('per-metric ON shows the college line', () => {
      render(<EvalReportBody model={withGauge(false, true)} />);
      expect(screen.getByText('At or better than the college average')).toBeInTheDocument();
    });
  });

  describe('Fresh & Healthy wording matches the PDF', () => {
    it('neutral balance shows the value like the PDF', () => {
      const m = { ...model, freshAndHealthy: { balance: { status: 'neutral', label: 'Left-right balance', lsiPercent: 92.34 } } };
      render(<EvalReportBody model={m} />);
      expect(screen.getByText(`92.3% ${PDF_COPY.leftRightSuffix}`)).toBeInTheDocument();
    });

    it('load uses the PDF wording', () => {
      const m = { ...model, freshAndHealthy: { load: 'light' as const } };
      render(<EvalReportBody model={m} />);
      expect(screen.getByText(LOAD_LABELS.light)).toBeInTheDocument();
    });

    it('web and API share the same phrases', () => {
      expect(LOAD_LABELS).toEqual(API_LOAD);
      expect(BALANCE_LABELS).toEqual(API_BALANCE);
      expect(LEFT_RIGHT_SUFFIX).toBe(PDF_COPY.leftRightSuffix);
    });
  });

  describe('family-facing copy lint', () => {
    const banned = [/Elevated Risk/i, /injur/i, /\brisk/i, /medical/i, /FIERCE/i, /\$/, /D1 path/i, /Data-Driven Path/i, /placement/i];
    const full = {
      ...model,
      selection: { collegeGauge: true },
      metrics: [
        { ...model.metrics[0], collegeGauge: true, collegeStandard: { status: 'below' }, trend: { direction: 'improved', change: 0.1 } },
        { ...model.metrics[1], key: 'MQI', code: 'MQI', label: 'Movement', value: 72, unit: '' },
      ],
      freshAndHealthy: { load: 'heavy', balance: { status: 'worth_working_on', label: 'Worth working on', lsiPercent: 80 }, movement: 'Efficient' },
      developmentAreas: ['CMJ_HOH'],
      limiter: 'CMJ_HOH',
      coachNote: 'Great session',
    } as unknown as EvalReportModelView;

    it('visible text has none of the banned phrases', () => {
      const { container } = render(<EvalReportBody model={full} />);
      const text = container.textContent ?? '';
      for (const re of banned) expect(text).not.toMatch(re);
    });

    it('static strings in this view and the API copy are clean', () => {
      const strings = [...Object.values(LOAD_LABELS), ...Object.values(BALANCE_LABELS), LEFT_RIGHT_SUFFIX];
      for (const str of strings) for (const re of banned) expect(str).not.toMatch(re);
    });
  });
});
