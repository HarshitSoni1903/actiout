import { it, expect, beforeEach, describe } from 'vitest';
import type { SessionItem } from '../domain/types';
import { ActiOutDB } from '../db/schema';
import { initializeDb } from '../db/seed';
import { addSet } from './session-set-service';
import { newId } from '../utils';
import {
  activateSessionItem,
  dnfSessionItem,
  applyAggregateSets,
  itemPhase,
  orderSessionItems,
  activationNumbers,
} from './session-flow';

let dbx: ActiOutDB;
let itemId: string;
let sessionId: string;

beforeEach(async () => {
  dbx = new ActiOutDB(`sflow-${newId()}`);
  await dbx.open();
  await initializeDb(dbx);
  itemId = newId();
  sessionId = newId();
  await dbx.sessions.add({ id: sessionId, sessionDate: '2026-07-18', status: 'draft', sourceMode: 'quick', createdAt: 'a', updatedAt: 'a' } as never);
  await dbx.sessionItems.add({ id: itemId, sessionId, exerciseNameSnapshot: 'Squat', sequencePosition: 1, createdAt: 'a', updatedAt: 'a' } as never);
});

describe('activateSessionItem', () => {
  it('stamps activatedAt and bumps item + session updatedAt', async () => {
    await activateSessionItem(itemId, dbx);
    const item = await dbx.sessionItems.get(itemId);
    expect(item?.activatedAt).toBeDefined();
    expect(item?.updatedAt).not.toBe('a');

    const session = await dbx.sessions.get(sessionId);
    expect(session?.updatedAt).not.toBe('a');
  });

  it('is a no-op if already activated (keeps first timestamp, no further write)', async () => {
    const oldTimestamp = '2020-01-01T00:00:00.000Z';
    await dbx.sessionItems.put({
      id: itemId,
      sessionId,
      exerciseNameSnapshot: 'Squat',
      sequencePosition: 1,
      activatedAt: oldTimestamp,
      createdAt: 'a',
      updatedAt: oldTimestamp,
    } as never);

    await activateSessionItem(itemId, dbx);

    const item = await dbx.sessionItems.get(itemId);
    expect(item?.activatedAt).toBe(oldTimestamp);
    expect(item?.updatedAt).toBe(oldTimestamp);

    const session = await dbx.sessions.get(sessionId);
    expect(session?.updatedAt).toBe('a');
  });

  it('throws for an unknown item', async () => {
    await expect(activateSessionItem('nope', dbx)).rejects.toThrow();
  });
});

describe('dnfSessionItem', () => {
  it('toggles dnfAt on then off', async () => {
    await dnfSessionItem(itemId, dbx);
    let item = await dbx.sessionItems.get(itemId);
    expect(item?.dnfAt).toBeDefined();

    await dnfSessionItem(itemId, dbx);
    item = await dbx.sessionItems.get(itemId);
    expect(item?.dnfAt).toBeUndefined();
  });

  it('bumps item + session updatedAt on each toggle', async () => {
    await dnfSessionItem(itemId, dbx);
    const item = await dbx.sessionItems.get(itemId);
    expect(item?.updatedAt).not.toBe('a');
    const session = await dbx.sessions.get(sessionId);
    expect(session?.updatedAt).not.toBe('a');
  });

  it('throws for an unknown item', async () => {
    await expect(dnfSessionItem('nope', dbx)).rejects.toThrow();
  });
});

