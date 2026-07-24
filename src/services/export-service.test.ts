import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BodyweightEntry } from '../domain/types';
import { ActiOutDB } from '../db/schema';
import { initializeDb } from '../db/seed';
import { nowIso } from '../utils';
import { createRoutine, listRoutines, type RoutineInput } from './routine-service';
import { completeSession, listSessions, startSession } from './session-service';
import { addSet } from './session-set-service';
import { addBodyweight, listBodyweight } from './bodyweight-service';
import { exportBundle, importBundle, validateBundle, type ExportBundleV2 } from './export-service';

const TABLE_NAMES = [
  'preferences',
  'exerciseCatalog',
  'routineTemplates',
  'routineTemplateDays',
  'routineTemplateItems',
  'sessions',
  'sessionRoutineLinks',
  'sessionItems',
  'sessionSets',
  'bodyweightEntries',
  'appEvents',
] as const;

async function clearAllTables(database: ActiOutDB): Promise<void> {
  for (const name of TABLE_NAMES) {
    await (database as unknown as Record<string, { clear: () => Promise<void> }>)[name]!.clear();
  }
}

function pushInput(overrides: Partial<RoutineInput> = {}): RoutineInput {
  return {
    name: 'Push Day',
    daysOfWeek: [1],
    defaultSets: 3,
    defaultReps: 10,
    items: [{ exerciseName: 'Bench Press', defaultSets: 5, defaultReps: 5, defaultWeight: 100, defaultWeightUnit: 'lb' }],
    ...overrides,
  };
}

// Seeds a routine, a completed session with ≥1 completed sessionSet, and a
// bodyweight entry — a referentially-valid slice used by the round-trip tests.
async function seedRoutinesAndSessions(database: ActiOutDB): Promise<void> {
  await createRoutine(pushInput(), database);
  const routineId = (await listRoutines(database))[0]!.id;
  const session = await startSession([routineId], undefined, database);
  const item = session.items[0]!;
  await addSet(item.id, { reps: 5, weight: 100, completed: true }, database);
  await completeSession(session.id, database);
  await addBodyweight(180, 'lb', '2026-01-01', 'note', database);
}

