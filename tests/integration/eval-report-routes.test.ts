/**
 * AM-FEAT-019 P3a: preview / save / defaults routes for the eval report.
 * Authorization comes from the EVENT's organization (not the session's primary role), and a caller who
 * may not see the event gets 404.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import express, { type Express } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { loadEvalReportInputs } from '../../packages/api/services/eval-report-service';
import { registerEventReportRoutes } from '../../packages/api/routes/event-report-routes';
import { eventRegistrations, events, measurements, organizations, reports, siteBenchmarks, siteMetrics, userOrganizations, users } from '@shared/schema';
import { evalReportConfigSchema } from '@shared/eval-report-config';
import { purgeTestRows } from '../helpers/purge-test-rows';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
// A sport of our own so the seeded benchmark rows are the only ones in play, whatever the migrations seeded
const SPORT = `EVALSPORT${suffix}`;
const VB_SPORT = `EVALVB${suffix}`;
const WELLNESS_WORDS = /sleep|soreness|stress|energy|cycle|wellness|mood|readiness|pain/i;

const keysAndText = (value: unknown, found: string[] = []): string[] => {
  if (Array.isArray(value)) value.forEach((v) => keysAndText(v, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (WELLNESS_WORDS.test(k)) found.push(k);
      keysAndText(v, found);
    }
  } else if (typeof value === 'string' && WELLNESS_WORDS.test(value)) found.push(value);
  return found;
};

describe('eval report routes', () => {
  let app: Express;
  let orgA: string;
  let orgB: string;
  let eventA: string;
  let eventB: string;
  let eventNoOrg: string;
  let eventFrozen: string;
  let eventPrior: string;
  let eventPriorB: string;
  let eventLater: string;
  const benchmarkIds: string[] = [];
  const createdSiteMetricCodes: string[] = [];
  const u: Record<string, any> = {};
  let ipCounter = 0;

  const mkUser = async (tag: string, extra: Record<string, unknown> = {}) => {
    const [row] = await db
      .insert(users)
      .values({
        username: `evalrep-${tag}-${suffix}`,
        emails: [`evalrep-${tag}-${suffix}@test.com`],
        password: 'x',
        firstName: 'Eval',
        lastName: tag,
        fullName: `Eval ${tag}`,
        ...extra,
      } as any)
      .returning();
    u[tag] = row;
    return row;
  };

  const measure = (userId: string, metric: string, value: number, over: Record<string, unknown> = {}) =>
    db
      .insert(measurements)
      .values({
        userId,
        submittedBy: u.coachA.id,
        date: '2026-05-01',
        age: 15,
        metric,
        value: String(value),
        units: 's',
        isVerified: true,
        eventId: eventA,
        organizationId: orgA,
        ...over,
      } as any)
      .returning();

  const as = (userKey: string, method: 'get' | 'post', path: string) =>
    (request(app) as any)[method](path).set('x-test-user', u[userKey].id);

  const preview = (userKey: string, eventId = eventA, athleteId = u.athlete?.id, body: object = {}) =>
    as(userKey, 'post', `/api/events/${eventId}/athletes/${athleteId}/eval-report/preview`).send(body);
  const save = (userKey: string, eventId = eventA, athleteId = u.athlete?.id, body: object = {}) =>
    as(userKey, 'post', `/api/events/${eventId}/athletes/${athleteId}/eval-report`).send(body);
  const defaults = (userKey: string, eventId = eventA, athleteId = u.athlete?.id) =>
    as(userKey, 'get', `/api/events/${eventId}/athletes/${athleteId}/eval-report/defaults`);

  const evalRows = (eventId: string, athleteId: string) =>
    db.select().from(reports).where(eq(reports.reportType, 'eval')).then((rows) =>
      rows.filter((r) => (r.config as any).eventId === eventId && (r.config as any).athleteId === athleteId),
    );

  beforeAll(async () => {
    // Every site_metrics row this file measures or benchmarks. CI builds its DB with db:push and the default seed
    // only (no manual migrations), so create what is absent and delete in afterAll only what was created here.
    const neededMetrics: Array<[code: string, category: string, unit: string, metricType: string]> = [
      ['DASH_10YD', 'speed', 's', 'lower_is_better'],
      ['TOP_SPEED', 'speed', 'mph', 'higher_is_better'],
      ['JUMP_BROAD', 'power', 'in', 'higher_is_better'],
      ['JUMP_CMJ_HOH', 'power', 'in', 'higher_is_better'],
      ['AGILITY_505_YD_L', 'agility', 's', 'lower_is_better'],
      ['AGILITY_505_YD_R', 'agility', 's', 'lower_is_better'],
      ['AGILITY_505_YD_LSI', 'agility', '%', 'higher_is_better'],
      ['RSI_105', 'power', '', 'higher_is_better'],
    ];
    for (const [code, category, unit, metricType] of neededMetrics) {
      const inserted = await db
        .insert(siteMetrics)
        .values({ code, label: code, category, unit, metricType } as any)
        .onConflictDoNothing()
        .returning({ code: siteMetrics.code });
      if (inserted.length > 0) createdSiteMetricCodes.push(code);
    }

    [{ id: orgA }] = await db.insert(organizations).values({ name: `EvalRep Org A ${suffix}` }).returning();
    [{ id: orgB }] = await db.insert(organizations).values({ name: `EvalRep Org B ${suffix}` }).returning();

    await mkUser('coachA');
    await mkUser('coachB');
    await mkUser('coachAathleteB');
    await mkUser('athleteAcoachB');
    // Sport in mixed case; the seeded rows use upper case
    await mkUser('athlete', { gender: 'Female', birthDate: '2011-03-01', graduationYear: 2029, sports: [SPORT.toLowerCase()] });
    await mkUser('noSport', { gender: 'Female', birthDate: '2011-03-01' });
    await mkUser('registered', { gender: 'Female', birthDate: '2011-03-01', sports: [SPORT] });
    await mkUser('declined', { gender: 'Female', birthDate: '2011-03-01', sports: [SPORT] });
    await mkUser('outsider', { gender: 'Female', birthDate: '2011-03-01', sports: [SPORT] });
    await mkUser('gone', { gender: 'Female', birthDate: '2011-03-01', sports: [SPORT], isActive: false });
    await mkUser('stranger');
    await mkUser('unverifiedOnly', { gender: 'Female', birthDate: '2011-03-01', sports: [SPORT] });
    await mkUser('rsiOnly', { gender: 'Female', birthDate: '2011-03-01', sports: [SPORT] });
    u.siteAdmin = { id: `site-admin-${suffix}`, isSiteAdmin: true };

    await db.insert(userOrganizations).values([
      { userId: u.coachA.id, organizationId: orgA, role: 'coach' },
      { userId: u.coachB.id, organizationId: orgB, role: 'coach' },
      { userId: u.coachAathleteB.id, organizationId: orgA, role: 'coach' },
      { userId: u.coachAathleteB.id, organizationId: orgB, role: 'athlete' },
      { userId: u.athleteAcoachB.id, organizationId: orgA, role: 'athlete' },
      { userId: u.athleteAcoachB.id, organizationId: orgB, role: 'coach' },
      { userId: u.athlete.id, organizationId: orgA, role: 'athlete' },
      { userId: u.athlete.id, organizationId: orgB, role: 'athlete' },
      { userId: u.noSport.id, organizationId: orgA, role: 'athlete' },
      { userId: u.declined.id, organizationId: orgA, role: 'athlete' },
      { userId: u.gone.id, organizationId: orgA, role: 'athlete' },
      { userId: u.registered.id, organizationId: orgA, role: 'athlete' },
      { userId: u.stranger.id, organizationId: orgA, role: 'athlete' },
      { userId: u.unverifiedOnly.id, organizationId: orgA, role: 'athlete' },
      { userId: u.rsiOnly.id, organizationId: orgA, role: 'athlete' },
    ] as any);

    const mkEvent = async (organizationId: string | null, name: string, startDate = '2026-05-01T10:00:00Z', extra = {}) => {
      const [e] = await db
        .insert(events)
        .values({ organizationId, name: `${name} ${suffix}`, startDate: new Date(startDate), ...extra } as any)
        .returning({ id: events.id });
      return e.id;
    };
    eventA = await mkEvent(orgA, 'Eval A');
    eventB = await mkEvent(orgB, 'Eval B');
    eventNoOrg = await mkEvent(null, 'Eval NoOrg');
    eventFrozen = await mkEvent(orgA, 'Eval Frozen', '2026-05-02T10:00:00Z', { isFrozen: true });
    eventPrior = await mkEvent(orgA, 'Eval Prior', '2026-03-01T10:00:00Z');
    eventPriorB = await mkEvent(orgB, 'Eval Prior B', '2026-04-01T10:00:00Z');
    eventLater = await mkEvent(orgA, 'Eval Later', '2026-06-01T10:00:00Z');

    // Benchmark rows shaped like migrations 0129 (single-average age-group rows, D1 row without ages,
    // a volleyball twin) and 0128 (sport-less left-right balance tiers)
    const bench = (id: string, over: Record<string, unknown>) => {
      benchmarkIds.push(`evalrep-${suffix}-${id}`);
      return { id: `evalrep-${suffix}-${id}`, name: `Eval ${id} ${suffix}`, gender: 'Female', isSystemDefault: false, isActive: true, displayOrder: 1, ...over };
    };
    const avg = (id: string, metricCode: string, value: string, op: string, over: Record<string, unknown>) =>
      bench(id, { metricCode, benchmarkValue: value, comparisonOperator: op, tierName: 'Average', sport: SPORT, level: 'HS', ageMin: 14, ageMax: 15, ...over });
    const lsiGroup = '0128a505-0000-4505-9151-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');
    await db.insert(siteBenchmarks).values([
      avg('dash-ms', 'DASH_10YD', '2.150', 'lte', { ageMin: 11, ageMax: 13 }),
      avg('dash-jv', 'DASH_10YD', '2.050', 'lte', {}),
      avg('dash-var', 'DASH_10YD', '1.950', 'lte', { ageMin: 16, ageMax: 18 }),
      avg('dash-vb', 'DASH_10YD', '2.500', 'lte', { sport: VB_SPORT }),
      avg('dash-d1', 'DASH_10YD', '1.870', 'lte', { level: 'D1', tierName: 'D1 Average', ageMin: null, ageMax: null }),
      avg('top-jv', 'TOP_SPEED', '14.000', 'gte', {}),
      avg('broad-jv', 'JUMP_BROAD', '57.100', 'gte', {}),
      // RSI_105 is in NO_TIER_CODES: a matching age-group row must still give no comparison
      avg('rsi105-jv', 'RSI_105', '1.500', 'gte', {}),
      avg('rsi105-d1', 'RSI_105', '2.000', 'gte', { level: 'D1', tierName: 'D1 Average', ageMin: null, ageMax: null }),
      bench('lsi-normal', { metricCode: 'AGILITY_505_YD_LSI', comparisonOperator: 'range', minValue: '95', maxValue: '100', tierGroupId: lsiGroup, tierOrder: 1, tierName: 'Normal', sport: null }),
      bench('lsi-monitor', { metricCode: 'AGILITY_505_YD_LSI', comparisonOperator: 'range', minValue: '90', maxValue: '94.999', tierGroupId: lsiGroup, tierOrder: 2, tierName: 'Monitor', sport: null }),
      bench('lsi-low', { metricCode: 'AGILITY_505_YD_LSI', comparisonOperator: 'range', minValue: '0', maxValue: '89.999', tierGroupId: lsiGroup, tierOrder: 3, tierName: 'Low', sport: null }),
    ] as any);

    await measure(u.athlete.id, 'DASH_10YD', 2.0);
    await measure(u.athlete.id, 'DASH_10YD', 1.9);
    await measure(u.athlete.id, 'JUMP_CMJ_HOH', 14, { units: 'in' });
    // A row from another organization that carries this event's id must not be used
    await measure(u.athlete.id, 'DASH_10YD', 1.5, { organizationId: orgB });
    // An unverified row is ignored
    await measure(u.athlete.id, 'DASH_10YD', 1.0, { isVerified: false });
    await measure(u.athlete.id, 'TOP_SPEED', 15, { units: 'mph' });
    await measure(u.athlete.id, 'JUMP_BROAD', 60, { units: 'in' });
    await measure(u.noSport.id, 'AGILITY_505_YD_L', 2.6);
    await measure(u.noSport.id, 'AGILITY_505_YD_R', 3.0);
    await measure(u.gone.id, 'DASH_10YD', 2.0);
    await measure(u.unverifiedOnly.id, 'DASH_10YD', 2.0, { isVerified: false });
    await measure(u.rsiOnly.id, 'RSI_105', 1.8, { units: '' });
    // The athlete in a second organization, and earlier / later events
    await measure(u.athlete.id, 'DASH_10YD', 2.2, { eventId: eventB, organizationId: orgB });
    await measure(u.athlete.id, 'DASH_10YD', 2.1, { eventId: eventPrior });
    await measure(u.athlete.id, 'DASH_10YD', 1.0, { eventId: eventPriorB, organizationId: orgB });
    await measure(u.athlete.id, 'DASH_10YD', 1.2, { eventId: eventLater });
    await measure(u.athlete.id, 'DASH_10YD', 2.3, { eventId: eventFrozen });
    // Registrations alone never grant access
    await db.insert(eventRegistrations).values([
      { eventId: eventA, userId: u.registered.id, userFullNameSnapshot: 'Eval registered', status: 'approved' },
      { eventId: eventA, userId: u.declined.id, userFullNameSnapshot: 'Eval declined', status: 'declined' },
      { eventId: eventA, userId: u.outsider.id, userFullNameSnapshot: 'Eval outsider', status: 'approved' },
    ] as any);

    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const user = Object.values(u).find((x: any) => x.id === req.get('x-test-user')) as any;
      // The session role is deliberately 'coach' for everyone: authorization must not trust it
      req.session = { user: user ? { id: user.id, username: user.username, role: 'coach', isSiteAdmin: !!user.isSiteAdmin } : undefined };
      Object.defineProperty(req, 'ip', { value: `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });
      next();
    });
    registerEventReportRoutes(app);
  });

  afterAll(async () => {
    const eventIds = [eventA, eventB, eventNoOrg, eventFrozen, eventPrior, eventPriorB, eventLater];
    await db.delete(measurements).where(inArray(measurements.eventId, eventIds));
    await db.delete(events).where(inArray(events.id, eventIds));
    await db.delete(siteBenchmarks).where(inArray(siteBenchmarks.id, benchmarkIds));
    await purgeTestRows({
      usernameLike: [`evalrep-%-${suffix}`],
      orgIds: [orgA, orgB],
    });
    if (createdSiteMetricCodes.length) await db.delete(siteMetrics).where(inArray(siteMetrics.code, createdSiteMetricCodes));
  });

  it('a coach of the event org previews the model and saves nothing', async () => {
    const res = await preview('coachA');
    expect(res.status).toBe(200);
    const dash = res.body.model.metrics.find((m: any) => m.code === 'DASH_10YD');
    expect(dash.value).toBe(1.9);
    // Seeded sets: 14-15 average 2.05 s (not the volleyball twin) and the D1 average, sport matched case-insensitively
    expect(dash.comparison).toMatchObject({ kind: 'average', status: 'at_or_better' });
    expect(dash.collegeStandard).toMatchObject({ kind: 'average', status: 'below', averageValue: 1.87 });
    expect(dash.comparison.averageValue).toBe(2.05);
    // 2026-03-01 is the prior event in this org; the org B event (1.0 s) and the later event (1.2 s) are not
    expect(dash.trend).toEqual({ change: -0.2, direction: 'improved' });
    expect(keysAndText(res.body)).toEqual([]);
    expect(res.body.model.eventDate).toBe('2026-05-01');
    expect(await evalRows(eventA, u.athlete.id)).toHaveLength(0);
  });

  it('saves a reports row with the eval type, top-level keys and a valid config', async () => {
    const res = await save('coachA', eventA, u.athlete.id, { load: 'medium', coachNote: 'Strong day\u0000', junk: 1 });
    expect(res.status).toBe(201);
    expect(res.body.report.id).toBeTruthy();
    expect(res.body.model.coachNote).toBe('Strong day');

    const [row] = await db.select().from(reports).where(eq(reports.id, res.body.report.id));
    expect(row.reportType).toBe('eval');
    expect(row.organizationId).toBe(orgA);
    expect(row.createdBy).toBe(u.coachA.id);
    expect(row.name).toContain('Eval Report');
    expect(row.name).toContain('2026-05-01');
    const config = row.config as any;
    expect(config.eventId).toBe(eventA);
    expect(config.athleteId).toBe(u.athlete.id);
    expect(config.metrics).toEqual(expect.arrayContaining(['DASH_10YD', 'JUMP_CMJ_HOH']));
    expect(config.load).toBe('medium');
    expect(config.junk).toBeUndefined();
    expect(evalReportConfigSchema.safeParse(config).success).toBe(true);
    expect(keysAndText(config)).toEqual([]);
  });

  it('returns 404 to a coach of another organization, on all three routes', async () => {
    for (const res of [await preview('coachB'), await save('coachB'), await defaults('coachB')]) {
      expect(res.status).toBe(404);
    }
  });

  it('returns 404 to an athlete-role user, even for their own data', async () => {
    expect((await preview('athlete')).status).toBe(404);
    expect((await save('athlete')).status).toBe(404);
    expect((await defaults('athlete')).status).toBe(404);
  });

  it('uses the role in the event org, not the primary org', async () => {
    // coach in A / athlete in B: may use A's event only
    expect((await preview('coachAathleteB', eventA)).status).toBe(200);
    expect((await preview('coachAathleteB', eventB, u.athlete.id)).status).toBe(404);
    // athlete in A / coach in B: may use B's event only (athlete has no data there, so register... 404 for membership
    // is still the event-org answer); on A's event the role is athlete
    expect((await preview('athleteAcoachB', eventA)).status).toBe(404);
  });

  it('reads each organization separately for an athlete who belongs to two', async () => {
    const res = await preview('athleteAcoachB', eventB, u.athlete.id);
    expect(res.status).toBe(200);
    const dash = res.body.model.metrics.find((m: any) => m.code === 'DASH_10YD');
    expect(dash.value).toBe(2.2);
    // Prior event in org B (1.0 s), not the org A events
    expect(dash.trend).toEqual({ change: 1.2, direction: 'declined' });
    expect((await preview('coachA', eventA, u.athlete.id)).body.model.metrics.find((m: any) => m.code === 'DASH_10YD').value).toBe(1.9);
  });

  it('returns 404 when the athlete has no measurements in the event, whatever their registration', async () => {
    for (const key of ['stranger', 'registered', 'declined', 'outsider']) {
      expect((await preview('coachA', eventA, u[key].id)).status, key).toBe(404);
      expect((await save('coachA', eventA, u[key].id)).status, key).toBe(404);
      expect((await defaults('coachA', eventA, u[key].id)).status, key).toBe(404);
    }
    // well-formed but unknown id: still 404 (reveals nothing)
    expect((await preview('coachA', eventA, randomUUID())).status).toBe(404);
  });

  it('returns 400 for a malformed event or athlete id, before any database query, on all three routes', async () => {
    for (const bad of ['no-such-user', '123', 'not-a-uuid']) {
      for (const res of [
        await preview('coachA', eventA, bad),
        await save('coachA', eventA, bad),
        await defaults('coachA', eventA, bad),
        await preview('coachA', bad),
        await save('coachA', bad),
        await defaults('coachA', bad),
      ]) {
        expect(res.status, bad).toBe(400);
        expect(res.body).toEqual({ message: 'Invalid id' });
      }
    }
  });

  it('returns 404 when the athlete has only unverified measurements, so no empty report is saved', async () => {
    expect((await preview('coachA', eventA, u.unverifiedOnly.id)).status).toBe(404);
    expect((await save('coachA', eventA, u.unverifiedOnly.id)).status).toBe(404);
    expect((await defaults('coachA', eventA, u.unverifiedOnly.id)).status).toBe(404);
    expect(await evalRows(eventA, u.unverifiedOnly.id)).toHaveLength(0);
  });

  it('returns 404 for a deactivated athlete', async () => {
    expect((await preview('coachA', eventA, u.gone.id)).status).toBe(404);
  });

  it('allows a frozen (read-only) event', async () => {
    expect((await preview('coachA', eventFrozen)).status).toBe(200);
    const saved = await save('coachA', eventFrozen);
    expect(saved.status).toBe(201);
    expect(saved.body.model.metrics[0].value).toBe(2.3);
  });

  it('shows measured metrics outside the key map with their age-group comparison', async () => {
    const res = await preview('coachA', eventA, u.athlete.id, { selection: { metricKeys: ['TOP_SPEED', 'JUMP_BROAD', 'WEIGHT', 'DASH_10'] } });
    expect(res.status).toBe(200);
    const byCode = Object.fromEntries(res.body.model.metrics.map((m: any) => [m.code, m]));
    expect(Object.keys(byCode)).toEqual(['TOP_SPEED', 'JUMP_BROAD', 'DASH_10YD']);
    expect(byCode.TOP_SPEED).toMatchObject({ key: null, label: 'Top speed', unit: 'mph' });
    expect(byCode.TOP_SPEED.comparison).toMatchObject({ kind: 'average', status: 'at_or_better' });
    expect(byCode.JUMP_BROAD.comparison).toMatchObject({ kind: 'average', status: 'at_or_better' });
  });

  it('shows RSI_105 (RSI_BILATERAL) with its value and no age-group or college comparison', async () => {
    const res = await preview('coachA', eventA, u.rsiOnly.id, { selection: { metricKeys: ['RSI_BILATERAL'] } });
    expect(res.status).toBe(200);
    const [rsi] = res.body.model.metrics;
    expect(rsi).toMatchObject({ key: 'RSI_BILATERAL', code: 'RSI_105', value: 1.8, comparison: null, collegeStandard: null });
  });

  it('judges the balance for a female athlete with no sport, without risk or injury wording', async () => {
    const res = await preview('coachA', eventA, u.noSport.id);
    expect(res.status).toBe(200);
    expect(res.body.model.freshAndHealthy.balance.status).toBe('worth_working_on');
    expect(JSON.stringify(res.body)).not.toMatch(/risk|injur/i);
  });

  it('gives an athlete with no sport only the sport-less left-right balance benchmark set', async () => {
    const [event] = await db.select().from(events).where(eq(events.id, eventA));
    const inputs = await loadEvalReportInputs(db, { event, athleteId: u.noSport.id });
    expect(inputs.benchmarks.length).toBeGreaterThan(0);
    for (const b of inputs.benchmarks) {
      expect(b.sport).toBeNull();
      expect(b.metricCode).toBe('AGILITY_505_YD_LSI');
    }
  });

  it('returns 404 for an unknown event, and 409 for an event without an organization (site admin)', async () => {
    expect((await preview('coachA', randomUUID())).status).toBe(404);
    expect((await preview('coachA', eventNoOrg)).status).toBe(404);
    expect((await preview('siteAdmin', eventNoOrg)).status).toBe(409);
  });

  it('rejects an invalid load and an over-long note with 400', async () => {
    expect((await preview('coachA', eventA, u.athlete.id, { load: 'extreme' })).status).toBe(400);
    expect((await preview('coachA', eventA, u.athlete.id, { coachNote: 'x'.repeat(2001) })).status).toBe(400);
    expect((await preview('coachA', eventA, u.athlete.id, { coachNote: 'x'.repeat(2000) })).status).toBe(200);
    // A limiter override must name a metric in the report
    expect((await preview('coachA', eventA, u.athlete.id, { limiterOverride: 'FLY_10' })).status).toBe(400);
    expect((await save('coachA', eventA, u.athlete.id, { limiterOverride: 'FLY_10' })).status).toBe(400);
    expect((await preview('coachA', eventA, u.athlete.id, { limiterOverride: 'DASH_10' })).status).toBe(200);
  });

  it('lets a null note clear it, and keeps strengths and development areas apart', async () => {
    const res = await preview('coachA', eventA, u.athlete.id, {
      coachNote: null,
      strengthsOverride: ['DASH_10'],
      developmentAreasOverride: ['DASH_10', 'CMJ_HOH'],
    });
    expect(res.status).toBe(200);
    expect(res.body.model.coachNote).toBeNull();
    expect(res.body.model.strengths).toEqual(['DASH_10']);
    expect(res.body.model.developmentAreas).toEqual(['CMJ_HOH']);
  });

  it('requires a session', async () => {
    const res = await request(app).post(`/api/events/${eventA}/athletes/${u.athlete.id}/eval-report/preview`).send({});
    expect(res.status).toBe(401);
  });

  it('pre-fills defaults from the latest saved eval for the event and athlete', async () => {
    const before = await defaults('coachA', eventA, u.noSport.id);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ source: 'computed', load: null, coachNote: null });
    expect(before.body.selection.preset).toBeTruthy();

    await save('coachA', eventA, u.athlete.id, { load: 'light', coachNote: 'older', selection: { preset: 'senior' } });
    const latest = await save('coachA', eventA, u.athlete.id, { load: 'heavy', coachNote: 'newest', selection: { preset: 'senior' } });
    const res = await defaults('coachA');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: 'saved', reportId: latest.body.report.id, load: 'heavy', coachNote: 'newest' });
    expect(res.body.selection.preset).toBe('senior');
    expect(res.body.offered.headline.map((o: any) => o.code)).toContain('DASH_10YD');
  });

  it('re-generating after a correction writes a NEW row and leaves the old one unchanged', async () => {
    const first = await save('coachA');
    const oldValue = first.body.model.metrics.find((m: any) => m.code === 'DASH_10YD').value;
    expect(oldValue).toBe(1.9);

    await db
      .update(measurements)
      .set({ value: '1.85' })
      .where(and(eq(measurements.eventId, eventA), eq(measurements.userId, u.athlete.id), eq(measurements.organizationId, orgA), eq(measurements.value, '1.900')));

    const second = await save('coachA');
    expect(second.body.report.id).not.toBe(first.body.report.id);
    expect(second.body.model.metrics.find((m: any) => m.code === 'DASH_10YD').value).toBe(1.85);

    const [oldRow] = await db.select().from(reports).where(eq(reports.id, first.body.report.id));
    expect((oldRow.config as any).model.metrics.find((m: any) => m.code === 'DASH_10YD').value).toBe(1.9);
  });
});
