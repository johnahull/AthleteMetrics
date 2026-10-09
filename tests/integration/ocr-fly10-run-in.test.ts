/**
 * AM-FEAT-017: POST /api/import/photo requires an explicit run-in distance for 10-yard fly readings.
 * The OCR parser emits the neutral token FLY10_TIME_UNRESOLVED; the route resolves it to one of the five
 * FLY10 codes from options.flyRunIn (5|10|15|20|30 yd), or rejects the whole photo with 422.
 *
 * Works on a CI-shaped database (the seed script creates FLY10_TIME and the four RI variants) and on a
 * migration-built one.
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
import { purgeTestRows } from '../helpers/purge-test-rows';

const PASSWORD = 'TestPass123!';
const NEUTRAL = 'FLY10_TIME_UNRESOLVED';
const NEUTRAL_505 = 'AGILITY_505_UNRESOLVED';
const RUN_IN_MSG = 'Choose the run-in distance for 10-yard fly readings';
const CODE_BY_YD: Record<number, string> = { 5: 'FLY10_TIME_RI5', 10: 'FLY10_TIME_RI10', 15: 'FLY10_TIME_RI15', 20: 'FLY10_TIME', 30: 'FLY10_TIME_RI30' };

describe('POST /api/import/photo fly-10 run-in', () => {
  let app: express.Express;
  let org: Organization;
  let coach: User;
  let athlete: User;
  let agent: ReturnType<typeof request.agent>;
  const ts = Date.now();
  const first = 'Ocrfly';
  const last = `RunIn${ts}`;

  function mockOcr(rows: Array<{ metric: string; value: string; rawText: string }>) {
    vi.spyOn(ocrService, 'extractTextFromImage').mockResolvedValue({
      text: 'mock',
      confidence: 90,
      extractedData: rows.map((r) => ({ firstName: first, lastName: last, confidence: 75, ...r })),
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

    org = await storage.createOrganization({ name: `OCRFly Org ${ts}`, description: 'ocr' });
    coach = await storage.createUser({
      username: `ocrflycoach${ts}`,
      password: PASSWORD,
      emails: [`ocrflycoach${ts}@test.com`],
      firstName: 'Ocr',
      lastName: 'Coach',
    });
    await storage.addUserToOrganization(coach.id, org.id, 'org_admin');
    athlete = await storage.createUser({
      username: `ocrflyath${ts}`,
      password: PASSWORD,
      emails: [`ocrflyath${ts}@test.com`],
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
    await purgeTestRows({ userIds: [athlete?.id, coach?.id], orgIds: [org?.id] });
  });

  it('without flyRunIn: 422 FLY10_RUN_IN_REQUIRED and nothing is written', async () => {
    mockOcr([{ metric: NEUTRAL, value: '1.45', rawText: 'Ocrfly 10 yd fly 1.45' }]);
    const spy = vi.spyOn(storage, 'createMeasurement');

    const res = await upload().expect(422);

    expect(res.body).toEqual({ message: RUN_IN_MSG, code: 'FLY10_RUN_IN_REQUIRED' });
    expect(spy).not.toHaveBeenCalled();
    expect(await savedMetrics()).toEqual([]);
  });

  it.each([5, 10, 15, 20, 30])('flyRunIn %i saves the matching FLY10 code (retry after a 422 included)', async (yd) => {
    mockOcr([{ metric: NEUTRAL, value: '1.45', rawText: 'Ocrfly 10 yd fly 1.45' }]);
    await upload().expect(422);

    const res = await upload({ flyRunIn: yd }).expect(200);

    expect(res.body.results.successful).toBe(1);
    expect(res.body.results.errors).toEqual([]);
    expect(res.body.results.processedData[0].measurement.metric).toBe(CODE_BY_YD[yd]);
    expect(await savedMetrics()).toContain(CODE_BY_YD[yd]);
  });

  it('an invalid flyRunIn value is a 400 and nothing is saved', async () => {
    mockOcr([{ metric: NEUTRAL, value: '1.45', rawText: 'Ocrfly 10 yd fly 1.45' }]);
    const spy = vi.spyOn(storage, 'createMeasurement');

    for (const bad of ['15', 12, 0, '', null, 'x']) {
      const res = await upload({ flyRunIn: bad }).expect(400);
      expect(res.body.message).toMatch(/flyRunIn/);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('a mixed upload (fly + vertical jump) without flyRunIn is all-or-nothing: 422, zero writes', async () => {
    mockOcr([
      { metric: 'VERTICAL_JUMP', value: '30.5', rawText: 'Ocrfly vertical 30.5 in' },
      { metric: NEUTRAL, value: '1.45', rawText: 'Ocrfly 10 yd fly 1.45' },
    ]);
    const spy = vi.spyOn(storage, 'createMeasurement');
    const lookup = vi.spyOn(storage, 'getAthletes');
    const before = await savedMetrics();

    const res = await upload().expect(422);

    expect(res.body.code).toBe('FLY10_RUN_IN_REQUIRED');
    expect(spy).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
    expect(await savedMetrics()).toEqual(before);
  });

  it('create_athletes with an unknown athlete and no flyRunIn creates no user', async () => {
    const ghostFirst = 'Ghostfly';
    const ghostLast = `Nobody${ts}`;
    vi.spyOn(ocrService, 'extractTextFromImage').mockResolvedValue({
      text: 'mock',
      confidence: 90,
      extractedData: [
        { firstName: ghostFirst, lastName: ghostLast, confidence: 75, metric: 'VERTICAL_JUMP', value: '30.5', rawText: 'g vj' },
        { firstName: ghostFirst, lastName: ghostLast, confidence: 75, metric: NEUTRAL, value: '1.45', rawText: 'g fly' },
      ],
      warnings: [],
    } as any);
    const createUser = vi.spyOn(storage, 'createUser');
    const create = vi.spyOn(storage, 'createMeasurement');

    await upload({ measurementMode: 'create_athletes' }).expect(422);

    expect(createUser).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(await storage.getAthletes({ search: `${ghostFirst} ${ghostLast}` } as any)).toHaveLength(0);
  });

  it('a photo with both a 5-0-5 and a fly reading needs both choices; the 5-0-5 check runs first', async () => {
    mockOcr([
      { metric: NEUTRAL_505, value: '2.45', rawText: 'Ocrfly 5-0-5 2.45' },
      { metric: NEUTRAL, value: '1.45', rawText: 'Ocrfly 10 yd fly 1.45' },
    ]);
    const spy = vi.spyOn(storage, 'createMeasurement');

    expect((await upload().expect(422)).body.code).toBe('PROTOCOL_505_REQUIRED');
    expect((await upload({ protocol505: 'M' }).expect(422)).body.code).toBe('FLY10_RUN_IN_REQUIRED');
    expect(spy).not.toHaveBeenCalled();

    const ok = await upload({ protocol505: 'YD', flyRunIn: 15 }).expect(200);
    expect(ok.body.results.successful).toBe(2);
    expect(await savedMetrics()).toEqual(expect.arrayContaining(['AGILITY_505_YD', 'FLY10_TIME_RI15']));
  });

  it('a photo with no fly reading needs no flyRunIn and saves normally', async () => {
    mockOcr([{ metric: 'VERTICAL_JUMP', value: '30.5', rawText: 'Ocrfly vertical 30.5 in' }]);
    const res = await upload().expect(200);
    expect(res.body.results.successful).toBe(1);
    expect(res.body.results.processedData[0].measurement.metric).toBe('VERTICAL_JUMP');
  });

  it('error rows for a resolved fly carry the concrete code, never the neutral token', async () => {
    vi.spyOn(ocrService, 'extractTextFromImage').mockResolvedValue({
      text: 'mock',
      confidence: 90,
      extractedData: [
        { firstName: 'Nomatch', lastName: `Person${ts}`, confidence: 75, metric: NEUTRAL, value: '1.45', rawText: 'n fly' },
      ],
      warnings: [],
    } as any);

    const res = await upload({ flyRunIn: 10 }).expect(200);

    expect(res.body.results.errors).toHaveLength(1);
    expect(res.body.results.errors[0].data.metric).toBe('FLY10_TIME_RI10');
    expect(JSON.stringify(res.body)).not.toContain(NEUTRAL);
  });

  it('the neutral token never reaches createMeasurement, whatever the options', async () => {
    mockOcr([{ metric: NEUTRAL, value: '1.45', rawText: 'Ocrfly 10 yd fly 1.45' }]);
    const spy = vi.spyOn(storage, 'createMeasurement');

    await upload().expect(422);
    await upload({ flyRunIn: 5 }).expect(200);
    await upload({ flyRunIn: 30 }).expect(200);

    expect(spy).toHaveBeenCalledTimes(2);
    for (const call of spy.mock.calls) {
      expect(call[0].metric).not.toBe(NEUTRAL);
      expect(['FLY10_TIME_RI5', 'FLY10_TIME_RI30']).toContain(call[0].metric);
    }
    expect(await savedMetrics()).not.toContain(NEUTRAL);
  });
});
