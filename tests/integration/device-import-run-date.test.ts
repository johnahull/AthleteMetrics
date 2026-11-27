/**
 * Device import: measurements are dated by the run date in the file, never by the upload date.
 *
 * The import dialog sends no session date for a one-date file, so the service takes it from the file.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { eq, inArray, sql } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { db } from '../../packages/api/db';
import { DeviceImportService } from '../../packages/api/services/device-import-service';
import { importBatches, measurements, organizations, userOrganizations, users } from '@shared/schema';

const HEADER =
  'Date,First Name,Middle Name,Last Name,Type,Lane ID,Units,Start Distance,Split Time 1,Split Distance 1,Split Speed 1,Start Time 2,Split Distance 2,Split Speed 2,Start Time 3,Split Distance 3,Split Speed 3,Start Time 4,Split Distance 4,Split Speed 4,Start Time 5,Split Distance 5,Split Speed 5,Start Time 6,Split Distance 6,Split Speed 6,Final Time,Final Distance,Final Speed,Jump Distance,Reaction Time,Direction,Weight,Reps,1 RM,Lap Time 1,Lap Time 2,Lap Time 3,Lap Time 4,Lap Time 5,Lap Time 6,Lap Time 7,Lap Time 8,Lap Time 9,RAST Time 1,RAST Time 2,RAST Time 3,RAST Time 4,RAST Time 5,RAST Time 6,Average RSI,Max RSI,RSI,Speed Ratio,Symmetry Score,MultiPlanar Plyometric Index,Custom Event Results';

describe('device import: measurement date comes from the file', () => {
  const importer = new DeviceImportService();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const lastName = `Date${suffix.replace(/[^a-z0-9]/gi, '')}`;
  let orgId: string;
  let coachId: string;
  let athleteId: string;
  const createdMetrics: string[] = [];

  /** One 30 yd Dash row with 10 / 20 yd gates (so a 10 yd fly is derived) and an RSI value. */
  const row = (timestamp: string, final = 4.09) => {
    const columns = HEADER.split(',');
    const cols = new Array(columns.length).fill('');
    Object.assign(cols, { 0: timestamp, 1: 'Lucy', 3: lastName, 4: 'Dash', 6: 'Imperial', 8: '1.69', 9: '10', 11: '2.95', 12: '20', 26: String(final), 27: '30' });
    cols[columns.indexOf('RSI')] = '1.9';
    return cols.join(',');
  };
  const file = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'));

  const parse = (buffer: Buffer, sessionDate?: string) =>
    importer.parseAndMatch(buffer, 'run.csv', 'dashr', orgId, coachId, undefined, sessionDate);
  const commit = (batchId: string) =>
    importer.commitBatch({
      batchId,
      duplicateStrategy: 'skip',
      addMissingEventMetrics: false,
      athletes: [{ csvName: `Lucy ${lastName}`, matchedAthleteId: athleteId, included: true }],
      committedBy: coachId,
      organizationId: orgId,
    });
  const imported = () => db.select().from(measurements).where(eq(measurements.userId, athleteId));

  beforeAll(async () => {
    // CI's seed has no yard dash split codes; RSI and FLY10_TIME are seeded
    const inserted = await db.execute<{ code: string }>(sql`
      INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision)
      VALUES
        ('DASH_10YD', 'Test 10 yd', 'Speed', 's', 'lower_is_better', false, true, 920, 3),
        ('DASH_20YD', 'Test 20 yd', 'Speed', 's', 'lower_is_better', false, true, 921, 3),
        ('DASH_30YD', 'Test 30 yd', 'Speed', 's', 'lower_is_better', false, true, 923, 3)
      ON CONFLICT (code) DO NOTHING
      RETURNING code
    `);
    createdMetrics.push(...inserted.map((r) => r.code));
    const [org] = await db.insert(organizations).values({ name: `RunDate Org ${suffix}` }).returning();
    orgId = org.id;
    const mk = async (name: string, extra: object = {}) =>
      (
        await db
          .insert(users)
          .values({
            username: `rundate-${name}-${suffix}`,
            emails: [`rundate-${name}-${suffix}@test.com`],
            password: 'x',
            firstName: name === 'athlete' ? 'Lucy' : 'Coach',
            lastName: name === 'athlete' ? lastName : `Coach${suffix}`,
            fullName: `${name} ${suffix}`,
            ...extra,
          } as any)
          .returning()
      )[0];
    athleteId = (await mk('athlete', { birthDate: '2008-06-15', birthYear: 2008 })).id;
    coachId = (await mk('coach')).id;
    await db.insert(userOrganizations).values([
      { userId: athleteId, organizationId: orgId, role: 'athlete' },
      { userId: coachId, organizationId: orgId, role: 'coach' },
    ]);
  });

  afterEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
  });

  afterAll(async () => {
    await db.delete(importBatches).where(eq(importBatches.organizationId, orgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, [athleteId, coachId]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    if (createdMetrics.length > 0) {
      await db.execute(sql`DELETE FROM site_metrics WHERE code IN (${sql.join(createdMetrics.map((c) => sql`${c}`), sql`, `)})`);
    }
  });

  it('dates every row of a one-date file with that date when no session date is sent', async () => {
    const parsed = await parse(file(row('3/5/2019 9:05'), row('03/05/2019 09:10:00', 4.2)));
    await commit(parsed.batchId);

    const rows = await imported();
    // Drill, splits, RSI and at least one derived fly
    expect(rows.map((r) => r.metric)).toEqual(expect.arrayContaining(['DASH_10YD', 'DASH_20YD', 'DASH_30YD', 'RSI']));
    expect(rows.some((r) => r.metric.startsWith('FLY10_TIME'))).toBe(true);
    expect(new Set(rows.map((r) => r.date))).toEqual(new Set(['2019-03-05']));
    // Age on the run date, not today
    expect(new Set(rows.map((r) => r.age))).toEqual(new Set([10]));
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, parsed.batchId));
    expect(batch.sessionDate).toBe('2019-03-05');
  });

  it('skips a re-import of the same one-date file as duplicates', async () => {
    const buffer = file(row('03/05/2019 09:05:00'));
    const first = await commit((await parse(buffer)).batchId);
    const second = await commit((await parse(buffer)).batchId);
    expect(second.measurementsCreated).toBe(0);
    expect(second.measurementsSkipped).toBe(first.measurementsCreated);
  });

  it('imports only the rows with a readable date and says how many were skipped', async () => {
    const parsed = await parse(file(row('03/05/2019 09:05:00'), row('not a date', 3.9)));
    expect(parsed.warnings).toContain('1 row(s) skipped: unreadable Date (expected M/D/YYYY with a 4-digit year)');
    await commit(parsed.batchId);
    expect((await imported()).filter((r) => r.metric === 'DASH_30YD').map((r) => Number(r.value))).toEqual([4.09]);
  });

  it('rejects a file with no readable date', async () => {
    await expect(parse(file(row('not a date')))).rejects.toThrow('No importable rows found');
  });

  it('rejects a session date that is not in the file', async () => {
    await expect(parse(file(row('03/05/2019 09:05:00')), '2019-03-06')).rejects.toThrow(
      'The selected session date is not in this file',
    );
  });

  it('refuses to commit a several-date file until one date is chosen', async () => {
    const buffer = file(row('03/05/2019 09:05:00'), row('03/07/2019 09:05:00'));
    const unchosen = await parse(buffer);
    await expect(commit(unchosen.batchId)).rejects.toThrow('This import has no session date. Upload the file again.');
    expect(await imported()).toEqual([]);

    await commit((await parse(buffer, '2019-03-07')).batchId);
    expect(new Set((await imported()).map((r) => r.date))).toEqual(new Set(['2019-03-07']));
  });
});
