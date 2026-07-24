import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { initializeDb } from '../db/seed';
import { todayLocalDate, weekdayOf } from '../utils';
import {
  createRoutine,
  deleteRoutine,
  getRoutine,
  listRoutines,
  routinesForWeekday,
  updateRoutine,
  type RoutineInput,
} from './routine-service';

describe('routine-service (db-backed)', () => {
  let testDb: ActiOutDB;

  beforeEach(async () => {
    testDb = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
    await initializeDb(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  const today = weekdayOf(todayLocalDate());

  function baseInput(overrides: Partial<RoutineInput> = {}): RoutineInput {
    return {
      name: 'Push Day',
      daysOfWeek: [today],
      items: [
        { exerciseName: 'Bench Press' },
        { exerciseName: 'Overhead Press' },
        { exerciseName: 'Brand New Exercise' },
      ],
      ...overrides,
    };
  }

  describe('createRoutine', () => {
    it('creates a routine with 3 items, assigns positions 1..3, and stores canonical snapshots', async () => {
      const before = await testDb.exerciseCatalog.count();
      const routine = await createRoutine(baseInput(), testDb);
      const after = await testDb.exerciseCatalog.count();

      expect(routine.items).toHaveLength(3);
      expect(routine.items.map((i) => i.sequencePosition)).toEqual([1, 2, 3]);
      expect(routine.items.map((i) => i.exerciseNameSnapshot)).toEqual([
        'Bench Press',
        'Overhead Press',
        'Brand New Exercise',
      ]);
      // Only "Brand New Exercise" is not seeded, so catalog grows by exactly 1.
      expect(after).toBe(before + 1);
    });

    it('stamps defaultWeightUnit from current preference when defaultWeight is set without a unit', async () => {
      const routine = await createRoutine(
        baseInput({
          items: [{ exerciseName: 'Bench Press', defaultWeight: 135 }],
        }),
        testDb
      );

      expect(routine.items[0]?.defaultWeightUnit).toBe('lb');
    });

    it('does not stamp defaultWeightUnit when defaultWeight is not set', async () => {
      const routine = await createRoutine(
        baseInput({
          items: [{ exerciseName: 'Bench Press' }],
        }),
        testDb
      );

      expect(routine.items[0]?.defaultWeightUnit).toBeUndefined();
    });

    it('respects an explicit defaultWeightUnit even when it differs from preference', async () => {
      const routine = await createRoutine(
        baseInput({
          items: [{ exerciseName: 'Bench Press', defaultWeight: 60, defaultWeightUnit: 'kg' }],
        }),
        testDb
      );

      expect(routine.items[0]?.defaultWeightUnit).toBe('kg');
    });

    it('validates daysOfWeek values 0-6 and dedupes', async () => {
      const routine = await createRoutine(baseInput({ daysOfWeek: [1, 1, 3, 3, 5] }), testDb);
      expect(routine.daysOfWeek.slice().sort()).toEqual([1, 3, 5]);
    });

    it('throws when a daysOfWeek value is out of range', async () => {
      await expect(createRoutine(baseInput({ daysOfWeek: [7] }), testDb)).rejects.toThrow();
      await expect(createRoutine(baseInput({ daysOfWeek: [-1] }), testDb)).rejects.toThrow();
    });

    it('throws on an empty or whitespace-only name', async () => {
      await expect(createRoutine(baseInput({ name: '' }), testDb)).rejects.toThrow();
      await expect(createRoutine(baseInput({ name: '   ' }), testDb)).rejects.toThrow();
    });

    it('logs a "created" event', async () => {
      const routine = await createRoutine(baseInput(), testDb);
      const events = await testDb.appEvents.where('[entityType+entityId]').equals(['routine', routine.id]).toArray();
      expect(events.map((e) => e.eventType)).toContain('created');
    });

    it('createRoutine persists per-item restSeconds and updateRoutine changes it', async () => {
      const created = await createRoutine(
        { name: 'R', daysOfWeek: [], items: [{ exerciseName: 'Squat', restSeconds: 120 }] },
        testDb
      );
      let r = await getRoutine(created.id, testDb);
      expect(r?.items[0]?.restSeconds).toBe(120);

      await updateRoutine(
        created.id,
        { name: 'R', daysOfWeek: [], items: [{ exerciseName: 'Squat', restSeconds: 60 }] },
        testDb
      );
      r = await getRoutine(created.id, testDb);
      expect(r?.items[0]?.restSeconds).toBe(60);
    });

    it('creates a routine with a timeOfDay and round-trips it through getRoutine', async () => {
      const routine = await createRoutine(baseInput({ timeOfDay: '06:30' }), testDb);
      expect(routine.timeOfDay).toBe('06:30');

      const fetched = await getRoutine(routine.id, testDb);
      expect(fetched?.timeOfDay).toBe('06:30');
    });

    it('creates a routine without a timeOfDay as undefined (all-day)', async () => {
      const routine = await createRoutine(baseInput(), testDb);
      expect(routine.timeOfDay).toBeUndefined();
    });

    it('rejects invalid timeOfDay values', async () => {
      await expect(createRoutine(baseInput({ timeOfDay: '25:00' }), testDb)).rejects.toThrow();
      await expect(createRoutine(baseInput({ timeOfDay: '9:00' }), testDb)).rejects.toThrow();
      await expect(createRoutine(baseInput({ timeOfDay: 'noon' }), testDb)).rejects.toThrow();
    });

    it('round-trips item defaultDurationSeconds through create -> getRoutine', async () => {
      const routine = await createRoutine(
        baseInput({ items: [{ exerciseName: 'Plank', defaultDurationSeconds: 60 }] }),
        testDb
      );
      expect(routine.items[0]?.defaultDurationSeconds).toBe(60);

      const fetched = await getRoutine(routine.id, testDb);
      expect(fetched?.items[0]?.defaultDurationSeconds).toBe(60);
    });

    it('hydrates a distance_duration catalog exercise with the same measurementType', async () => {
      const routine = await createRoutine(
        baseInput({ items: [{ exerciseName: 'Treadmill Run' }] }),
        testDb
      );
      expect(routine.items[0]?.measurementType).toBe('distance_duration');

      const fetched = await getRoutine(routine.id, testDb);
      expect(fetched?.items[0]?.measurementType).toBe('distance_duration');
    });
  });

  describe('updateRoutine timeOfDay', () => {
    it('can set and then clear a previously set timeOfDay (full-replace semantics)', async () => {
      const created = await createRoutine(baseInput({ timeOfDay: '06:30' }), testDb);

      const withTime = await updateRoutine(created.id, baseInput({ timeOfDay: '18:00' }), testDb);
      expect(withTime.timeOfDay).toBe('18:00');

      const cleared = await updateRoutine(created.id, baseInput(), testDb);
      expect(cleared.timeOfDay).toBeUndefined();
    });
  });

  describe('routinesForWeekday', () => {
    it('returns routines assigned to today', async () => {
      const routine = await createRoutine(baseInput({ daysOfWeek: [today] }), testDb);
      const otherDay = (today + 1) % 7;
      await createRoutine(baseInput({ name: 'Other Day Routine', daysOfWeek: [otherDay] }), testDb);

      const results = await routinesForWeekday(today, testDb);
      expect(results.map((r) => r.id)).toContain(routine.id);
      expect(results.map((r) => r.name)).not.toContain('Other Day Routine');
    });

    it('sorts into due order: timed routines ascending by time first, then all-day routines, name as tiebreak', async () => {
      await createRoutine(baseInput({ name: 'Alpha', daysOfWeek: [today] }), testDb);
      await createRoutine(baseInput({ name: 'Zulu', daysOfWeek: [today], timeOfDay: '07:00' }), testDb);
      await createRoutine(baseInput({ name: 'Mid', daysOfWeek: [today], timeOfDay: '18:30' }), testDb);

      const results = await routinesForWeekday(today, testDb);
      expect(results.map((r) => r.name)).toEqual(['Zulu', 'Mid', 'Alpha']);
    });
  });

  describe('getRoutine / listRoutines', () => {
    it('getRoutine returns a hydrated routine with items sorted by sequencePosition', async () => {
      const created = await createRoutine(baseInput(), testDb);
      const fetched = await getRoutine(created.id, testDb);

      expect(fetched).toBeDefined();
      expect(fetched?.items.map((i) => i.sequencePosition)).toEqual([1, 2, 3]);
      expect(fetched?.daysOfWeek).toEqual(created.daysOfWeek);
    });

    it('getRoutine returns undefined for a missing id', async () => {
      const fetched = await getRoutine('does-not-exist', testDb);
      expect(fetched).toBeUndefined();
    });

    it('listRoutines returns all routines hydrated, ordered by name', async () => {
      await createRoutine(baseInput({ name: 'Zeta Routine' }), testDb);
      await createRoutine(baseInput({ name: 'Alpha Routine' }), testDb);

      const routines = await listRoutines(testDb);
      const names = routines.map((r) => r.name);
      expect(names.indexOf('Alpha Routine')).toBeLessThan(names.indexOf('Zeta Routine'));
      for (const routine of routines) {
        expect(routine.items.length).toBeGreaterThan(0);
      }
    });
  });

  describe('updateRoutine', () => {
    it('replaces items entirely, reorders, and renumbers positions 1..n', async () => {
      const created = await createRoutine(baseInput(), testDb);

      const updated = await updateRoutine(
        created.id,
        baseInput({
          items: [{ exerciseName: 'Overhead Press' }, { exerciseName: 'Squat' }],
        }),
        testDb
      );

      expect(updated.items).toHaveLength(2);
      expect(updated.items.map((i) => i.sequencePosition)).toEqual([1, 2]);
      expect(updated.items.map((i) => i.exerciseNameSnapshot)).toEqual(['Overhead Press', 'Squat']);

      const remainingItems = await testDb.routineTemplateItems
        .where('routineTemplateId')
        .equals(created.id)
        .toArray();
      expect(remainingItems).toHaveLength(2);
    });

    it('replaces daysOfWeek entirely', async () => {
      const created = await createRoutine(baseInput({ daysOfWeek: [1, 2] }), testDb);
      const updated = await updateRoutine(created.id, baseInput({ daysOfWeek: [4] }), testDb);

      expect(updated.daysOfWeek).toEqual([4]);
      const remainingDays = await testDb.routineTemplateDays
        .where('routineTemplateId')
        .equals(created.id)
        .toArray();
      expect(remainingDays.map((d) => d.weekday)).toEqual([4]);
    });

    it('logs an "updated" event', async () => {
      const created = await createRoutine(baseInput(), testDb);
      await updateRoutine(created.id, baseInput({ name: 'Push Day v2' }), testDb);

      const events = await testDb.appEvents.where('[entityType+entityId]').equals(['routine', created.id]).toArray();
      expect(events.map((e) => e.eventType)).toContain('updated');
    });

    it('throws when the routine does not exist', async () => {
      await expect(updateRoutine('does-not-exist', baseInput(), testDb)).rejects.toThrow();
    });
  });

  describe('deleteRoutine', () => {
    it('hard deletes the template, items, and days but leaves the catalog untouched', async () => {
      const created = await createRoutine(baseInput(), testDb);
      const catalogCountBefore = await testDb.exerciseCatalog.count();

      await deleteRoutine(created.id, testDb);

      const template = await testDb.routineTemplates.get(created.id);
      const items = await testDb.routineTemplateItems.where('routineTemplateId').equals(created.id).toArray();
      const days = await testDb.routineTemplateDays.where('routineTemplateId').equals(created.id).toArray();
      const catalogCountAfter = await testDb.exerciseCatalog.count();

      expect(template).toBeUndefined();
      expect(items).toHaveLength(0);
      expect(days).toHaveLength(0);
      expect(catalogCountAfter).toBe(catalogCountBefore);
    });

    it('logs a "deleted" event', async () => {
      const created = await createRoutine(baseInput(), testDb);
      await deleteRoutine(created.id, testDb);

      const events = await testDb.appEvents.where('[entityType+entityId]').equals(['routine', created.id]).toArray();
      expect(events.map((e) => e.eventType)).toContain('deleted');
    });

    it('logs no event and does not throw when the id does not exist (M1)', async () => {
      await expect(deleteRoutine('does-not-exist', testDb)).resolves.not.toThrow();

      const events = await testDb.appEvents
        .where('[entityType+entityId]')
        .equals(['routine', 'does-not-exist'])
        .toArray();
      expect(events).toHaveLength(0);
    });
  });
});
