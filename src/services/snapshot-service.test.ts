import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiOutDB } from '../db/schema';
import { initializeDb } from '../db/seed';
import { createRoutine, listRoutines, type RoutineInput } from './routine-service';
import { completeSession, startSession } from './session-service';
import { addSet } from './session-set-service';
import { addBodyweight } from './bodyweight-service';
import { exportBundle } from './export-service';
import { listSnapshots, pruneSnapshots, restoreSnapshot, takeSnapshot } from './snapshot-service';

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
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

async function seedRoutinesAndSessions(database: ActiOutDB): Promise<void> {
  await createRoutine(pushInput(), database);
  const routineId = (await listRoutines(database))[0]!.id;
  const session = await startSession([routineId], undefined, database);
  const item = session.items[0]!;
  await addSet(item.id, { reps: 5, weight: 100, completed: true }, database);
  await completeSession(session.id, database);
  await addBodyweight(180, 'lb', '2026-01-01', 'note', database);
}

async function wipeRoutines(database: ActiOutDB): Promise<void> {
  await database.routineTemplates.clear();
  await database.routineTemplateDays.clear();
  await database.routineTemplateItems.clear();
}

describe('snapshot-service', () => {
  let dbx: ActiOutDB;

  beforeEach(async () => {
    dbx = new ActiOutDB(`snap-${crypto.randomUUID()}`);
    await initializeDb(dbx);
  });

  afterEach(async () => {
    await dbx.delete();
  });

  it('takeSnapshot stores a summary and round-trips via restore', async () => {
    await seedRoutinesAndSessions(dbx);
    const before = await exportBundle(dbx);
    const snap = await takeSnapshot('manual', dbx);
    expect(snap.summary).toMatch(/routines/);

    await wipeRoutines(dbx);
    expect((await listRoutines(dbx)).length).toBe(0);

    await restoreSnapshot(snap.id, dbx);
    const after = await exportBundle(dbx);
    expect(after.routineTemplates.length).toBe(before.routineTemplates.length);
  });

  it('restoreSnapshot takes a pre-restore snapshot first', async () => {
    const snap = await takeSnapshot('manual', dbx);
    await restoreSnapshot(snap.id, dbx);
    const reasons = (await listSnapshots(dbx)).map((s) => s.reason);
    expect(reasons).toContain('pre-restore');
  });

  it('restoreSnapshot throws for a missing snapshot', async () => {
    await expect(restoreSnapshot('nope', dbx)).rejects.toThrow();
  });

  it('listSnapshots is newest-first and omits bundleJson', async () => {
    await takeSnapshot('manual', dbx);
    await takeSnapshot('manual', dbx);
    const rows = await listSnapshots(dbx);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => !('bundleJson' in r))).toBe(true);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.createdAt >= rows[i]!.createdAt).toBe(true);
    }
  });

  it('pruneSnapshots enforces the 20 cap', async () => {
    for (let i = 0; i < 25; i += 1) await takeSnapshot('manual', dbx);
    expect((await listSnapshots(dbx)).length).toBeLessThanOrEqual(20);
  });

  it('pruneSnapshots drops rows older than 7 days', async () => {
    await dbx.snapshots.add({
      id: 'old',
      createdAt: isoDaysAgo(8),
      reason: 'manual',
      summary: 'x',
      bundleJson: 'j{}',
    } as never);
    await takeSnapshot('manual', dbx);
    expect(await dbx.snapshots.get('old')).toBeUndefined();
  });

  it('pruneSnapshots is callable directly', async () => {
    await takeSnapshot('manual', dbx);
    await expect(pruneSnapshots(dbx)).resolves.toBeUndefined();
  });
});