describe('applyAggregateSets', () => {
  it('grows from 0 to 3 sets, stamping reps/weight/weightUnit/completed', async () => {
    await applyAggregateSets(itemId, { sets: 3, reps: 10, weight: 135, weightUnit: 'lb' }, dbx);

    const sets = (await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray()).sort(
      (a, b) => a.setNumber - b.setNumber
    );
    expect(sets.map((s) => s.setNumber)).toEqual([1, 2, 3]);
    for (const s of sets) {
      expect(s.reps).toBe(10);
      expect(s.weight).toBe(135);
      expect(s.weightUnit).toBe('lb');
      expect(s.completed).toBe(true);
      expect(s.isWarmup).toBe(false);
    }
  });

  it('grows 3 to 5 sets, preserving the first 3 renumbered 1..5', async () => {
    await applyAggregateSets(itemId, { sets: 3, reps: 10, weight: 135, weightUnit: 'lb' }, dbx);
    await applyAggregateSets(itemId, { sets: 5, reps: 8, weight: 145, weightUnit: 'lb' }, dbx);

    const sets = (await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray()).sort(
      (a, b) => a.setNumber - b.setNumber
    );
    expect(sets.map((s) => s.setNumber)).toEqual([1, 2, 3, 4, 5]);
    for (const s of sets) {
      expect(s.reps).toBe(8);
      expect(s.weight).toBe(145);
    }
  });

  it('shrinks 5 to 2 sets, renumbering 1..2 and overwriting values', async () => {
    await applyAggregateSets(itemId, { sets: 5, reps: 8, weight: 145, weightUnit: 'lb' }, dbx);
    await applyAggregateSets(itemId, { sets: 2, reps: 6, weight: 60, weightUnit: 'kg' }, dbx);

    const sets = (await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray()).sort(
      (a, b) => a.setNumber - b.setNumber
    );
    expect(sets.length).toBe(2);
    expect(sets.map((s) => s.setNumber)).toEqual([1, 2]);
    for (const s of sets) {
      expect(s.reps).toBe(6);
      expect(s.weight).toBe(60);
      expect(s.weightUnit).toBe('kg');
      expect(s.completed).toBe(true);
      expect(s.isWarmup).toBe(false);
    }
  });

  it('overwrites isWarmup=false even on sets previously flagged as warmup — aggregate mode owns the item', async () => {
    await addSet(itemId, { isWarmup: true }, dbx);
    await addSet(itemId, { isWarmup: true }, dbx);

    await applyAggregateSets(itemId, { sets: 2, reps: 10, weight: 50, weightUnit: 'lb' }, dbx);

    const sets = await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray();
    expect(sets.every((s) => s.isWarmup === false)).toBe(true);
    expect(sets.every((s) => s.completed === true)).toBe(true);
  });

  it('shrinks to 0 sets: all deleted, no throw', async () => {
    await applyAggregateSets(itemId, { sets: 3, reps: 8, weight: 100, weightUnit: 'lb' }, dbx);

    await expect(applyAggregateSets(itemId, { sets: 0, weightUnit: 'lb' }, dbx)).resolves.toBeUndefined();

    const sets = await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray();
    expect(sets).toEqual([]);
  });

  it('bumps item + session updatedAt', async () => {
    await applyAggregateSets(itemId, { sets: 1, reps: 5, weight: 100, weightUnit: 'lb' }, dbx);
    const item = await dbx.sessionItems.get(itemId);
    expect(item?.updatedAt).not.toBe('a');
    const session = await dbx.sessions.get(sessionId);
    expect(session?.updatedAt).not.toBe('a');
  });

  it('throws for an unknown item', async () => {
    await expect(applyAggregateSets('nope', { sets: 1, weightUnit: 'lb' }, dbx)).rejects.toThrow();
  });

  it('writes durationSeconds on every set', async () => {
    await applyAggregateSets(itemId, { sets: 2, weightUnit: 'lb', durationSeconds: 60 }, dbx);

    const sets = await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray();
    expect(sets.length).toBe(2);
    for (const s of sets) {
      expect(s.durationSeconds).toBe(60);
    }
  });

  it('writes distance and distanceUnit', async () => {
    await applyAggregateSets(itemId, { sets: 1, weightUnit: 'lb', distance: 2.4, distanceUnit: 'km' }, dbx);

    const sets = await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray();
    expect(sets.length).toBe(1);
    expect(sets[0]?.distance).toBe(2.4);
    expect(sets[0]?.distanceUnit).toBe('km');
  });

  it('preserves an existing set durationSeconds, distance and distanceUnit when a later agg call omits them', async () => {
    await applyAggregateSets(
      itemId,
      { sets: 1, weightUnit: 'lb', durationSeconds: 45, distance: 2.4, distanceUnit: 'km' },
      dbx
    );
    await applyAggregateSets(itemId, { sets: 1, weightUnit: 'lb' }, dbx);

    const sets = await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray();
    expect(sets.length).toBe(1);
    expect(sets[0]?.durationSeconds).toBe(45);
    expect(sets[0]?.distance).toBe(2.4);
    expect(sets[0]?.distanceUnit).toBe('km');
  });

  it('preserves existing weight and reps when a later agg call omits both', async () => {
    await applyAggregateSets(itemId, { sets: 1, reps: 8, weight: 100, weightUnit: 'lb' }, dbx);
    await applyAggregateSets(itemId, { sets: 1, weightUnit: 'lb' }, dbx);

    const sets = await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray();
    expect(sets.length).toBe(1);
    expect(sets[0]?.weight).toBe(100);
    expect(sets[0]?.reps).toBe(8);
  });

  it('keeps the existing distanceUnit when a later agg call omits distance, even if it still carries a distanceUnit (real UI shape: preference unit sent while distance input is blank)', async () => {
    await applyAggregateSets(itemId, { sets: 1, weightUnit: 'lb', distance: 5, distanceUnit: 'km' }, dbx);
    await applyAggregateSets(itemId, { sets: 1, weightUnit: 'lb', distanceUnit: 'mi' }, dbx);

    const sets = await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray();
    expect(sets.length).toBe(1);
    expect(sets[0]?.distance).toBe(5);
    expect(sets[0]?.distanceUnit).toBe('km');
  });

  it('applies the incoming distanceUnit when the agg call does provide a distance', async () => {
    await applyAggregateSets(itemId, { sets: 1, weightUnit: 'lb', distance: 5, distanceUnit: 'km' }, dbx);
    await applyAggregateSets(itemId, { sets: 1, weightUnit: 'lb', distance: 3, distanceUnit: 'mi' }, dbx);

    const sets = await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray();
    expect(sets.length).toBe(1);
    expect(sets[0]?.distance).toBe(3);
    expect(sets[0]?.distanceUnit).toBe('mi');
  });

  it('keeps the existing weightUnit when a later agg call omits the weight', async () => {
    await applyAggregateSets(itemId, { sets: 1, weight: 20, weightUnit: 'kg' }, dbx);
    await applyAggregateSets(itemId, { sets: 1, weightUnit: 'lb', durationSeconds: 60 }, dbx);

    const sets = await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray();
    expect(sets.length).toBe(1);
    expect(sets[0]?.weight).toBe(20);
    expect(sets[0]?.weightUnit).toBe('kg');
  });

  it('applies the incoming weightUnit when the agg call does provide a weight', async () => {
    await applyAggregateSets(itemId, { sets: 1, weight: 20, weightUnit: 'kg' }, dbx);
    await applyAggregateSets(itemId, { sets: 1, weight: 45, weightUnit: 'lb' }, dbx);

    const sets = await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray();
    expect(sets.length).toBe(1);
    expect(sets[0]?.weight).toBe(45);
    expect(sets[0]?.weightUnit).toBe('lb');
  });

  it('still overwrites weight, durationSeconds, distance and distanceUnit when the later agg call provides new values', async () => {
    await applyAggregateSets(
      itemId,
      { sets: 1, weight: 100, weightUnit: 'lb', durationSeconds: 30, distance: 1.0, distanceUnit: 'mi' },
      dbx
    );
    await applyAggregateSets(
      itemId,
      { sets: 1, weight: 120, weightUnit: 'lb', durationSeconds: 90, distance: 5.5, distanceUnit: 'km' },
      dbx
    );

    const sets = await dbx.sessionSets.where('sessionItemId').equals(itemId).toArray();
    expect(sets.length).toBe(1);
    expect(sets[0]?.weight).toBe(120);
    expect(sets[0]?.durationSeconds).toBe(90);
    expect(sets[0]?.distance).toBe(5.5);
    expect(sets[0]?.distanceUnit).toBe('km');
  });
});

