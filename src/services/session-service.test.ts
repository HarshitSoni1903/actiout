import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { initializeDb } from '../db/seed';
import { createRoutine, type RoutineInput } from './routine-service';
import { addSet, listSetsForItem, updateSet } from './session-set-service';
import { todayLocalDate } from '../utils/dates';
import {
  DraftExistsError,
  addSessionItem,
  completeSession,
  deleteSession,
  dnfSession,
  getActiveDraft,
  getSession,
  listSessions,
  moveSessionItem,
  removeSessionItem,
  startQuickSession,
  startSession,
  unlockSession,
  updateSessionItem,
} from './session-service';

let dbx: ActiOutDB;

beforeEach(async () => {
  dbx = new ActiOutDB(`test-db-${crypto.randomUUID()}`);
  await initializeDb(dbx);
});

afterEach(async () => {
  await dbx.delete();
});

// Routine A: 3 items. defaultSets 3, defaultReps 10.
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

// A single-item routine used to exercise restSeconds snapshotting and backfill.
async function createRoutineWithItem(database: ActiOutDB, opts: { restSeconds?: number }): Promise<string> {
  const routine = await createRoutine(
    {
      name: 'Solo',
      daysOfWeek: [1],
      defaultSets: 3,
      defaultReps: 10,
      items: [{ exerciseName: 'Squat', restSeconds: opts.restSeconds }],
    },
    database
  );
  return routine.id;
}

describe('startSession', () => {
  it('builds a draft from 2 routines: 5 items positions 1..5, links sourceSequence [1,2]', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const pull = await createRoutine(pullInput(), dbx);

    const session = await startSession([push.id, pull.id], undefined, dbx);

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

  it('prefills planned targets from item defaults falling back to routine defaults', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const session = await startSession([push.id], undefined, dbx);

    const bench = session.items[0]!;
    expect(bench.setsPlanned).toBe(5);
    expect(bench.repsPlanned).toBe(5);

    const ohp = session.items[1]!;
    expect(ohp.setsPlanned).toBe(3); // routine default
    expect(ohp.repsPlanned).toBe(10); // routine default

    const lateral = session.items[2]!;
    expect(lateral.setsPlanned).toBe(3); // routine default
    expect(lateral.repsPlanned).toBe(15); // item override
  });

  it('snapshots restSeconds onto items and creates zero sets', async () => {
    const rid = await createRoutineWithItem(dbx, { restSeconds: 90 });
    const s = await startSession([rid], undefined, dbx);
    expect(s.items[0]!.restSeconds).toBe(90);
    const sets = await dbx.sessionSets.where('sessionId').equals(s.id).toArray();
    expect(sets).toHaveLength(0);
    // slimmed item has no aggregate actuals
    expect((s.items[0] as Record<string, unknown>).setsActual).toBeUndefined();
  });

  it('accepts a past sessionDate (backfill)', async () => {
    const rid = await createRoutineWithItem(dbx, {});
    const s = await startSession([rid], '2026-01-01', dbx);
    expect(s.sessionDate).toBe('2026-01-01');
  });

  it('respects an explicit session date', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const session = await startSession([push.id], '2026-01-15', dbx);
    expect(session.sessionDate).toBe('2026-01-15');
  });

  it('throws DraftExistsError with the existing draft id when a draft already exists', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const first = await startSession([push.id], undefined, dbx);

    await expect(startSession([push.id], undefined, dbx)).rejects.toBeInstanceOf(DraftExistsError);
    try {
      await startSession([push.id], undefined, dbx);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DraftExistsError);
      expect((err as DraftExistsError).draftId).toBe(first.id);
    }
  });

  it('allows starting a new session after the prior draft is DNF-ed', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const first = await startSession([push.id], undefined, dbx);
    await dnfSession(first.id, dbx);

    const second = await startSession([push.id], undefined, dbx);
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('draft');
  });

  it('logs a "started" event', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const session = await startSession([push.id], undefined, dbx);
    const events = await dbx.appEvents.where('[entityType+entityId]').equals(['session', session.id]).toArray();
    expect(events.map((e) => e.eventType)).toContain('started');
  });
});

