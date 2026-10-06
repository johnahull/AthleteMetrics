/**
 * AM-FEAT-016 step 4: POST /api/import/photo requires an explicit 5-0-5 protocol.
 * The OCR parser emits the neutral token AGILITY_505_UNRESOLVED; the route resolves it
 * to AGILITY_505_M / AGILITY_505_YD from options.protocol505, or rejects the reading.
 *
 * Needs a database that has migrations 0144/0145 applied (the _M/_YD site_metrics rows).
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { storage } from '../../packages/api/storage';
import { ocrService } from '../../packages/api/ocr/ocr-service';
import type { Organization, User } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'TestPass123!';
const NEUTRAL = 'AGILITY_505_UNRESOLVED';
const PROTOCOL_MSG = 'Choose meters or yards for 5-0-5 readings';

describe('POST /api/import/photo 5-0-5 protocol', () => {
  let app: express.Express;
  let org: Organization;
  let coach: User;
  let athlete: User;
  let agent: ReturnType<typeof request.agent>;
  const ts = Date.now();
  const first = 'Ocrfive';
  const last = `Protocol${ts}`;

  function mockOcr(rows: Array<{ metric: string; value: string; rawText: string }>) {
    vi.spyOn(ocrService, 'extractTextFromImage').mockResolvedValue({
      text: 'mock',
      confidence: 90,
      extractedData: rows.map((r) => ({
        firstName: first,
        lastName: last,
        confidence: 75,
        ...r,
      })),
      warnings: [],
    } as any);
  }

  function upload(options?: Record<string, unknown>) {
    const req = agent
      .post('/api/import/photo')
      .attach('file', Buffer.from('fake-image'), { filename: 'sheet.png', contentType: 'image/png' });
    req.field('options', JSON.stringify({ measurementMode: 'match_only', organizationId: org.id, ...options }));
    return req;
  }

  async function savedMetrics() {
    const rows = await storage.getMeasurements({ userId: athlete.id } as any);
    return rows.map((m: any) => (m.measurement ?? m).metric as string);
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);

    org = await storage.createOrganization({ name: `OCR505 Org ${ts}`, description: 'ocr' });
    coach = await storage.createUser({
      username: `ocr505coach${ts}`,
      password: PASSWORD,
      emails: [`ocr505coach${ts}@test.com`],
      firstName: 'Ocr',
      lastName: 'Coach',
    });
    await storage.addUserToOrganization(coach.id, org.id, 'org_admin');
    athlete = await storage.createUser({
      username: `ocr505ath${ts}`,
      password: PASSWORD,
      emails: [`ocr505ath${ts}@test.com`],
      firstName: first,
      lastName: last,
      role: 'athlete' as const,
    } as any);
    await storage.addUserToOrganization(athlete.id, org.id, 'athlete');

    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: coach.username, password: PASSWORD }).expect(200);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try { await storage.deleteUser(athlete.id); } catch { /* ignore */ }
    try { await storage.deleteUser(coach.id); } catch { /* ignore */ }
    try { await storage.deleteOrganization(org.id); } catch { /* ignore */ }
  });

  it('without protocol505: 200, 5-0-5 is in errors[], not saved, nothing written', async () => {
    mockOcr([{ metric: NEUTRAL, value: '2.45', rawText: 'Ocrfive 5-0-5 2.45' }]);
    const spy = vi.spyOn(storage, 'createMeasurement');

    const res = await upload().expect(200);

    expect(res.body.results.successful).toBe(0);
    expect(res.body.results.processedData).toEqual([]);
    expect(res.body.results.errors).toHaveLength(1);
    expect(res.body.results.errors[0].error).toBe(PROTOCOL_MSG);
    expect(spy).not.toHaveBeenCalled();
    expect(await savedMetrics()).toEqual([]);
  });

  it("protocol505 'M' saves AGILITY_505_M", async () => {
    mockOcr([{ metric: NEUTRAL, value: '2.45', rawText: 'Ocrfive 5-0-5 2.45' }]);
    const res = await upload({ protocol505: 'M' }).expect(200);

    expect(res.body.results.successful).toBe(1);
    expect(res.body.results.errors).toEqual([]);
    expect(res.body.results.processedData[0].measurement.metric).toBe('AGILITY_505_M');
    expect(await savedMetrics()).toContain('AGILITY_505_M');
  });

  it("protocol505 'YD' saves AGILITY_505_YD", async () => {
    mockOcr([{ metric: NEUTRAL, value: '2.60', rawText: 'Ocrfive 5-0-5 2.60' }]);
    const res = await upload({ protocol505: 'YD' }).expect(200);

    expect(res.body.results.successful).toBe(1);
    expect(res.body.results.processedData[0].measurement.metric).toBe('AGILITY_505_YD');
    expect(await savedMetrics()).toContain('AGILITY_505_YD');
  });

  it('an invalid protocol505 value is a 400 and nothing is saved', async () => {
    mockOcr([{ metric: NEUTRAL, value: '2.45', rawText: 'Ocrfive 5-0-5 2.45' }]);
    const spy = vi.spyOn(storage, 'createMeasurement');

    for (const bad of ['meters', 'm', '', null, 5]) {
      const res = await upload({ protocol505: bad }).expect(400);
      expect(res.body.message).toMatch(/protocol505/);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('a mixed upload without protocol saves the other reading and rejects only the 5-0-5', async () => {
    mockOcr([
      { metric: 'VERTICAL_JUMP', value: '30.5', rawText: 'Ocrfive vertical 30.5 in' },
      { metric: NEUTRAL, value: '2.45', rawText: 'Ocrfive 5-0-5 2.45' },
    ]);
    const spy = vi.spyOn(storage, 'createMeasurement');

    const res = await upload().expect(200);

    expect(res.body.results.successful).toBe(1);
    expect(res.body.results.processedData[0].measurement.metric).toBe('VERTICAL_JUMP');
    expect(res.body.results.errors).toHaveLength(1);
    expect(res.body.results.errors[0].error).toBe(PROTOCOL_MSG);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('the neutral token never reaches createMeasurement, whatever the options', async () => {
    mockOcr([{ metric: NEUTRAL, value: '2.45', rawText: 'Ocrfive 5-0-5 2.45' }]);
    const spy = vi.spyOn(storage, 'createMeasurement');

    await upload().expect(200);
    await upload({ protocol505: 'M' }).expect(200);
    await upload({ protocol505: 'YD' }).expect(200);

    for (const call of spy.mock.calls) {
      expect(call[0].metric).not.toBe(NEUTRAL);
      expect(['AGILITY_505_M', 'AGILITY_505_YD']).toContain(call[0].metric);
    }
    expect(await savedMetrics()).not.toContain(NEUTRAL);
  });
});