describe('export-service (db-backed)', () => {
  let dbx: ActiOutDB;

  beforeEach(async () => {
    dbx = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
    await initializeDb(dbx);
  });

  afterEach(async () => {
    await dbx.delete();
  });

  describe('round-trip export -> wipe -> import', () => {
    it('restores routines, sessions, sets, and bodyweight entries identically', async () => {
      await seedRoutinesAndSessions(dbx);

      const routinesBefore = await listRoutines(dbx);
      const sessionsBefore = await listSessions(undefined, dbx);
      const bodyweightBefore = await listBodyweight(dbx);
      const setsBefore = await dbx.sessionSets.toArray();

      const bundle = await exportBundle(dbx);
      expect(bundle.formatVersion).toBe(2);
      expect(bundle.exportedAt).toBeDefined();

      await clearAllTables(dbx);
      expect(await listRoutines(dbx)).toEqual([]);

      await importBundle(bundle, dbx);

      expect(await listRoutines(dbx)).toEqual(routinesBefore);
      expect(await listSessions(undefined, dbx)).toEqual(sessionsBefore);
      expect(await listBodyweight(dbx)).toEqual(bodyweightBefore);
      expect(await dbx.sessionSets.toArray()).toEqual(setsBefore);
    });

    it('exportBundle emits formatVersion 2 with sessionSets', async () => {
      const b = await exportBundle(dbx);
      expect(b.formatVersion).toBe(2);
      expect(Array.isArray(b.sessionSets)).toBe(true);
    });

    it('importBundle round-trips sessionSets', async () => {
      await seedRoutinesAndSessions(dbx);
      const b = await exportBundle(dbx);
      await importBundle(b, dbx);
      const sets = await dbx.sessionSets.toArray();
      expect(sets.length).toBe(b.sessionSets.length);
      expect(sets.length).toBeGreaterThan(0);
    });

    it('importBundle takes a pre-import snapshot before clearing', async () => {
      await seedRoutinesAndSessions(dbx);
      const b = await exportBundle(dbx);
      await importBundle(b, dbx);
      const reasons = (await dbx.snapshots.toArray()).map((s) => s.reason);
      expect(reasons).toContain('pre-import');
    });

    it('logs an app "import" event after a successful import', async () => {
      const bundle = await exportBundle(dbx);
      await importBundle(bundle, dbx);

      const events = await dbx.appEvents.where('[entityType+entityId]').equals(['app', 'app']).toArray();
      expect(events.some((e) => e.eventType === 'import')).toBe(true);
    });
  });

  describe('validateBundle', () => {
    it('rejects an empty object with a reason', () => {
      const result = validateBundle({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBeTruthy();
      }
    });

    it('rejects a v1 bundle', () => {
      const result = validateBundle({
        formatVersion: 1,
        preferences: [],
        exerciseCatalog: [],
        routineTemplates: [],
        routineTemplateDays: [],
        routineTemplateItems: [],
        sessions: [],
        sessionRoutineLinks: [],
        sessionItems: [],
        sessionSets: [],
        bodyweightEntries: [],
        appEvents: [],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('expected 2');
      }
    });

    it('accepts a valid bundle and produces a readable summary', async () => {
      await seedRoutinesAndSessions(dbx);

      const bundle = await exportBundle(dbx);
      const result = validateBundle(bundle);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.summary).toContain('1 routines');
        expect(result.summary).toContain('1 sessions');
        expect(result.summary).toContain('1 bodyweight entries');
      }
    });

    it('rejects a bundle missing an expected array field', async () => {
      const bundle = await exportBundle(dbx);
      const { sessions: _sessions, ...withoutSessions } = bundle;
      const result = validateBundle(withoutSessions);
      expect(result.ok).toBe(false);
    });

    it('rejects a bundle where a field is not an array', async () => {
      const bundle = await exportBundle(dbx);
      const badBundle = { ...bundle, sessions: 'not-an-array' };
      const result = validateBundle(badBundle);
      expect(result.ok).toBe(false);
    });

    it('rejects a session row missing "status", naming the table, index, and field', () => {
      const badBundle = {
        formatVersion: 2,
        preferences: [],
        exerciseCatalog: [],
        routineTemplates: [],
        routineTemplateDays: [],
        routineTemplateItems: [],
        sessions: [{ id: 'x' }],
        sessionRoutineLinks: [],
        sessionItems: [],
        sessionSets: [],
        bodyweightEntries: [],
        appEvents: [],
      };
      const result = validateBundle(badBundle);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('sessions[0]');
        expect(result.reason).toMatch(/missing or invalid/);
      }
    });

    it('enforces sessionSets → sessionItems referential integrity', async () => {
      await seedRoutinesAndSessions(dbx);
      const b = await exportBundle(dbx);
      (b.sessionSets as never[]).push({
        id: 'x',
        sessionId: b.sessions[0]?.id ?? 's',
        sessionItemId: 'ghost',
        setNumber: 1,
        weightUnit: 'lb',
        isWarmup: false,
        completed: false,
        createdAt: 'a',
        updatedAt: 'a',
      } as never);
      const r = validateBundle(b);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toContain('sessionItemId');
      }
    });

    it('rejects a sessionItems row whose sessionId matches no session', async () => {
      const bundle = await exportBundle(dbx);
      const badBundle: ExportBundleV2 = {
        ...bundle,
        sessionItems: [
          {
            id: crypto.randomUUID(),
            sessionId: 'does-not-exist',
            exerciseNameSnapshot: 'Bench Press',
            sequencePosition: 1,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
        ],
      };
      const result = validateBundle(badBundle);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('sessionItems[0]');
        expect(result.reason).toContain('sessionId');
      }
    });

    it('rejects duplicate ids within a table', async () => {
      const bundle = await exportBundle(dbx);
      const dupEntry: BodyweightEntry = {
        id: crypto.randomUUID(),
        entryDate: '2026-01-01',
        weightValue: 180,
        weightUnit: 'lb',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      const badBundle: ExportBundleV2 = {
        ...bundle,
        bodyweightEntries: [dupEntry, dupEntry],
      };
      const result = validateBundle(badBundle);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('duplicate id');
      }
    });

    it('tolerates the optional timeOfDay/defaultDurationSeconds/durationSeconds placeholder fields', async () => {
      await seedRoutinesAndSessions(dbx);

      const bundle = await exportBundle(dbx);
      const withPlaceholders: ExportBundleV2 = {
        ...bundle,
        routineTemplates: bundle.routineTemplates.map((row) => ({ ...row, timeOfDay: '06:30' })),
        routineTemplateItems: bundle.routineTemplateItems.map((row) => ({ ...row, defaultDurationSeconds: 60 })),
        sessionSets: bundle.sessionSets.map((row) => ({ ...row, durationSeconds: 45 })),
        sessionItems: bundle.sessionItems.map((row) => ({ ...row, activatedAt: nowIso(), dnfAt: nowIso() })),
      };

      const result = validateBundle(withPlaceholders);
      expect(result.ok).toBe(true);
    });

    it('accepts a bundle with a dangling sessionRoutineLinks.routineTemplateId (deleted-routine case)', async () => {
      await seedRoutinesAndSessions(dbx);

      const bundle = await exportBundle(dbx);
      const badBundle: ExportBundleV2 = {
        ...bundle,
        routineTemplates: [],
        routineTemplateDays: [],
        routineTemplateItems: [],
      };

      const result = validateBundle(badBundle);
      expect(result.ok).toBe(true);
    });
  });

  // The measurement-model fields are all optional, so the validator must
  // tolerate them and the clear-then-bulkAdd import pass must carry them
  // through verbatim.
  describe('measurement-model fields', () => {
    const CATALOG_ID = 'catalog-measurement';

    // Stamps measurementType/category on a catalog row, distance/distanceUnit
    // on every session set, and measurementTypeSnapshot on every session item.
    // Returns the pre-export row counts read straight from Dexie, so the
    // round-trip assertions below can anchor on a count that is independent of
    // whatever exportBundle/importBundle actually produced (a dropped row must
    // fail, not silently shrink both sides of the comparison).
    async function seedMeasurementFields(
      database: ActiOutDB
    ): Promise<{ itemCount: number; setCount: number }> {
      await seedRoutinesAndSessions(database);

      await database.exerciseCatalog.add({
        id: CATALOG_ID,
        canonicalName: 'Weighted Farmer Carry Test',
        normalizedName: 'weighted farmer carry test',
        category: 'cardio',
        measurementType: 'distance_duration',
        isCustom: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      const items = await database.sessionItems.toArray();
      for (const item of items) {
        await database.sessionItems.update(item.id, { measurementTypeSnapshot: 'distance_duration' });
      }

      const sets = await database.sessionSets.toArray();
      for (const set of sets) {
        await database.sessionSets.update(set.id, { distance: 3.1, distanceUnit: 'mi', durationSeconds: 1500 });
      }

      return { itemCount: items.length, setCount: sets.length };
    }

    it('validateBundle accepts a bundle carrying the measurement-model fields', async () => {
      const { itemCount, setCount } = await seedMeasurementFields(dbx);
      expect(itemCount).toBeGreaterThan(0);
      expect(setCount).toBeGreaterThan(0);

      const bundle = await exportBundle(dbx);

      // The bundle must actually carry the new fields — a validator that says
      // "ok" about a bundle exportBundle had already stripped proves nothing.
      const catalogRow = bundle.exerciseCatalog.find((row) => row.id === CATALOG_ID);
      expect(catalogRow?.measurementType).toBe('distance_duration');
      expect(catalogRow?.category).toBe('cardio');

      expect(bundle.sessionItems.map((i) => i.measurementTypeSnapshot)).toEqual(
        new Array<string>(itemCount).fill('distance_duration')
      );
      expect(bundle.sessionSets.map((s) => s.distance)).toEqual(new Array<number>(setCount).fill(3.1));
      expect(bundle.sessionSets.map((s) => s.distanceUnit)).toEqual(new Array<string>(setCount).fill('mi'));
      expect(bundle.sessionSets.map((s) => s.durationSeconds)).toEqual(new Array<number>(setCount).fill(1500));

      const result = validateBundle(bundle);
      expect(result.ok).toBe(true);
    });

    it('an export -> import round trip preserves measurementType, category, distance, and the snapshot', async () => {
      const { itemCount, setCount } = await seedMeasurementFields(dbx);
      expect(itemCount).toBeGreaterThan(0);
      expect(setCount).toBeGreaterThan(0);

      const bundle = await exportBundle(dbx);
      expect(bundle.sessionItems.length).toBe(itemCount);
      expect(bundle.sessionSets.length).toBe(setCount);

      await clearAllTables(dbx);
      expect(await dbx.exerciseCatalog.toArray()).toEqual([]);

      await importBundle(bundle, dbx);

      const catalogRow = await dbx.exerciseCatalog.get(CATALOG_ID);
      expect(catalogRow?.measurementType).toBe('distance_duration');
      expect(catalogRow?.category).toBe('cardio');

      // Row counts are anchored on the pre-export DB counts, so losing rows
      // fails here rather than silently shrinking the expected arrays too.
      const items = await dbx.sessionItems.toArray();
      expect(items.length).toBe(itemCount);
      expect(items.map((i) => i.measurementTypeSnapshot)).toEqual(
        new Array<string>(itemCount).fill('distance_duration')
      );

      const sets = await dbx.sessionSets.toArray();
      expect(sets.length).toBe(setCount);
      expect(sets.map((s) => s.distance)).toEqual(new Array<number>(setCount).fill(3.1));
      expect(sets.map((s) => s.distanceUnit)).toEqual(new Array<string>(setCount).fill('mi'));
      expect(sets.map((s) => s.durationSeconds)).toEqual(new Array<number>(setCount).fill(1500));
    });

    it('the seeded starter catalog keeps its measurementType/category across a round trip', async () => {
      const catalogBefore = await dbx.exerciseCatalog.toArray();
      expect(catalogBefore.some((row) => row.measurementType !== undefined)).toBe(true);

      const bundle = await exportBundle(dbx);
      await clearAllTables(dbx);
      await importBundle(bundle, dbx);

      const catalogAfter = await dbx.exerciseCatalog.toArray();
      expect(catalogAfter).toEqual(catalogBefore);
    });
  });

  describe('importBundle defensive re-validation', () => {
    it('throws and leaves existing data intact when handed an invalid bundle directly', async () => {
      await createRoutine(pushInput(), dbx);
      const priorRoutines = await listRoutines(dbx);

      const invalidBundle = {
        formatVersion: 2,
        preferences: [],
        exerciseCatalog: [],
        routineTemplates: [],
        routineTemplateDays: [],
        routineTemplateItems: [],
        sessions: [{ id: 'x' }],
        sessionRoutineLinks: [],
        sessionItems: [],
        sessionSets: [],
        bodyweightEntries: [],
        appEvents: [],
      } as unknown as ExportBundleV2;

      await expect(importBundle(invalidBundle, dbx)).rejects.toThrow();
      expect(await listRoutines(dbx)).toEqual(priorRoutines);
    });
  });

  describe('atomicity: failed import leaves prior data intact', () => {
    it('rolls back entirely when a bulkAdd throws mid-transaction', async () => {
      await createRoutine(pushInput(), dbx);
      const priorRoutines = await listRoutines(dbx);
      const priorBodyweight = await addBodyweight(180, 'lb', undefined, undefined, dbx);

      const goodBundle = await exportBundle(dbx);

      const dupEntry = { ...priorBodyweight };
      const malformedBundle: ExportBundleV2 = {
        ...goodBundle,
        bodyweightEntries: [dupEntry, dupEntry],
      };

      await expect(importBundle(malformedBundle, dbx)).rejects.toThrow();

      expect(await listRoutines(dbx)).toEqual(priorRoutines);
      const bodyweightAfter = await listBodyweight(dbx);
      expect(bodyweightAfter).toEqual([priorBodyweight]);
    });
  });
});