describe('startQuickSession', () => {
  it('creates a draft with 0 items and sourceMode "quick"', async () => {
    const session = await startQuickSession(undefined, dbx);
    expect(session.status).toBe('draft');
    expect(session.sourceMode).toBe('quick');
    expect(session.items).toHaveLength(0);
    expect(session.routineLinks).toHaveLength(0);
  });

  it('is blocked by an existing draft', async () => {
    await startQuickSession(undefined, dbx);
    await expect(startQuickSession(undefined, dbx)).rejects.toBeInstanceOf(DraftExistsError);
  });
});

describe('getActiveDraft / getSession', () => {
  it('getActiveDraft returns the current draft hydrated, undefined when none', async () => {
    expect(await getActiveDraft(dbx)).toBeUndefined();
    const push = await createRoutine(pushInput(), dbx);
    const session = await startSession([push.id], undefined, dbx);

    const active = await getActiveDraft(dbx);
    expect(active?.id).toBe(session.id);
    expect(active?.items).toHaveLength(3);
  });

  it('getSession hydrates items sorted by sequencePosition and returns undefined for a missing id', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const pull = await createRoutine(pullInput(), dbx);
    const session = await startSession([push.id, pull.id], undefined, dbx);

    const fetched = await getSession(session.id, dbx);
    expect(fetched?.items.map((i) => i.sequencePosition)).toEqual([1, 2, 3, 4, 5]);
    expect(await getSession('missing', dbx)).toBeUndefined();
  });
});

describe('moveSessionItem', () => {
  it('swaps positions with the neighbour on up/down and no-ops at the boundary', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const session = await startSession([push.id], undefined, dbx);
    const [a, b, c] = session.items; // Bench(1), OHP(2), Lateral(3)

    await moveSessionItem(b!.id, 'up', dbx);
    let refreshed = await getSession(session.id, dbx);
    expect(refreshed!.items.map((i) => i.exerciseNameSnapshot)).toEqual([
      'Overhead Press',
      'Bench Press',
      'Lateral Raise',
    ]);

    await moveSessionItem(b!.id, 'down', dbx);
    refreshed = await getSession(session.id, dbx);
    expect(refreshed!.items.map((i) => i.exerciseNameSnapshot)).toEqual([
      'Bench Press',
      'Overhead Press',
      'Lateral Raise',
    ]);

    await moveSessionItem(a!.id, 'up', dbx);
    refreshed = await getSession(session.id, dbx);
    expect(refreshed!.items.map((i) => i.exerciseNameSnapshot)).toEqual([
      'Bench Press',
      'Overhead Press',
      'Lateral Raise',
    ]);

    await moveSessionItem(c!.id, 'down', dbx);
    refreshed = await getSession(session.id, dbx);
    expect(refreshed!.items.map((i) => i.sequencePosition)).toEqual([1, 2, 3]);
  });
});

describe('addSessionItem', () => {
  it('appends a new slim item at position n+1 with no planned targets', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const session = await startSession([push.id], undefined, dbx);

    const added = await addSessionItem(session.id, 'Plank', dbx);
    expect(added.sequencePosition).toBe(4);
    expect(added.setsPlanned).toBeUndefined();
    expect(added.repsPlanned).toBeUndefined();

    const refreshed = await getSession(session.id, dbx);
    expect(refreshed!.items.map((i) => i.exerciseNameSnapshot)).toEqual([
      'Bench Press',
      'Overhead Press',
      'Lateral Raise',
      'Plank',
    ]);
  });

  it('appends at position 1 for an empty (quick) session', async () => {
    const session = await startQuickSession(undefined, dbx);
    const added = await addSessionItem(session.id, 'Plank', dbx);
    expect(added.sequencePosition).toBe(1);
  });
});