function mkItem(overrides: Partial<SessionItem>): SessionItem {
  return {
    id: overrides.id ?? newId(),
    sessionId: 'sess',
    exerciseNameSnapshot: 'X',
    sequencePosition: 1,
    createdAt: 'a',
    updatedAt: 'a',
    ...overrides,
  };
}

describe('itemPhase (pure)', () => {
  it('is finished when dnfAt is set, regardless of activation/completion', () => {
    expect(itemPhase(mkItem({ dnfAt: '2026-01-01' }), false)).toBe('finished');
    expect(itemPhase(mkItem({ dnfAt: '2026-01-01', activatedAt: '2026-01-01' }), true)).toBe('finished');
  });

  it('is finished when activated and complete', () => {
    expect(itemPhase(mkItem({ activatedAt: '2026-01-01' }), true)).toBe('finished');
  });

  it('is active when activated and not complete', () => {
    expect(itemPhase(mkItem({ activatedAt: '2026-01-01' }), false)).toBe('active');
  });

  it('is queued when never activated', () => {
    expect(itemPhase(mkItem({}), false)).toBe('queued');
    expect(itemPhase(mkItem({}), true)).toBe('queued');
  });
});

describe('orderSessionItems (pure)', () => {
  it('orders finished (by activatedAt asc) then active (by activatedAt asc) then queued (by sequencePosition asc)', () => {
    const queuedB = mkItem({ id: 'queuedB', sequencePosition: 3 });
    const queuedA = mkItem({ id: 'queuedA', sequencePosition: 2 });
    const activeLater = mkItem({ id: 'activeLater', sequencePosition: 1, activatedAt: '2026-01-01T00:00:02.000Z' });
    const activeEarlier = mkItem({ id: 'activeEarlier', sequencePosition: 5, activatedAt: '2026-01-01T00:00:01.000Z' });
    const finishedByDnf = mkItem({
      id: 'finishedByDnf',
      sequencePosition: 4,
      activatedAt: '2026-01-01T00:00:00.500Z',
      dnfAt: '2026-01-01T00:00:03.000Z',
    });
    const finishedByComplete = mkItem({
      id: 'finishedByComplete',
      sequencePosition: 6,
      activatedAt: '2026-01-01T00:00:00.100Z',
    });

    const items = [queuedB, queuedA, activeLater, activeEarlier, finishedByDnf, finishedByComplete];
    const completeById = new Map<string, boolean>([['finishedByComplete', true]]);

    const ordered = orderSessionItems(items, completeById);
    expect(ordered.map((i) => i.id)).toEqual([
      'finishedByComplete',
      'finishedByDnf',
      'activeEarlier',
      'activeLater',
      'queuedA',
      'queuedB',
    ]);
  });

  it('sorts a finished item DNF straight from the queue (no activatedAt) by dnfAt, not first', () => {
    const activatedThenDnf = mkItem({
      id: 'activatedThenDnf',
      activatedAt: '2026-01-01T10:00:00.000Z',
      dnfAt: '2026-01-01T10:05:00.000Z',
    });
    const dnfWithoutActivation = mkItem({
      id: 'dnfWithoutActivation',
      dnfAt: '2026-01-01T10:30:00.000Z',
    });
    const activatedThenComplete = mkItem({
      id: 'activatedThenComplete',
      activatedAt: '2026-01-01T11:00:00.000Z',
    });

    const items = [dnfWithoutActivation, activatedThenComplete, activatedThenDnf];
    const completeById = new Map<string, boolean>([['activatedThenComplete', true]]);

    const ordered = orderSessionItems(items, completeById);
    expect(ordered.map((i) => i.id)).toEqual(['activatedThenDnf', 'dnfWithoutActivation', 'activatedThenComplete']);
  });
});

describe('activationNumbers (pure)', () => {
  it('ranks activated items 1-based by activatedAt, excludes unactivated', () => {
    const first = mkItem({ id: 'first', activatedAt: '2026-01-01T00:00:00.000Z' });
    const second = mkItem({ id: 'second', activatedAt: '2026-01-01T00:00:01.000Z' });
    const untouched = mkItem({ id: 'untouched' });

    const numbers = activationNumbers([second, untouched, first]);
    expect(numbers.get('first')).toBe(1);
    expect(numbers.get('second')).toBe(2);
    expect(numbers.has('untouched')).toBe(false);
  });
});
