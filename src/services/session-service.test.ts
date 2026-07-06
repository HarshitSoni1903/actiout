import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { initializeDb } from '../db/seed';
import { updatePreferences } from './preference-service';
import { createRoutine, type RoutineInput } from './routine-service';
import { KG_PER_LB } from '../domain/units';
import { todayLocalDate } from '../utils/dates';
import {
  DraftExistsError,
  addSessionItem,
  completeSession,
  dnfSession,
  getActiveDraft,
  getSession,
  listSessions,
  moveSessionItem,
  removeSessionItem,
  startQuickSession,
  startSession,
  updateSessionItem,
} from './session-service';

describe('session-service (db-backed)', () => {
  let testDb: ActiOutDB;

  beforeEach(async () => {
    testDb = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
    await initializeDb(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  // Routine A: 3 items. defaultSets 3, defaultReps 10.
  //   pos1 Bench Press  — explicit sets/reps/weight (lb)
  //   pos2 Overhead Press — inherits routine defaults
  //   pos3 Lateral Raise — reps override only (sets inherit)
  function pushInput(overrides: Partial<RoutineInput> = {}): RoutineInput {
    return {
      name: 'Push Day',
      daysOfWeek: [1],
      defaultSets: 3,
      defaultReps: 10,
      items: [
        { exerciseName: 'Bench Press', defaultSets: 5, defaultReps: 5, defaultWeight: 100, defaultWeightUnit: 'lb' },
        { exerciseName: 'Overhead Press' },
        { exerciseName: 'Lateral Raise', defaultReps: 15 },
      ],
      ...overrides,
    };
  }

  // Routine B: 2 items. defaultSets 4 (no defaultReps).
  function pullInput(overrides: Partial<RoutineInput> = {}): RoutineInput {
    return {
      name: 'Pull Day',
      daysOfWeek: [2],
      defaultSets: 4,
      items: [{ exerciseName: 'Deadlift' }, { exerciseName: 'Barbell Row' }],
      ...overrides,
    };
  }

  describe('startSession', () => {
    it('builds a draft from 2 routines: 5 items positions 1..5, links sourceSequence [1,2]', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const pull = await createRoutine(pullInput(), testDb);

      const session = await startSession([push.id, pull.id], undefined, testDb);

      expect(session.status).toBe('draft');
      expect(session.sourceMode).toBe('routine');
      expect(session.sessionDate).toBe(todayLocalDate());
      expect(session.startedAt).toBeDefined();

      expect(session.items).toHaveLength(5);
      expect(session.items.map((i) => i.sequencePosition)).toEqual([1, 2, 3, 4, 5]);
      expect(session.items.map((i) => i.exerciseNameSnapshot)).toEqual([
        'Bench Press',
        'Overhead Press',
        'Lateral Raise',
        'Deadlift',
        'Barbell Row',
      ]);

      expect(session.routineLinks).toHaveLength(2);
      expect(session.routineLinks.map((l) => l.sourceSequence)).toEqual([1, 2]);
      expect(session.routineLinks.map((l) => l.routineNameSnapshot)).toEqual(['Push Day', 'Pull Day']);
      expect(session.routineLinks.map((l) => l.routineTemplateId)).toEqual([push.id, pull.id]);
    });

    it('prefills planned/actual from item defaults falling back to routine defaults', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);

      const bench = session.items[0]!;
      expect(bench.setsPlanned).toBe(5);
      expect(bench.repsPlanned).toBe(5);
      expect(bench.setsActual).toBe(5);
      expect(bench.repsActual).toBe(5);
      expect(bench.completed).toBe(false);

      const ohp = session.items[1]!;
      expect(ohp.setsPlanned).toBe(3); // routine default
      expect(ohp.repsPlanned).toBe(10); // routine default
      expect(ohp.setsActual).toBe(3);
      expect(ohp.repsActual).toBe(10);

      const lateral = session.items[2]!;
      expect(lateral.setsPlanned).toBe(3); // routine default
      expect(lateral.repsPlanned).toBe(15); // item override
    });

    it('stamps weightUnit to the current preference unit for every item', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);
      for (const item of session.items) {
        expect(item.weightUnit).toBe('lb');
      }
    });

    it('converts defaultWeight to the current preference unit when the units differ (lb -> kg)', async () => {
      await updatePreferences({ weightUnit: 'kg' }, testDb);
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);

      const bench = session.items[0]!;
      expect(bench.weightUnit).toBe('kg');
      expect(bench.weightActual).toBeCloseTo(100 * KG_PER_LB, 6); // ~45.359237
    });

    it('respects an explicit session date', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], '2026-01-15', testDb);
      expect(session.sessionDate).toBe('2026-01-15');
    });

    it('throws DraftExistsError with the existing draft id when a draft already exists', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const first = await startSession([push.id], undefined, testDb);

      await expect(startSession([push.id], undefined, testDb)).rejects.toBeInstanceOf(DraftExistsError);
      try {
        await startSession([push.id], undefined, testDb);
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(DraftExistsError);
        expect((err as DraftExistsError).draftId).toBe(first.id);
      }
    });

    it('allows starting a new session after the prior draft is DNF-ed', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const first = await startSession([push.id], undefined, testDb);
      await dnfSession(first.id, testDb);

      const second = await startSession([push.id], undefined, testDb);
      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe('draft');
    });

    it('logs a "started" event', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);
      const events = await testDb.appEvents.where('[entityType+entityId]').equals(['session', session.id]).toArray();
      expect(events.map((e) => e.eventType)).toContain('started');
    });
  });

  describe('startQuickSession', () => {
    it('creates a draft with 0 items and sourceMode "quick"', async () => {
      const session = await startQuickSession(undefined, testDb);
      expect(session.status).toBe('draft');
      expect(session.sourceMode).toBe('quick');
      expect(session.items).toHaveLength(0);
      expect(session.routineLinks).toHaveLength(0);
    });

    it('is blocked by an existing draft', async () => {
      await startQuickSession(undefined, testDb);
      await expect(startQuickSession(undefined, testDb)).rejects.toBeInstanceOf(DraftExistsError);
    });
  });

  describe('getActiveDraft / getSession', () => {
    it('getActiveDraft returns the current draft hydrated, undefined when none', async () => {
      expect(await getActiveDraft(testDb)).toBeUndefined();
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);

      const active = await getActiveDraft(testDb);
      expect(active?.id).toBe(session.id);
      expect(active?.items).toHaveLength(3);
    });

    it('getSession hydrates items sorted by sequencePosition and returns undefined for a missing id', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const pull = await createRoutine(pullInput(), testDb);
      const session = await startSession([push.id, pull.id], undefined, testDb);

      const fetched = await getSession(session.id, testDb);
      expect(fetched?.items.map((i) => i.sequencePosition)).toEqual([1, 2, 3, 4, 5]);
      expect(await getSession('missing', testDb)).toBeUndefined();
    });
  });

  describe('moveSessionItem', () => {
    it('swaps positions with the neighbour on up/down and no-ops at the boundary', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);
      const [a, b, c] = session.items; // Bench(1), OHP(2), Lateral(3)

      // Move OHP up -> swaps with Bench
      await moveSessionItem(b!.id, 'up', testDb);
      let refreshed = await getSession(session.id, testDb);
      expect(refreshed!.items.map((i) => i.exerciseNameSnapshot)).toEqual([
        'Overhead Press',
        'Bench Press',
        'Lateral Raise',
      ]);

      // Move it back down
      await moveSessionItem(b!.id, 'down', testDb);
      refreshed = await getSession(session.id, testDb);
      expect(refreshed!.items.map((i) => i.exerciseNameSnapshot)).toEqual([
        'Bench Press',
        'Overhead Press',
        'Lateral Raise',
      ]);

      // Boundary: first item up is a no-op
      await moveSessionItem(a!.id, 'up', testDb);
      refreshed = await getSession(session.id, testDb);
      expect(refreshed!.items.map((i) => i.exerciseNameSnapshot)).toEqual([
        'Bench Press',
        'Overhead Press',
        'Lateral Raise',
      ]);

      // Boundary: last item down is a no-op
      await moveSessionItem(c!.id, 'down', testDb);
      refreshed = await getSession(session.id, testDb);
      expect(refreshed!.items.map((i) => i.sequencePosition)).toEqual([1, 2, 3]);
    });

    it('logs an "item-moved" event', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);
      await moveSessionItem(session.items[1]!.id, 'up', testDb);
      const events = await testDb.appEvents.where('[entityType+entityId]').equals(['session', session.id]).toArray();
      expect(events.map((e) => e.eventType)).toContain('item-moved');
    });
  });

  describe('addSessionItem', () => {
    it('appends a new item at position n+1 with the preference unit and no planned/actual', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);

      const added = await addSessionItem(session.id, 'Plank', testDb);
      expect(added.sequencePosition).toBe(4);
      expect(added.weightUnit).toBe('lb');
      expect(added.completed).toBe(false);
      expect(added.setsPlanned).toBeUndefined();
      expect(added.setsActual).toBeUndefined();
      expect(added.repsPlanned).toBeUndefined();
      expect(added.weightActual).toBeUndefined();

      const refreshed = await getSession(session.id, testDb);
      expect(refreshed!.items.map((i) => i.exerciseNameSnapshot)).toEqual([
        'Bench Press',
        'Overhead Press',
        'Lateral Raise',
        'Plank',
      ]);
    });

    it('appends at position 1 for an empty (quick) session', async () => {
      const session = await startQuickSession(undefined, testDb);
      const added = await addSessionItem(session.id, 'Plank', testDb);
      expect(added.sequencePosition).toBe(1);
    });

    it('logs an "item-added" event', async () => {
      const session = await startQuickSession(undefined, testDb);
      await addSessionItem(session.id, 'Plank', testDb);
      const events = await testDb.appEvents.where('[entityType+entityId]').equals(['session', session.id]).toArray();
      expect(events.map((e) => e.eventType)).toContain('item-added');
    });
  });

  describe('removeSessionItem', () => {
    it('deletes a middle item and renumbers the remainder contiguously 1..n preserving order', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const pull = await createRoutine(pullInput(), testDb);
      const session = await startSession([push.id, pull.id], undefined, testDb);
      const middle = session.items[2]!; // Lateral Raise (pos 3)

      await removeSessionItem(middle.id, testDb);

      const refreshed = await getSession(session.id, testDb);
      expect(refreshed!.items.map((i) => i.sequencePosition)).toEqual([1, 2, 3, 4]);
      expect(refreshed!.items.map((i) => i.exerciseNameSnapshot)).toEqual([
        'Bench Press',
        'Overhead Press',
        'Deadlift',
        'Barbell Row',
      ]);
    });

    it('logs an "item-removed" event', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);
      await removeSessionItem(session.items[0]!.id, testDb);
      const events = await testDb.appEvents.where('[entityType+entityId]').equals(['session', session.id]).toArray();
      expect(events.map((e) => e.eventType)).toContain('item-removed');
    });
  });

  describe('updateSessionItem', () => {
    it('patches actuals and completed, leaving other fields intact', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);
      const item = session.items[0]!;

      await updateSessionItem(item.id, { setsActual: 7, weightActual: 145, completed: true, notes: 'PR' }, testDb);

      const refreshed = await getSession(session.id, testDb);
      const updated = refreshed!.items.find((i) => i.id === item.id)!;
      expect(updated.setsActual).toBe(7);
      expect(updated.weightActual).toBe(145);
      expect(updated.completed).toBe(true);
      expect(updated.notes).toBe('PR');
      expect(updated.setsPlanned).toBe(5); // untouched
    });
  });

  describe('completeSession / dnfSession', () => {
    it('completeSession sets status, endedAt and durationSeconds; completing twice throws', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);

      await completeSession(session.id, testDb);
      const done = await getSession(session.id, testDb);
      expect(done!.status).toBe('completed');
      expect(done!.endedAt).toBeDefined();
      expect(typeof done!.durationSeconds).toBe('number');
      expect(done!.durationSeconds!).toBeGreaterThanOrEqual(0);

      await expect(completeSession(session.id, testDb)).rejects.toThrow();
    });

    it('dnfSession sets status dnf with endedAt/duration and cannot run twice', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const session = await startSession([push.id], undefined, testDb);

      await dnfSession(session.id, testDb);
      const done = await getSession(session.id, testDb);
      expect(done!.status).toBe('dnf');
      expect(done!.endedAt).toBeDefined();
      expect(typeof done!.durationSeconds).toBe('number');

      await expect(dnfSession(session.id, testDb)).rejects.toThrow();
    });

    it('logs "completed" and "dnf" events', async () => {
      const push = await createRoutine(pushInput(), testDb);
      const s1 = await startSession([push.id], undefined, testDb);
      await completeSession(s1.id, testDb);
      const e1 = await testDb.appEvents.where('[entityType+entityId]').equals(['session', s1.id]).toArray();
      expect(e1.map((e) => e.eventType)).toContain('completed');

      const s2 = await startSession([push.id], undefined, testDb);
      await dnfSession(s2.id, testDb);
      const e2 = await testDb.appEvents.where('[entityType+entityId]').equals(['session', s2.id]).toArray();
      expect(e2.map((e) => e.eventType)).toContain('dnf');
    });
  });

  describe('listSessions', () => {
    it('returns hydrated sessions newest date first, filtered by status and limited', async () => {
      const push = await createRoutine(pushInput(), testDb);

      const older = await startSession([push.id], '2026-01-01', testDb);
      await completeSession(older.id, testDb);
      const newer = await startSession([push.id], '2026-03-01', testDb);
      await completeSession(newer.id, testDb);
      const draft = await startSession([push.id], '2026-02-01', testDb);

      const all = await listSessions(undefined, testDb);
      expect(all.map((s) => s.id)).toEqual([newer.id, draft.id, older.id]);
      expect(all[0]!.items.length).toBeGreaterThan(0); // hydrated

      const completedOnly = await listSessions({ statuses: ['completed'] }, testDb);
      expect(completedOnly.map((s) => s.id)).toEqual([newer.id, older.id]);

      const limited = await listSessions({ limit: 1 }, testDb);
      expect(limited.map((s) => s.id)).toEqual([newer.id]);
    });
  });
});