describe('removeSessionItem', () => {
  it('deletes a middle item and renumbers the remainder contiguously 1..n preserving order', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const pull = await createRoutine(pullInput(), dbx);
    const session = await startSession([push.id, pull.id], undefined, dbx);
    const middle = session.items[2]!; // Lateral Raise (pos 3)

    await removeSessionItem(middle.id, dbx);

    const refreshed = await getSession(session.id, dbx);
    expect(refreshed!.items.map((i) => i.sequencePosition)).toEqual([1, 2, 3, 4]);
    expect(refreshed!.items.map((i) => i.exerciseNameSnapshot)).toEqual([
      'Bench Press',
      'Overhead Press',
      'Deadlift',
      'Barbell Row',
    ]);
  });

  it('cascade-deletes its sets', async () => {
    const s = await startQuickSession(undefined, dbx);
    const item = await addSessionItem(s.id, 'Squat', dbx);
    await addSet(item.id, {}, dbx);
    await removeSessionItem(item.id, dbx);
    const sets = await dbx.sessionSets.where('sessionItemId').equals(item.id).toArray();
    expect(sets).toHaveLength(0);
  });
});

describe('event trim', () => {
  it('moveSessionItem / addSessionItem / removeSessionItem log NO item-* events', async () => {
    const s = await startQuickSession(undefined, dbx);
    const item = await addSessionItem(s.id, 'Squat', dbx);
    await addSessionItem(s.id, 'Bench', dbx);
    await moveSessionItem(item.id, 'down', dbx);
    await removeSessionItem(item.id, dbx);
    const events = await dbx.appEvents.toArray();
    const types = events.map((e) => e.eventType);
    expect(types).not.toContain('item-added');
    expect(types).not.toContain('item-moved');
    expect(types).not.toContain('item-removed');
  });
});

describe('updateSessionItem', () => {
  it('patches notes, leaving other fields intact', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const session = await startSession([push.id], undefined, dbx);
    const item = session.items[0]!;

    await updateSessionItem(item.id, { notes: 'PR' }, dbx);

    const refreshed = await getSession(session.id, dbx);
    const updated = refreshed!.items.find((i) => i.id === item.id)!;
    expect(updated.notes).toBe('PR');
    expect(updated.setsPlanned).toBe(5); // untouched
  });

  it("bumps the parent session's updatedAt (M2)", async () => {
    const push = await createRoutine(pushInput(), dbx);
    const session = await startSession([push.id], undefined, dbx);
    const item = session.items[0]!;

    const before = (await dbx.sessions.get(session.id))!.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));

    await updateSessionItem(item.id, { notes: 'later' }, dbx);

    const after = (await dbx.sessions.get(session.id))!.updatedAt;
    expect(after > before).toBe(true);
  });
});

describe('completeSession / dnfSession', () => {
  it('requires ≥1 derived-complete item', async () => {
    const s = await startQuickSession(undefined, dbx);
    const item = await addSessionItem(s.id, 'Squat', dbx);
    await addSet(item.id, { completed: false }, dbx);
    await expect(completeSession(s.id, dbx)).rejects.toThrow();
    await updateSet((await listSetsForItem(item.id, dbx))[0]!.id, { completed: true }, dbx);
    await completeSession(s.id, dbx); // now allowed
    expect((await getSession(s.id, dbx))?.status).toBe('completed');
  });

  it('completeSession sets status, endedAt and durationSeconds; completing twice throws', async () => {
    const s = await startQuickSession(undefined, dbx);
    const item = await addSessionItem(s.id, 'Squat', dbx);
    await addSet(item.id, { completed: true }, dbx);

    await completeSession(s.id, dbx);
    const done = await getSession(s.id, dbx);
    expect(done!.status).toBe('completed');
    expect(done!.endedAt).toBeDefined();
    expect(typeof done!.durationSeconds).toBe('number');
    expect(done!.durationSeconds!).toBeGreaterThanOrEqual(0);

    await expect(completeSession(s.id, dbx)).rejects.toThrow();
  });

  it('dnfSession sets status dnf with endedAt/duration (no completion requirement) and cannot run twice', async () => {
    const push = await createRoutine(pushInput(), dbx);
    const session = await startSession([push.id], undefined, dbx);

    await dnfSession(session.id, dbx);
    const done = await getSession(session.id, dbx);
    expect(done!.status).toBe('dnf');
    expect(done!.endedAt).toBeDefined();
    expect(typeof done!.durationSeconds).toBe('number');

    await expect(dnfSession(session.id, dbx)).rejects.toThrow();
  });

  it('logs "completed" and "dnf" events', async () => {
    const s1 = await startQuickSession(undefined, dbx);
    const item = await addSessionItem(s1.id, 'Squat', dbx);
    await addSet(item.id, { completed: true }, dbx);
    await completeSession(s1.id, dbx);
    const e1 = await dbx.appEvents.where('[entityType+entityId]').equals(['session', s1.id]).toArray();
    expect(e1.map((e) => e.eventType)).toContain('completed');

    const s2 = await startQuickSession(undefined, dbx);
    await dnfSession(s2.id, dbx);
    const e2 = await dbx.appEvents.where('[entityType+entityId]').equals(['session', s2.id]).toArray();
    expect(e2.map((e) => e.eventType)).toContain('dnf');
  });

  it('mutators no longer reject a completed (unlocked) session', async () => {
    const s = await startQuickSession(undefined, dbx);
    const item = await addSessionItem(s.id, 'Squat', dbx);
    await addSet(item.id, { completed: true }, dbx);
    await completeSession(s.id, dbx);
    await expect(addSet(item.id, { reps: 5 }, dbx)).resolves.toBeDefined();
  });
});

