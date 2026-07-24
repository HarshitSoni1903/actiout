import type { SessionSet } from '../domain/types';
import { ActiOutDB, db } from '../db/schema';
import { newId, nowIso } from '../utils';
import { getPreferences } from './preference-service';

type SetPatch = Partial<
  Pick<
    SessionSet,
    'reps' | 'weight' | 'weightUnit' | 'isWarmup' | 'completed' | 'durationSeconds' | 'distance' | 'distanceUnit'
  >
>;

export async function addSet(
  sessionItemId: string,
  patch: SetPatch = {},
  database: ActiOutDB = db
): Promise<SessionSet> {
  // Resolve out-of-transaction dependencies first (Dexie forbids touching
  // tables not enrolled in the active transaction).
  const preference = await getPreferences(database);

  const now = nowIso();
  let created: SessionSet | undefined;

  await database.transaction('rw', database.sessionItems, database.sessionSets, async () => {
    const item = await database.sessionItems.get(sessionItemId);
    if (!item) {
      throw new Error(`addSet: session item ${sessionItemId} does not exist`);
    }

    const siblings = await database.sessionSets.where('sessionItemId').equals(sessionItemId).toArray();
    const maxSetNumber = siblings.reduce((max, s) => Math.max(max, s.setNumber), 0);

    const set: SessionSet = {
      id: newId(),
      sessionId: item.sessionId,
      sessionItemId,
      setNumber: maxSetNumber + 1,
      weightUnit: preference.weightUnit,
      isWarmup: false,
      completed: false,
      createdAt: now,
      updatedAt: now,
      ...patch,
    };

    await database.sessionSets.add(set);
    created = set;
  });

  if (!created) {
    throw new Error(`addSet: failed to create set for item ${sessionItemId}`);
  }
  return created;
}

export async function updateSet(setId: string, patch: SetPatch, database: ActiOutDB = db): Promise<void> {
  await database.transaction('rw', database.sessionSets, database.sessions, async () => {
    const set = await database.sessionSets.get(setId);
    if (!set) {
      throw new Error(`updateSet: set ${setId} does not exist`);
    }
    const now = nowIso();
    await database.sessionSets.put({ ...set, ...patch, updatedAt: now });

    const session = await database.sessions.get(set.sessionId);
    if (session) {
      await database.sessions.put({ ...session, updatedAt: now });
    }
  });
}

export async function removeSet(setId: string, database: ActiOutDB = db): Promise<void> {
  await database.transaction('rw', database.sessionSets, async () => {
    const set = await database.sessionSets.get(setId);
    if (!set) {
      throw new Error(`removeSet: set ${setId} does not exist`);
    }

    await database.sessionSets.delete(setId);

    // Renumber the remaining sets of that item contiguously 1..m, preserving order.
    const remaining = (await database.sessionSets.where('sessionItemId').equals(set.sessionItemId).toArray()).sort(
      (a, b) => a.setNumber - b.setNumber
    );
    const now = nowIso();
    for (let index = 0; index < remaining.length; index += 1) {
      const row = remaining[index]!;
      const expected = index + 1;
      if (row.setNumber !== expected) {
        await database.sessionSets.put({ ...row, setNumber: expected, updatedAt: now });
      }
    }
  });
}

export async function listSetsForItem(sessionItemId: string, database: ActiOutDB = db): Promise<SessionSet[]> {
  const rows = await database.sessionSets.where('sessionItemId').equals(sessionItemId).toArray();
  return rows.slice().sort((a, b) => a.setNumber - b.setNumber);
}

// One-query read of every set in a session — the session screen groups these
// by sessionItemId to derive per-item completion without N per-item queries.
export async function listSetsForSession(sessionId: string, database: ActiOutDB = db): Promise<SessionSet[]> {
  const rows = await database.sessionSets.where('sessionId').equals(sessionId).toArray();
  return rows.slice().sort((a, b) => a.setNumber - b.setNumber);
}

export function isItemComplete(sets: SessionSet[]): boolean {
  const work = sets.filter((s) => !s.isWarmup);
  return work.length > 0 && work.every((s) => s.completed);
}
