/**
 * AM-FEAT-024 PR 3: versioned eval battery templates (append-only revisions), the revision an event applied,
 * and "MQI required" in the Foundation / Performance presets.
 * Creates its own site_metrics rows (the CI DB is db:push + default seed only, no manual migrations).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { evalBatteryTemplateRevisions, evalBatteryTemplates, eventMetrics, events, organizations, siteMetrics, userOrganizations, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({ setupVite: vi.fn().mockResolvedValue(undefined), serveStatic: vi.fn() }));
vi.mock('express-rate-limit', async (importOriginal) => {
  const passthrough = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...(await importOriginal<Record<string, unknown>>()), default: passthrough, rateLimit: passthrough };
});

import { registerRoutes } from '../../packages/api/routes';
import { deleteTemplate, TemplateInUseError, TemplateNotFoundError } from '../../packages/api/services/eval-template-service';
import { currentRevisionOf, linkEventRevision } from '../../packages/api/services/eval-template-revision-service';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PASSWORD = 'EvalRevisions123!';
const PREFIX = `evalrev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const MQI_CODES = ['MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE', 'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP'];
const MQI_KEYS = ['PATTERN_LIN_ACCEL', 'PATTERN_MAX_VELO', 'PATTERN_DECEL', 'PATTERN_SHUFFLE', 'PATTERN_LATRUN', 'PATTERN_HIPTURN', 'PATTERN_BACKPEDAL', 'PATTERN_JUMP'];

describe('eval template revisions and MQI required', () => {
  let app: Express;
  let orgA: string;
  let coach: { id: string; username: string };
  let cookie: string;
  const createdSiteMetricCodes: string[] = [];
  let createdFoundationId: string | null = null;
  let foundationId: string;

  const metrics = [
    { metricKey: 'DASH_10', isRequired: true, displayOrder: 1 },
    { metricKey: 'FLY_10', isRequired: false, displayOrder: 2 },
  ];
  const mqiMetrics = [
    { metricKey: 'DASH_10', isRequired: true, displayOrder: 1 },
    ...MQI_KEYS.map((metricKey, i) => ({ metricKey, isRequired: true, displayOrder: 10 + i })),
  ];

  const api = {
    post: (url: string) => request(app).post(url).set('Cookie', cookie),
    patch: (url: string) => request(app).patch(url).set('Cookie', cookie),
    put: (url: string) => request(app).put(url).set('Cookie', cookie),
    delete: (url: string) => request(app).delete(url).set('Cookie', cookie),
  };
  const newEvent = async (name: string) => {
    const [row] = await db.insert(events).values({ organizationId: orgA, name: `${PREFIX}-${name}`, startDate: new Date('2026-02-10T10:00:00Z') } as any).returning({ id: events.id });
    return row.id;
  };
  const revisionsOf = (templateId: string) =>
    db.select().from(evalBatteryTemplateRevisions).where(eq(evalBatteryTemplateRevisions.templateId, templateId)).orderBy(asc(evalBatteryTemplateRevisions.revision));
  const eventRevisionId = async (eventId: string) => (await db.select({ r: events.evalTemplateRevisionId }).from(events).where(eq(events.id, eventId)))[0].r;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    [{ id: orgA }] = await db.insert(organizations).values({ name: `${PREFIX}-A` } as any).returning({ id: organizations.id });
    [coach] = (await db
      .insert(users)
      .values({
        birthDate: '1990-01-01',
        username: `${PREFIX}-coach`,
        emails: [`${PREFIX}-coach@test.com`],
        password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
        firstName: 'Eval',
        lastName: 'Coach',
        fullName: 'Eval Coach',
      } as any)
      .returning()) as any;
    await db.insert(userOrganizations).values({ userId: coach.id, organizationId: orgA, role: 'coach' } as any);
    const login = await request(app).post('/api/auth/login').send({ username: coach.username, password: PASSWORD });
    expect(login.status).toBe(200);
    cookie = login.headers['set-cookie'][0];

    const needed: Array<[string, string, string]> = [
      ['DASH_10YD', 'speed', 's'],
      ['FLY10_TIME', 'speed', 's'],
      ...MQI_CODES.map((c): [string, string, string] => [c, 'Movement Quality', 'score']),
    ];
    for (const [code, category, unit] of needed) {
      const inserted = await db.insert(siteMetrics).values({ code, label: code, category, unit, metricType: 'higher_is_better' } as any).onConflictDoNothing().returning({ code: siteMetrics.code });
      if (inserted.length > 0) createdSiteMetricCodes.push(code);
    }

    // The Foundation preset (preset_key 'foundation') is seeded by migration 0180; a push-only DB has none, so add one with the same shape.
    const live = () => db.select({ id: evalBatteryTemplates.id }).from(evalBatteryTemplates).where(eq(evalBatteryTemplates.presetKey, 'foundation'));
    if ((await live()).length === 0) {
      [{ id: createdFoundationId }] = (await db.insert(evalBatteryTemplates).values({ sport: 'ALL', name: 'Foundation', presetKey: 'foundation', metrics: mqiMetrics } as any).returning({ id: evalBatteryTemplates.id })) as any;
    }
    [{ id: foundationId }] = await live();
  });

  afterAll(async () => {
    await purgeTestRows({ usernameLike: [`${PREFIX}-%`], orgNameLike: [`${PREFIX}-%`] });
    if (createdFoundationId) await db.delete(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, createdFoundationId));
    if (createdSiteMetricCodes.length) await db.delete(siteMetrics).where(inArray(siteMetrics.code, createdSiteMetricCodes));
  });

  describe('publishing revisions', () => {
    let tpl: string;

    it('creating a template publishes revision 1 and points the template at it', async () => {
      const res = await api.post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-rev`, sport: 'SOCCER', metrics });
      expect(res.status).toBe(201);
      tpl = res.body.id;
      const revs = await revisionsOf(tpl);
      expect(revs).toHaveLength(1);
      expect(revs[0]).toMatchObject({ revision: 1, createdBy: coach.id });
      expect(revs[0].id).toHaveLength(36);
      expect(revs[0].metrics.map((m: any) => m.metricKey)).toEqual(['DASH_10', 'FLY_10']);
      expect(res.body.currentRevisionId).toBe(revs[0].id);
    });

    it('editing the tests publishes revision 2 and leaves revision 1 exactly as it was', async () => {
      const before = (await revisionsOf(tpl))[0];
      const res = await api.patch(`/api/eval-templates/${tpl}`).send({ metrics: [{ metricKey: 'DASH_10', isRequired: false, displayOrder: 1 }] });
      expect(res.status).toBe(200);
      const revs = await revisionsOf(tpl);
      expect(revs.map((r) => r.revision)).toEqual([1, 2]);
      expect(revs[0]).toEqual(before);
      expect(revs[1].metrics).toEqual([{ metricKey: 'DASH_10', isRequired: false, displayOrder: 1 }]);
      expect(res.body.currentRevisionId).toBe(revs[1].id);
      expect(res.body.metrics).toEqual(revs[1].metrics);
    });

    it('the template list carries the current revision number', async () => {
      const list = await request(app).get(`/api/organizations/${orgA}/eval-templates`).set('Cookie', cookie);
      expect(list.body.find((t: any) => t.id === tpl).currentRevision).toBe(2);
    });

    it('a rename or an unchanged save publishes nothing', async () => {
      await api.patch(`/api/eval-templates/${tpl}`).send({ name: `${PREFIX}-renamed` }).expect(200);
      await api.patch(`/api/eval-templates/${tpl}`).send({ metrics: [{ metricKey: 'DASH_10', isRequired: false, displayOrder: 1 }] }).expect(200);
      expect(await revisionsOf(tpl)).toHaveLength(2);
      // a full-list PATCH that changes only the name leaves the current revision where it was
      const before = (await db.select({ c: evalBatteryTemplates.currentRevisionId }).from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, tpl)))[0].c;
      const res = await api.patch(`/api/eval-templates/${tpl}`).send({ name: `${PREFIX}-renamed-2`, metrics: [{ metricKey: 'DASH_10', isRequired: false, displayOrder: 1 }] });
      expect(res.status).toBe(200);
      expect(res.body.currentRevisionId).toBe(before);
      expect((await db.select({ c: evalBatteryTemplates.currentRevisionId }).from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, tpl)))[0].c).toBe(before);
      expect(await revisionsOf(tpl)).toHaveLength(2);
    });

    it('deleting an organization template removes its revisions with it', async () => {
      await api.delete(`/api/eval-templates/${tpl}`).expect(204);
      expect(await revisionsOf(tpl)).toHaveLength(0);
    });
  });

  it('the service never updates or deletes a revision (a db:push database has no trigger)', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (!['node_modules', '__tests__'].includes(entry.name)) walk(full); continue; }
        if (!/\.tsx?$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
        if (/\.(update|delete)\(\s*evalBatteryTemplateRevisions\b/.test(fs.readFileSync(full, 'utf-8'))) offenders.push(full);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  describe('applying a template records the revision on the event', () => {
    it('stores the current revision, copies that revision\'s tests, and ignores later edits', async () => {
      const made = await api.post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-apply`, sport: 'SOCCER', metrics });
      const tpl = made.body.id as string;
      const [rev1] = await revisionsOf(tpl);
      const ev = await newEvent('apply');
      const res = await api.post(`/api/events/${ev}/apply-eval-template`).send({ templateId: tpl });
      expect(res.status).toBe(200);
      expect(res.body.added).toEqual(['DASH_10YD']);
      expect(res.body.templateRevision).toEqual({ id: rev1.id, revision: 1 });
      expect(await eventRevisionId(ev)).toBe(rev1.id);

      await api.patch(`/api/eval-templates/${tpl}`).send({ metrics: [{ metricKey: 'FLY_10', isRequired: true, displayOrder: 1 }] }).expect(200);
      expect(await eventRevisionId(ev)).toBe(rev1.id);
      const ev2 = await newEvent('apply2');
      const res2 = await api.post(`/api/events/${ev2}/apply-eval-template`).send({ templateId: tpl });
      expect(res2.body.added).toEqual(['FLY10_TIME']);
      expect(res2.body.templateRevision.revision).toBe(2);
      expect(await eventRevisionId(ev2)).not.toBe(rev1.id);
    });

    it('a template saved before revisions existed (no current revision) gets revision 1 when first applied', async () => {
      const [legacy] = await db.insert(evalBatteryTemplates).values({ organizationId: orgA, sport: 'SOCCER', name: `${PREFIX}-legacy`, metrics } as any).returning();
      expect(legacy.currentRevisionId).toBeNull();
      const ev = await newEvent('legacy');
      const res = await api.post(`/api/events/${ev}/apply-eval-template`).send({ templateId: legacy.id });
      expect(res.status).toBe(200);
      const revs = await revisionsOf(legacy.id);
      expect(revs.map((r) => r.revision)).toEqual([1]);
      expect(await eventRevisionId(ev)).toBe(revs[0].id);
    });
  });

  describe('self-healing revisions, delete guard, link rules', () => {
    it('a direct edit of the template tests (as migrations do) is published as a new revision on the next apply', async () => {
      const made = await api.post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-heal`, sport: 'SOCCER', metrics });
      const tpl = made.body.id as string;
      const [rev1] = await revisionsOf(tpl);
      await db.update(evalBatteryTemplates).set({ metrics: [{ metricKey: 'FLY_10', isRequired: true, displayOrder: 1 }] as any }).where(eq(evalBatteryTemplates.id, tpl));
      const ev = await newEvent('heal');
      const res = await api.post(`/api/events/${ev}/apply-eval-template`).send({ templateId: tpl });
      expect(res.status).toBe(200);
      expect(res.body.added).toEqual(['FLY10_TIME']);
      expect(res.body.templateRevision.revision).toBe(2);
      const revs = await revisionsOf(tpl);
      expect(revs.map((r) => r.revision)).toEqual([1, 2]);
      expect(revs[0]).toEqual(rev1);
      expect(await eventRevisionId(ev)).toBe(revs[1].id);
      // applying again with nothing changed publishes nothing
      await api.post(`/api/events/${await newEvent('heal2')}/apply-eval-template`).send({ templateId: tpl }).expect(200);
      expect(await revisionsOf(tpl)).toHaveLength(2);
    });

    it('refuses to hard-delete a template an event points at (409, archive instead); unreferenced ones still delete', async () => {
      const made = await api.post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-inuse`, sport: 'SOCCER', metrics });
      const ev = await newEvent('inuse');
      await api.post(`/api/events/${ev}/apply-eval-template`).send({ templateId: made.body.id }).expect(200);
      const res = await api.delete(`/api/eval-templates/${made.body.id}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/archive/i);
      expect(await revisionsOf(made.body.id)).toHaveLength(1);
      await api.post(`/api/eval-templates/${made.body.id}/archive`).expect(200);
      expect(await eventRevisionId(ev)).not.toBeNull();
    });

    it('applying a non-preset template never overwrites an event\'s preset link, by apply or by the new-event flow', async () => {
      const ev = await newEvent('keeppreset');
      await api.post(`/api/events/${ev}/apply-eval-template`).send({ templateId: foundationId }).expect(200);
      const presetLink = await eventRevisionId(ev);
      expect(presetLink).not.toBeNull();
      const org = await api.post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-nonpreset`, sport: 'SOCCER', metrics });
      await api.post(`/api/events/${ev}/apply-eval-template`).send({ templateId: org.body.id }).expect(200);
      expect(await eventRevisionId(ev)).toBe(presetLink);
      await api.post(`/api/events/${ev}/metrics/bulk`).send({ evalTemplateId: org.body.id, metrics: [] }).expect(200);
      expect(await eventRevisionId(ev)).toBe(presetLink);
      await api.delete(`/api/events/${ev}/metrics/MQ_JUMP`).expect(409);
    });

    it('a frozen event gets no link from the new-event flow or apply (the link shares the metrics transaction)', async () => {
      const ev = await newEvent('frozen');
      await db.update(events).set({ isFrozen: true }).where(eq(events.id, ev));
      await api.post(`/api/events/${ev}/metrics/bulk`).send({ evalTemplateId: foundationId, metrics: [] }).expect(409);
      await api.post(`/api/events/${ev}/apply-eval-template`).send({ templateId: foundationId }).expect(409);
      expect(await eventRevisionId(ev)).toBeNull();
    });

    it('an archived, deleted or unusable template does not fail the new-event list: plain add, no link, a warning', async () => {
      const made = await api.post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-gone`, sport: 'SOCCER', metrics });
      await api.post(`/api/eval-templates/${made.body.id}/archive`).expect(200);
      const ev = await newEvent('gone');
      const res = await api.post(`/api/events/${ev}/metrics/bulk`).send({ evalTemplateId: made.body.id, metrics: [{ metricCode: 'DASH_10YD', displayOrder: 0 }] });
      expect(res.status).toBe(200);
      expect(res.body.added).toEqual(['DASH_10YD']);
      expect(res.body.warning).toMatch(/template/i);
      expect(await eventRevisionId(ev)).toBeNull();
      // a template that no longer exists at all
      const ev2 = await newEvent('gone2');
      const res2 = await api.post(`/api/events/${ev2}/metrics/bulk`).send({ evalTemplateId: '00000000-0000-0000-0000-000000000000', metrics: [{ metricCode: 'DASH_10YD', displayOrder: 0 }] });
      expect(res2.status).toBe(200);
      expect(res2.body.warning).toBeTruthy();
      expect(res2.body.added).toEqual(['DASH_10YD']);
    });
  });

  describe('delete and apply serialize on the template row', () => {
    it('a delete that races with a link waits for it, then refuses with TemplateInUseError; the link survives', async () => {
      const made = await api.post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-race`, sport: 'SOCCER', metrics });
      const tpl = made.body.id as string;
      const [rev] = await revisionsOf(tpl);
      const ev = await newEvent('race');
      let deletion: Promise<unknown> | undefined;
      let deleteSettledEarly = false;
      await db.transaction(async (tx) => {
        await linkEventRevision(tx, ev, rev.id, false);
        // the link transaction is still open: the delete must wait for the template row, not slip past the check
        deletion = deleteTemplate(tpl, coach.id).then(() => 'deleted', (e) => e);
        deletion.then(() => { deleteSettledEarly = true; });
        await new Promise((r) => setTimeout(r, 400));
      });
      expect(deleteSettledEarly).toBe(false);
      expect(await deletion).toBeInstanceOf(TemplateInUseError);
      expect(await eventRevisionId(ev)).toBe(rev.id);
      expect(await revisionsOf(tpl)).toHaveLength(1);
    });

    it('a link that loses the race to a delete fails cleanly with TemplateNotFoundError', async () => {
      const made = await api.post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-race2`, sport: 'SOCCER', metrics });
      const tpl = made.body.id as string;
      const [rev] = await revisionsOf(tpl);
      const ev = await newEvent('race2');
      await deleteTemplate(tpl, coach.id);
      await expect(db.transaction((tx) => linkEventRevision(tx, ev, rev.id, false))).rejects.toBeInstanceOf(TemplateNotFoundError);
      expect(await eventRevisionId(ev)).toBeNull();
    });

    it('currentRevisionOf throws TemplateNotFoundError when the template is gone, not an FK error', async () => {
      const ghost: any = { id: '00000000-0000-4000-8000-000000000001', currentRevisionId: null, metrics, organizationId: orgA };
      await expect(currentRevisionOf(ghost, coach.id)).rejects.toBeInstanceOf(TemplateNotFoundError);
    });

    it('a later plain batch leaves the link the first batch recorded', async () => {
      const made = await api.post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-batches`, sport: 'SOCCER', metrics });
      const ev = await newEvent('batches');
      await api.post(`/api/events/${ev}/metrics/bulk`).send({ evalTemplateId: made.body.id, metrics: [{ metricCode: 'DASH_10YD', displayOrder: 0 }] }).expect(200);
      const link = await eventRevisionId(ev);
      expect(link).not.toBeNull();
      await api.post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [{ metricCode: 'FLY10_TIME', displayOrder: 1 }] }).expect(200);
      expect(await eventRevisionId(ev)).toBe(link);
    });
  });

  describe('MQI is required in the Foundation and Performance presets', () => {
    let ev: string;

    beforeAll(async () => {
      ev = await newEvent('mqi');
      const res = await api.post(`/api/events/${ev}/apply-eval-template`).send({ templateId: foundationId });
      expect(res.status).toBe(200);
    });

    it('applying the preset marks the pattern scores required', async () => {
      const rows = await db.select().from(eventMetrics).where(and(eq(eventMetrics.eventId, ev), inArray(eventMetrics.metricCode, MQI_CODES)));
      expect(rows).toHaveLength(MQI_CODES.length);
      expect(rows.every((r) => r.isRequired)).toBe(true);
    });

    it('refuses to remove an MQI pattern score with a clear message, and keeps the row', async () => {
      const res = await api.delete(`/api/events/${ev}/metrics/MQ_LIN_ACCEL`);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Movement|MQI/);
      expect(await db.select().from(eventMetrics).where(and(eq(eventMetrics.eventId, ev), eq(eventMetrics.metricCode, 'MQ_LIN_ACCEL')))).toHaveLength(1);
    });

    it('still removes any other test, even a required one', async () => {
      await api.delete(`/api/events/${ev}/metrics/DASH_10YD`).expect(204);
    });

    it('the new-event flow (bulk add with the chosen template) records the revision and cannot leave MQI out', async () => {
      const created = await newEvent('bulk');
      // the coach removed every MQI test from the form list; the server puts the preset's MQI tests back, required
      const res = await api.post(`/api/events/${created}/metrics/bulk`).send({ evalTemplateId: foundationId, metrics: [{ metricCode: 'DASH_10YD', isRequired: false, displayOrder: 0 }] });
      expect(res.status).toBe(200);
      const rows = await db.select().from(eventMetrics).where(eq(eventMetrics.eventId, created));
      expect(rows.filter((r) => MQI_CODES.includes(r.metricCode) && r.isRequired)).toHaveLength(MQI_CODES.length);
      expect(await eventRevisionId(created)).not.toBeNull();
      await api.delete(`/api/events/${created}/metrics/MQ_DECEL`).expect(409);
      // a template of another organization is not found
      const [other] = await db.insert(organizations).values({ name: `${PREFIX}-B` } as any).returning({ id: organizations.id });
      const [foreign] = await db.insert(evalBatteryTemplates).values({ organizationId: other.id, sport: 'SOCCER', name: `${PREFIX}-foreign`, metrics } as any).returning({ id: evalBatteryTemplates.id });
      const foreignRes = await api.post(`/api/events/${created}/metrics/bulk`).send({ evalTemplateId: foreign.id, metrics: [] });
      expect(foreignRes.status).toBe(200);
      expect(foreignRes.body.warning).toBeTruthy();
    });

    it('refuses to make a locked MQI test optional (PUT isRequired=false), but allows it elsewhere', async () => {
      const res = await api.put(`/api/events/${ev}/metrics/MQ_DECEL`).send({ isRequired: false });
      expect(res.status).toBe(409);
      const [row] = await db.select().from(eventMetrics).where(and(eq(eventMetrics.eventId, ev), eq(eventMetrics.metricCode, 'MQ_DECEL')));
      expect(row.isRequired).toBe(true);
      await api.put(`/api/events/${ev}/metrics/MQ_DECEL`).send({ customLabel: 'Decel' }).expect(200);
      const plain = await newEvent('putplain');
      await db.insert(eventMetrics).values({ eventId: plain, metricCode: 'MQ_JUMP', isRequired: true, displayOrder: 1 } as any);
      await api.put(`/api/events/${plain}/metrics/MQ_JUMP`).send({ isRequired: false }).expect(200);
    });

    it('the lock follows the preset key: renaming the preset keeps it, and a new template with the old name does not inherit it', async () => {
      const [orig] = await db.select({ name: evalBatteryTemplates.name }).from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, foundationId));
      await db.update(evalBatteryTemplates).set({ name: `${PREFIX}-renamed` }).where(eq(evalBatteryTemplates.id, foundationId));
      let lookalike: string | undefined;
      try {
        await api.delete(`/api/events/${ev}/metrics/MQ_SHUFFLE`).expect(409);
        [{ id: lookalike }] = (await db.insert(evalBatteryTemplates).values({ sport: 'ALL', name: orig.name, metrics: mqiMetrics } as any).returning({ id: evalBatteryTemplates.id })) as any;
        const other = await newEvent('lookalike');
        await api.post(`/api/events/${other}/apply-eval-template`).send({ templateId: lookalike }).expect(200);
        await api.delete(`/api/events/${other}/metrics/MQ_SHUFFLE`).expect(204);
      } finally {
        if (lookalike) await db.delete(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, lookalike));
        await db.update(evalBatteryTemplates).set({ name: orig.name }).where(eq(evalBatteryTemplates.id, foundationId));
      }
    });

    it('does not lock MQI on an event without a preset, nor on one that applied an organization template', async () => {
      const plain = await newEvent('plain');
      await db.insert(eventMetrics).values({ eventId: plain, metricCode: 'MQ_JUMP', isRequired: true, displayOrder: 1 } as any);
      await api.delete(`/api/events/${plain}/metrics/MQ_JUMP`).expect(204);

      const made = await api.post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-orgmqi`, sport: 'SOCCER', metrics: mqiMetrics });
      const orgEvent = await newEvent('orgmqi');
      await api.post(`/api/events/${orgEvent}/apply-eval-template`).send({ templateId: made.body.id }).expect(200);
      await api.delete(`/api/events/${orgEvent}/metrics/MQ_JUMP`).expect(204);
    });
  });
});
