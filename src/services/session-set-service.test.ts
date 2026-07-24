import { it, expect, beforeEach } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { getPreferences } from './preference-service';
import { initializeDb } from '../db/seed';
import { addSet, updateSet, removeSet, listSetsForItem, listSetsForSession, isItemComplete } from './session-set-service';
import { newId } from '../utils';

let dbx: ActiOutDB;
let itemId: string;

beforeEach(async () => {
  dbx = new ActiOutDB(`sset-${newId()}`);
  await dbx.open();
  await initializeDb(dbx);
  // minimal session + item scaffold
  itemId = newId();
  const sessionId = newId();
  await dbx.sessions.add({ id: sessionId, sessionDate: '2026-07-10', status: 'draft', sourceMode: 'quick', createdAt: 'a', updatedAt: 'a' } as never);
  await dbx.sessionItems.add({ id: itemId, sessionId, exerciseNameSnapshot: 'Squat', sequencePosition: 1, createdAt: 'a', updatedAt: 'a' } as never);
});

it('addSet appends contiguous setNumbers starting at 1', async () => {
  const s1 = await addSet(itemId, {}, dbx);
  const s2 = await addSet(itemId, {}, dbx);
  expect(s1.setNumber).toBe(1);
  expect(s2.setNumber).toBe(2);
  expect(s1.weightUnit).toBe((await getPreferences(dbx)).weightUnit);
  expect(s1.completed).toBe(false);
  expect(s1.isWarmup).toBe(false);
});

it('addSet throws for an unknown item', async () => {
  await expect(addSet('nope', {}, dbx)).rejects.toThrow();
});

it('updateSet patches fields and does not convert weight', async () => {
  const s = await addSet(itemId, { weightUnit: 'kg' }, dbx);
  await updateSet(s.id, { reps: 5, weight: 60, completed: true }, dbx);
  const got = await dbx.sessionSets.get(s.id);
  expect(got).toMatchObject({ reps: 5, weight: 60, weightUnit: 'kg', completed: true });
});

it('removeSet renumbers survivors 1..m', async () => {
  const a = await addSet(itemId, {}, dbx);
  await addSet(itemId, {}, dbx);
  const c = await addSet(itemId, {}, dbx);
  await removeSet(a.id, dbx); // delete first
  const survivors = await listSetsForItem(itemId, dbx);
  expect(survivors.map((s) => s.setNumber)).toEqual([1, 2]);
  expect(survivors.some((s) => s.id === c.id && s.setNumber === 2)).toBe(true);
});

it('listSetsForSession returns every set in the session sorted by setNumber', async () => {
  const other = newId();
  await dbx.sessionItems.add({ id: other, sessionId: (await dbx.sessionItems.get(itemId))!.sessionId, exerciseNameSnapshot: 'Bench', sequencePosition: 2, createdAt: 'a', updatedAt: 'a' } as never);
  await addSet(itemId, {}, dbx);
  await addSet(other, {}, dbx);
  await addSet(itemId, {}, dbx);
  const sessionId = (await dbx.sessionItems.get(itemId))!.sessionId;
  const all = await listSetsForSession(sessionId, dbx);
  expect(all).toHaveLength(3);
  expect(all.every((s) => s.sessionId === sessionId)).toBe(true);
});

it('addSet stores durationSeconds', async () => {
  const s = await addSet(itemId, { durationSeconds: 45 }, dbx);
  expect(s.durationSeconds).toBe(45);
});

it('updateSet persists durationSeconds', async () => {
  const s = await addSet(itemId, {}, dbx);
  await updateSet(s.id, { durationSeconds: 90 }, dbx);
  const got = await dbx.sessionSets.get(s.id);
  expect(got?.durationSeconds).toBe(90);
});

it('isItemComplete: false with no sets', () => {
  expect(isItemComplete([])).toBe(false);
});

it('isItemComplete: warmups do not count and are ignored', () => {
  const mk = (completed: boolean, isWarmup: boolean): never =>
    ({ completed, isWarmup } as never);
  expect(isItemComplete([mk(false, true)])).toBe(false); // only a warmup → not complete
  expect(isItemComplete([mk(true, true), mk(true, false)])).toBe(true);
  expect(isItemComplete([mk(true, false), mk(false, false)])).toBe(false);
});
