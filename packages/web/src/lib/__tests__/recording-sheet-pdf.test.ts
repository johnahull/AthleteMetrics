import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PDF_LAYOUT,
  planRecordingSheetPdf,
  recordingSheetToPdf,
  toPdfText,
} from '../recording-sheet-pdf';
import type { RecordingSheet } from '../recording-sheet';

const metrics = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ code: `M${i + 1}`, label: `Metric number ${i + 1}`, unit: 's' }));
const athletes = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: `ath-${i + 1}`, name: `Athlete ${i + 1}` }));

describe('planRecordingSheetPdf', () => {
  it('puts a few metrics and athletes on one page with no strip label', () => {
    const plan = planRecordingSheetPdf(5, 10);
    expect(plan.strips).toHaveLength(1);
    expect(plan.strips[0]).toMatchObject({ start: 0, end: 5 });
    expect(plan.pages).toEqual([{ strip: 0, rowStart: 0, rowEnd: 10, label: undefined }]);
  });

  it('splits 14 metrics into two column strips of 7 and labels them', () => {
    const plan = planRecordingSheetPdf(14, 3);
    expect(plan.strips.map((s) => [s.start, s.end])).toEqual([
      [0, 7],
      [7, 14],
    ]);
    expect(plan.pages.map((p) => p.label)).toEqual(['Columns 1-7 of 14 (part 1 of 2)', 'Columns 8-14 of 14 (part 2 of 2)']);
  });

  it('balances strips (12 metrics -> 6 + 6) and keeps every strip inside the page width', () => {
    const plan = planRecordingSheetPdf(12, 1);
    expect(plan.strips.map((s) => s.end - s.start)).toEqual([6, 6]);
    const usable = PDF_LAYOUT.pageWidth - 2 * PDF_LAYOUT.margin;
    for (const s of plan.strips) {
      expect(s.metricWidth).toBeGreaterThanOrEqual(PDF_LAYOUT.minMetricWidth);
      expect(PDF_LAYOUT.numberWidth + PDF_LAYOUT.athleteWidth + (s.end - s.start) * s.metricWidth).toBeLessThanOrEqual(usable);
    }
  });

  it('paginates 60 athletes with every athlete exactly once per strip', () => {
    const plan = planRecordingSheetPdf(3, 60);
    expect(plan.rowsPerPage).toBeGreaterThanOrEqual(14);
    expect(plan.pages).toHaveLength(Math.ceil(60 / plan.rowsPerPage));
    const rows = plan.pages.flatMap((p) => Array.from({ length: p.rowEnd - p.rowStart }, (_, i) => p.rowStart + i));
    expect(rows).toEqual(Array.from({ length: 60 }, (_, i) => i));
  });

  it('rows are at least 0.35 in tall and a full page fits between header and footer', () => {
    const { rowsPerPage } = planRecordingSheetPdf(3, 60);
    const L = PDF_LAYOUT;
    expect(L.rowHeight).toBeGreaterThanOrEqual(0.35 * 72);
    expect(L.margin + L.headerHeight + L.tableHeadHeight + rowsPerPage * L.rowHeight + L.footerHeight).toBeLessThanOrEqual(
      L.pageHeight - L.margin,
    );
  });

  it('orders pages strip by strip: all athletes for strip 1, then strip 2', () => {
    const plan = planRecordingSheetPdf(12, 25);
    const per = plan.rowsPerPage;
    expect(plan.pages.map((p) => [p.strip, p.rowStart])).toEqual([
      [0, 0],
      [0, per],
      [1, 0],
      [1, per],
    ]);
  });

  it('prints one empty page per strip when there are no athletes', () => {
    expect(planRecordingSheetPdf(14, 0).pages.map((p) => [p.strip, p.rowStart, p.rowEnd])).toEqual([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    expect(planRecordingSheetPdf(0, 0).pages).toHaveLength(1);
  });
});

describe('toPdfText', () => {
  it('keeps Latin-1 text as is', () => {
    expect(toPdfText('Zoë Ångström-Núñez')).toEqual({ text: 'Zoë Ångström-Núñez', altered: false });
  });

  it('maps typographic quotes and dashes to plain ones without flagging', () => {
    expect(toPdfText('O’Brien “Bo” – Jr')).toEqual({ text: 'O\'Brien "Bo" - Jr', altered: false });
  });

  it('replaces characters Helvetica cannot print with ? and flags it', () => {
    expect(toPdfText('李小龍')).toEqual({ text: '???', altered: true });
    expect(toPdfText('Łukasz')).toEqual({ text: '?ukasz', altered: true });
  });

  it('composes decomposed accents first (e + combining acute is é)', () => {
    expect(toPdfText('Amélie')).toEqual({ text: 'Amélie', altered: false });
  });
});

/** Text shown by the PDF's content streams, in order (jsPDF writes uncompressed streams) */
function pdfStrings(pdf: string): string[] {
  return [...pdf.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
}

/** The content of each page, split on page objects (jsPDF writes each page's stream after its page object) */
function pageTexts(pdf: string): string[] {
  return pdf
    .split(/\/Type \/Page\b(?!s)/)
    .slice(1)
    .map((chunk) => pdfStrings(chunk).join(' | '));
}

describe('recordingSheetToPdf', () => {
  const sheet: RecordingSheet = {
    eventId: 'ev-1234',
    eventName: 'Spring Screen',
    eventDate: '2026-03-10',
    location: 'Main Gym',
    metrics: metrics(12),
    athletes: [...athletes(24), { userId: 'ath-x', name: '李小龍' }],
  };

  it('renders a landscape Letter PDF with the planned pages, header and column headers', async () => {
    const bytes = await recordingSheetToPdf(sheet);
    const pdf = new TextDecoder('latin1').decode(bytes);
    expect(pdf.startsWith('%PDF')).toBe(true);
    const plan = planRecordingSheetPdf(12, 25);
    const pages = pageTexts(pdf);
    expect(pages).toHaveLength(plan.pages.length);
    expect(pdf).toMatch(/\/MediaBox \[0 0 792\.?0* 612\.?0*\]/);
    expect(pages[0]).toContain('Spring Screen');
    expect(pages[0]).toContain('2026-03-10');
    expect(pages[0]).toContain('Main Gym');
    expect(pages[0]).toContain('ev-1234');
    expect(pages[0]).toContain(`Page 1 of ${plan.pages.length}`);
    expect(pages[0]).toContain('Columns 1-6 of 12 (part 1 of 2)');
    expect(pages[0]).toContain('Athlete');
    expect(pages[0]).toContain('Metric number 1');
    expect(pages[0]).toContain('(s)');
    expect(pages[0]).toContain('Some text contains characters this PDF cannot print');
    expect(pages[1]).not.toContain('Some text contains characters');
    // second strip repeats the Athlete column with the remaining metrics
    const strip2 = pages[plan.pages.findIndex((p) => p.strip === 1)];
    expect(strip2).toContain('Columns 7-12 of 12 (part 2 of 2)');
    expect(strip2).toContain('Athlete 1');
    expect(strip2).toContain('Metric number 7');
    expect(strip2).not.toContain('Metric number 6 ');
    expect(pdf).toContain('???');
  });

  it('does not add the characters note when every name prints', async () => {
    const pdf = new TextDecoder('latin1').decode(
      await recordingSheetToPdf({ ...sheet, athletes: athletes(3), location: undefined }),
    );
    expect(pdf).not.toContain('Some text contains characters');
  });

  it('keeps the planned page count with very long names and labels', async () => {
    const long: RecordingSheet = {
      ...sheet,
      eventName: 'A very long event name '.repeat(10),
      metrics: metrics(14).map((m) => ({ ...m, label: 'Extremely long metric label that wraps '.repeat(4) })),
      athletes: athletes(40).map((a) => ({ ...a, name: `${a.name} ${'Longsurname'.repeat(8)}` })),
    };
    const pages = pageTexts(new TextDecoder('latin1').decode(await recordingSheetToPdf(long)));
    expect(pages).toHaveLength(planRecordingSheetPdf(14, 40).pages.length);
  });

  it('notes unprintable characters that are only in the event name', async () => {
    const pdf = new TextDecoder('latin1').decode(
      await recordingSheetToPdf({ ...sheet, eventName: 'Spring\tScreen', athletes: athletes(3) }),
    );
    expect(pdf).toContain('Some text contains characters this PDF cannot print');
  });

  it('omits the Date segment when the event date is empty', async () => {
    const pdf = new TextDecoder('latin1').decode(await recordingSheetToPdf({ ...sheet, eventDate: '' }));
    expect(pdf).not.toContain('Date:');
    expect(pdf).toContain('Location: Main Gym');
  });

  it('ellipsizes a 10,000-character event name quickly', async () => {
    const t0 = performance.now();
    const pdf = new TextDecoder('latin1').decode(
      await recordingSheetToPdf({ ...sheet, eventName: 'x'.repeat(10000), athletes: athletes(3) }),
    );
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(pdf).toMatch(/xx\.\.\.\)\s*Tj/);
    expect(pdf).not.toContain('x'.repeat(300));
  });

  describe('page count mismatch', () => {
    afterEach(() => {
      vi.doUnmock('jspdf-autotable');
      vi.resetModules();
      vi.restoreAllMocks();
    });

    it('puts a header on every real page and warns once', async () => {
      vi.resetModules();
      vi.doMock('jspdf-autotable', async () => {
        const real = await vi.importActual<typeof import('jspdf-autotable')>('jspdf-autotable');
        return { ...real, autoTable: (doc: any, opts: any) => { real.autoTable(doc, opts); doc.addPage(); } };
      });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mod = await import('../recording-sheet-pdf');
      const small = { ...sheet, metrics: metrics(3), athletes: athletes(3) };
      const pages = pageTexts(new TextDecoder('latin1').decode(await mod.recordingSheetToPdf(small)));
      expect(pages).toHaveLength(2);
      expect(pages[0]).toContain('Page 1 of 2');
      expect(pages[1]).toContain('Page 2 of 2');
      expect(pages[1]).toContain('Spring Screen');
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});
