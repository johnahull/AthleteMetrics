import { describe, it, expect, vi } from 'vitest';
import zlib from 'node:zlib';
import { jsPDF } from 'jspdf';
import { normalizeChartImages, addTrendChartsToPdf } from '../report-routes';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function pngDataUrl(w: number, h: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const raw = Buffer.alloc((w + 1) * h, 255);
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0; // filter byte
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

describe('normalizeChartImages group fields', () => {
  const png = 'data:image/png;base64,AAAA';
  const norm = (extra: Record<string, unknown>) => normalizeChartImages([{ metricCode: 'M', dataUrl: png, ...extra }])[0];

  it('keeps string group, groupLabel and section', () => {
    expect(norm({ group: 'speed', groupLabel: 'Speed', section: 'trends' })).toMatchObject({
      group: 'speed', groupLabel: 'Speed', section: 'trends',
    });
  });

  it('drops non-string and empty values', () => {
    const out = norm({ group: 5, groupLabel: { a: 1 }, section: '' });
    expect(out.group).toBeUndefined();
    expect(out.groupLabel).toBeUndefined();
    expect(out.section).toBeUndefined();
  });

  it('truncates over-length values to 60 characters', () => {
    const out = norm({ group: 'x'.repeat(500), groupLabel: 'y'.repeat(500), section: 'z'.repeat(500) });
    expect(out.group).toHaveLength(60);
    expect(out.groupLabel).toHaveLength(60);
    expect(out.section).toHaveLength(60);
  });
});

describe('addTrendChartsToPdf heading height', () => {
  // Page usable height is 263 and a block is 16 + image height. A 182x115 image makes two blocks
  // fit exactly (262); the 8-unit heading on the first chart must therefore push the second to a new page.
  const url = pngDataUrl(182, 115);
  const chart = (group?: string) => ({ metricCode: 'M', dataUrl: url, group, groupLabel: group });

  it('adds no page break when no chart has a group', () => {
    const doc = new jsPDF();
    addTrendChartsToPdf(doc, [chart(), chart()]);
    expect(doc.getNumberOfPages()).toBe(2); // cover page + one chart page
  });

  it('counts the heading in the page plan, and draws it with the same height', () => {
    const doc = new jsPDF();
    const imageY: number[] = [];
    vi.spyOn(doc, 'addImage').mockImplementation(((_d: any, _f: any, _x: number, y: number) => {
      imageY.push(y);
      return doc;
    }) as any);
    addTrendChartsToPdf(doc, [chart('speed'), chart('speed')]);
    expect(doc.getNumberOfPages()).toBe(3);
    // first chart: start 20 + heading 8 + title 6; second starts a fresh page at 20 + title 6 (no heading)
    expect(imageY).toEqual([34, 26]);
  });
});
