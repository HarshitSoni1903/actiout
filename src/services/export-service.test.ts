import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { initializeDb } from '../db/seed';
import { createRoutine, listRoutines, type RoutineInput } from './routine-service';
import { completeSession, listSessions, startSession } from './session-service';
import { addBodyweight, listBodyweight } from './bodyweight-service';
import { exportBundle, importBundle, validateBundle, type ExportBundleV1 } from './export-service';

const TABLE_NAMES = [
  'preferences',
  'exerciseCatalog',
  'routineTemplates',
  'routineTemplateDays',
  'routineTemplateItems',
  'sessions',
  'sessionRoutineLinks',
  'sessionItems',
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

describe('export-service (db-backed)', () => {
  let testDb: ActiOutDB;

  beforeEach(async () => {
    testDb = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
    await initializeDb(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  describe('round-trip export -> wipe -> import', () => {
    it('restores routines, sessions, and bodyweight entries identically', async () => {
      await createRoutine(pushInput(), testDb);
      const session = await startSession([(await listRoutines(testDb))[0]!.id], undefined, testDb);
      await completeSession(session.id, testDb);
      await addBodyweight(180, 'lb', '2026-01-01', 'note', testDb);

      const routinesBefore = await listRoutines(testDb);
      const sessionsBefore = await listSessions(undefined, testDb);
      const bodyweightBefore = await listBodyweight(testDb);

      const bundle = await exportBundle(testDb);
      expect(bundle.formatVersion).toBe(1);
      expect(bundle.exportedAt).toBeDefined();

      await clearAllTables(testDb);
      expect(await listRoutines(testDb)).toEqual([]);

      await importBundle(bundle, testDb);

      expect(await listRoutines(testDb)).toEqual(routinesBefore);
      expect(await listSessions(undefined, testDb)).toEqual(sessionsBefore);
      expect(await listBodyweight(testDb)).toEqual(bodyweightBefore);
    });

    it('logs an app "import" event after a successful import', async () => {
      const bundle = await exportBundle(testDb);
      await importBundle(bundle, testDb);

      const events = await testDb.appEvents.where('[entityType+entityId]').equals(['app', 'app']).toArray();
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

    it('rejects a bundle with formatVersion 2', async () => {
      const bundle = await exportBundle(testDb);
      const badBundle = { ...bundle, formatVersion: 2 };
      const result = validateBundle(badBundle);
      expect(result.ok).toBe(false);
    });

    it('accepts a valid bundle and produces a readable summary', async () => {
      await createRoutine(pushInput(), testDb);
      const session = await startSession([(await listRoutines(testDb))[0]!.id], undefined, testDb);
      await completeSession(session.id, testDb);
      await addBodyweight(180, 'lb', undefined, undefined, testDb);

      const bundle = await exportBundle(testDb);
      const result = validateBundle(bundle);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.summary).toContain('1 routines');
        expect(result.summary).toContain('1 sessions');
        expect(result.summary).toContain('1 bodyweight entries');
      }
    });

    it('rejects a bundle missing an expected array field', async () => {
      const bundle = await exportBundle(testDb);
      const { sessions: _sessions, ...withoutSessions } = bundle;
      const result = validateBundle(withoutSessions);
      expect(result.ok).toBe(false);
    });

    it('rejects a bundle where a field is not an array', async () => {
      const bundle = await exportBundle(testDb);
      const badBundle = { ...bundle, sessions: 'not-an-array' };
      const result = validateBundle(badBundle);
      expect(result.ok).toBe(false);
    });
  });

  describe('atomicity: failed import leaves prior data intact', () => {
    it('rolls back entirely when a bulkAdd throws mid-transaction', async () => {
      await createRoutine(pushInput(), testDb);
      const priorRoutines = await listRoutines(testDb);
      const priorBodyweight = await addBodyweight(180, 'lb', undefined, undefined, testDb);

      const goodBundle = await exportBundle(testDb);

      // Craft a malformed bundle: duplicate ids within the bodyweightEntries
      // array so bulkAdd throws a ConstraintError mid-transaction.
      const dupEntry = { ...priorBodyweight };
      const malformedBundle: ExportBundleV1 = {
        ...goodBundle,
        bodyweightEntries: [dupEntry, dupEntry],
      };

      await expect(importBundle(malformedBundle, testDb)).rejects.toThrow();

      // Prior data must survive since the whole transaction should roll back.
      expect(await listRoutines(testDb)).toEqual(priorRoutines);
      const bodyweightAfter = await listBodyweight(testDb);
      expect(bodyweightAfter).toEqual([priorBodyweight]);
    });
  });
});