describe('unlockSession', () => {
  it('validates an existing session and mutates nothing', async () => {
    const s = await startQuickSession(undefined, dbx);
    const item = await addSessionItem(s.id, 'Squat', dbx);
    await addSet(item.id, { completed: true }, dbx);
    await completeSession(s.id, dbx);

    const before = await getSession(s.id, dbx);
    const eventsBefore = (await dbx.appEvents.toArray()).length;

    await expect(unlockSession(s.id, dbx)).resolves.toBeUndefined();

    const after = await getSession(s.id, dbx);
    expect(after!.status).toBe('completed');
    expect(after!.updatedAt).toBe(before!.updatedAt);
    expect((await dbx.appEvents.toArray()).length).toBe(eventsBefore);
  });

  it('throws for a missing session', async () => {
    await expect(unlockSession('missing', dbx)).rejects.toThrow();
  });
});

describe('deleteSession', () => {
  it('cascades items, sets, links and logs "deleted"', async () => {
    const s = await startQuickSession(undefined, dbx);
    const item = await addSessionItem(s.id, 'Squat', dbx);
    await addSet(item.id, {}, dbx);
    await deleteSession(s.id, dbx);
    expect(await getSession(s.id, dbx)).toBeUndefined();
    expect(await dbx.sessionItems.where('sessionId').equals(s.id).toArray()).toHaveLength(0);
    expect(await dbx.sessionSets.where('sessionId').equals(s.id).toArray()).toHaveLength(0);
    expect((await dbx.appEvents.toArray()).some((e) => e.eventType === 'deleted' && e.entityId === s.id)).toBe(true);
  });

  it('throws for a missing session and logs nothing', async () => {
    await expect(deleteSession('missing', dbx)).rejects.toThrow();
    expect((await dbx.appEvents.toArray()).some((e) => e.eventType === 'deleted')).toBe(false);
  });
});

describe('listSessions', () => {
  it('returns hydrated sessions newest date first, filtered by status and limited', async () => {
    const push = await createRoutine(pushInput(), dbx);

    const older = await startSession([push.id], '2026-01-01', dbx);
    await addSet(older.items[0]!.id, { completed: true }, dbx);
    await completeSession(older.id, dbx);

    const newer = await startSession([push.id], '2026-03-01', dbx);
    await addSet(newer.items[0]!.id, { completed: true }, dbx);
    await completeSession(newer.id, dbx);

    const draft = await startSession([push.id], '2026-02-01', dbx);

    const all = await listSessions(undefined, dbx);
    expect(all.map((s) => s.id)).toEqual([newer.id, draft.id, older.id]);
    expect(all[0]!.items.length).toBeGreaterThan(0); // hydrated

    const completedOnly = await listSessions({ statuses: ['completed'] }, dbx);
    expect(completedOnly.map((s) => s.id)).toEqual([newer.id, older.id]);

    const limited = await listSessions({ limit: 1 }, dbx);
    expect(limited.map((s) => s.id)).toEqual([newer.id]);
  });
});
