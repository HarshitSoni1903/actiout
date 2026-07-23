import type { RoutineTemplate, Session, SessionItem, SessionRoutineLink, SessionStatus } from '../domain/types';
import { ActiOutDB, db, type SessionRow } from '../db/schema';
import { nowIso, todayLocalDate } from '../utils/dates';
import { newId } from '../utils/ids';
import { ensureExercise, resolveMeasurementType, type EnsureExerciseOptions } from './exercise-service';
import { getRoutine } from './routine-service';
import { isItemComplete } from './session-set-service';
import { logEvent } from './events';

// Thrown by start* when a draft session already exists (drafts are global and
// exclusive — only one may exist at a time). `draftId` is the blocking draft.
export class DraftExistsError extends Error {
  constructor(public draftId: string) {
    super(`A draft session already exists (id: ${draftId})`);
    this.name = 'DraftExistsError';
  }
}

type SessionRoutineLinkRow = SessionRoutineLink & { sessionId: string };

// Rebuilds a full hydrated Session from its row plus links (sorted by
// sourceSequence) and items (sorted by sequencePosition).
function hydrateFrom(
  row: SessionRow,
  linkRows: SessionRoutineLinkRow[],
  itemRows: SessionItem[]
): Session {
  const routineLinks = linkRows
    .slice()
    .sort((a, b) => a.sourceSequence - b.sourceSequence)
    .map(
      ({ sessionId: _sessionId, ...link }): SessionRoutineLink => ({
        id: link.id,
        routineTemplateId: link.routineTemplateId,
        routineNameSnapshot: link.routineNameSnapshot,
        sourceSequence: link.sourceSequence,
      })
    );

  const items = itemRows.slice().sort((a, b) => a.sequencePosition - b.sequencePosition);

  return { ...row, routineLinks, items };
}

async function hydrate(id: string, database: ActiOutDB): Promise<Session | undefined> {
  const row = await database.sessions.get(id);
  if (!row) {
    return undefined;
  }

  const [linkRows, itemRows] = await Promise.all([
    database.sessionRoutineLinks.where('sessionId').equals(id).toArray(),
    database.sessionItems.where('sessionId').equals(id).toArray(),
  ]);

  return hydrateFrom(row, linkRows, itemRows);
}

export async function getActiveDraft(database: ActiOutDB = db): Promise<Session | undefined> {
  const draftRow = await database.sessions.where('status').equals('draft').first();
  if (!draftRow) {
    return undefined;
  }
  return hydrate(draftRow.id, database);
}

export async function getSession(id: string, database: ActiOutDB = db): Promise<Session | undefined> {
  return hydrate(id, database);
}

// Shared core for routine-based and quick starts. `routines` are the resolved,
// hydrated templates (in argument order); an empty list produces a quick
// session with no links and no items.
async function createDraft(
  sourceMode: 'routine' | 'quick',
  routines: RoutineTemplate[],
  date: string | undefined,
  database: ActiOutDB
): Promise<Session> {
  const now = nowIso();
  const sessionId = newId();
  const sessionDate = date ?? todayLocalDate();

  const linkRows: SessionRoutineLinkRow[] = [];
  const itemRows: SessionItem[] = [];
  let position = 0;

  routines.forEach((routine, index) => {
    const linkId = newId();
    linkRows.push({
      id: linkId,
      sessionId,
      routineTemplateId: routine.id,
      routineNameSnapshot: routine.name,
      sourceSequence: index + 1,
    });

    for (const item of routine.items) {
      position += 1;
      itemRows.push({
        id: newId(),
        sessionId,
        sessionRoutineLinkId: linkId,
        exerciseCatalogId: item.exerciseCatalogId,
        exerciseNameSnapshot: item.exerciseNameSnapshot,
        sequencePosition: position,
        setsPlanned: item.defaultSets ?? routine.defaultSets,
        repsPlanned: item.defaultReps ?? routine.defaultReps,
        restSeconds: item.restSeconds,
        measurementTypeSnapshot: resolveMeasurementType(item.measurementType),
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  const sessionRow: SessionRow = {
    id: sessionId,
    sessionDate,
    status: 'draft',
    sourceMode,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await database.transaction(
    'rw',
    database.sessions,
    database.sessionRoutineLinks,
    database.sessionItems,
    database.appEvents,
    async () => {
      // Draft check inside the transaction so the guard and the insert are
      // atomic: two concurrent starts can't both slip past the check.
      const existingDraft = await database.sessions.where('status').equals('draft').first();
      if (existingDraft) {
        throw new DraftExistsError(existingDraft.id);
      }

      await database.sessions.add(sessionRow);
      if (linkRows.length > 0) {
        await database.sessionRoutineLinks.bulkAdd(linkRows);
      }
      if (itemRows.length > 0) {
        await database.sessionItems.bulkAdd(itemRows);
      }

      await logEvent(
        'session',
        sessionId,
        'started',
        { sourceMode, routineCount: routines.length, itemCount: itemRows.length },
        database
      );
    }
  );

  const created = await hydrate(sessionId, database);
  if (!created) {
    throw new Error(`startSession: failed to hydrate newly created session ${sessionId}`);
  }
  return created;
}

export async function startSession(
  routineTemplateIds: string[],
  date?: string,
  database: ActiOutDB = db
): Promise<Session> {
  const routines: RoutineTemplate[] = [];
  for (const routineId of routineTemplateIds) {
    const routine = await getRoutine(routineId, database);
    if (!routine) {
      throw new Error(`startSession: routine ${routineId} does not exist`);
    }
    routines.push(routine);
  }

  return createDraft('routine', routines, date, database);
}

export async function startQuickSession(date?: string, database: ActiOutDB = db): Promise<Session> {
  return createDraft('quick', [], date, database);
}

export async function updateSessionItem(
  itemId: string,
  patch: Pick<SessionItem, 'notes'>,
  database: ActiOutDB = db
): Promise<void> {
  await database.transaction('rw', database.sessionItems, database.sessions, async () => {
    const item = await database.sessionItems.get(itemId);
    if (!item) {
      throw new Error(`updateSessionItem: item ${itemId} does not exist`);
    }
    const now = nowIso();
    await database.sessionItems.put({ ...item, ...patch, updatedAt: now });

    // Bump the parent session's updatedAt too (M2), so its modification
    // time doesn't lie stale after an item edit.
    const session = await database.sessions.get(item.sessionId);
    if (session) {
      await database.sessions.put({ ...session, updatedAt: now });
    }
  });
}

export async function moveSessionItem(
  itemId: string,
  direction: 'up' | 'down',
  database: ActiOutDB = db
): Promise<void> {
  await database.transaction('rw', database.sessionItems, async () => {
    const item = await database.sessionItems.get(itemId);
    if (!item) {
      throw new Error(`moveSessionItem: item ${itemId} does not exist`);
    }

    const siblings = (await database.sessionItems.where('sessionId').equals(item.sessionId).toArray()).sort(
      (a, b) => a.sequencePosition - b.sequencePosition
    );
    const index = siblings.findIndex((s) => s.id === itemId);
    const neighbourIndex = direction === 'up' ? index - 1 : index + 1;

    // Boundary: no neighbour in that direction -> no-op (still logged as a
    // move attempt would be misleading, so return without an event).
    if (neighbourIndex < 0 || neighbourIndex >= siblings.length) {
      return;
    }

    const current = siblings[index]!;
    const neighbour = siblings[neighbourIndex]!;
    const now = nowIso();

    await database.sessionItems.put({ ...current, sequencePosition: neighbour.sequencePosition, updatedAt: now });
    await database.sessionItems.put({ ...neighbour, sequencePosition: current.sequencePosition, updatedAt: now });
  });
}

// Absolute reorder for drag-and-drop: `orderedItemIds` must be a full
// permutation of the session's item ids; sequencePosition is rewritten 1..N to
// match. Rejecting a non-permutation guards against a stale/partial list
// corrupting positions. (moveSessionItem's up/down swap stays for now; the
// session screen's drag flow calls this instead.)
export async function reorderSessionItems(
  sessionId: string,
  orderedItemIds: string[],
  database: ActiOutDB = db
): Promise<void> {
  await database.transaction('rw', database.sessionItems, async () => {
    const siblings = await database.sessionItems.where('sessionId').equals(sessionId).toArray();
    const siblingIds = new Set(siblings.map((s) => s.id));

    const seen = new Set<string>();
    for (const id of orderedItemIds) {
      if (!siblingIds.has(id) || seen.has(id)) {
        throw new Error(`reorderSessionItems: ${id} is not a unique item of session ${sessionId}`);
      }
      seen.add(id);
    }
    if (orderedItemIds.length !== siblings.length) {
      throw new Error(
        `reorderSessionItems: expected all ${siblings.length} items, got ${orderedItemIds.length}`
      );
    }

    const now = nowIso();
    const byId = new Map(siblings.map((s) => [s.id, s]));
    for (let index = 0; index < orderedItemIds.length; index += 1) {
      const item = byId.get(orderedItemIds[index]!)!;
      const position = index + 1;
      if (item.sequencePosition !== position) {
        await database.sessionItems.put({ ...item, sequencePosition: position, updatedAt: now });
      }
    }
  });
}

export async function addSessionItem(
  sessionId: string,
  exerciseName: string,
  opts?: EnsureExerciseOptions,
  database: ActiOutDB = db
): Promise<SessionItem> {
  // Resolve out-of-transaction dependencies first.
  const catalogEntry = await ensureExercise(exerciseName, opts, database);

  const now = nowIso();
  let created: SessionItem | undefined;

  await database.transaction('rw', database.sessions, database.sessionItems, async () => {
    const session = await database.sessions.get(sessionId);
    if (!session) {
      throw new Error(`addSessionItem: session ${sessionId} does not exist`);
    }

    const siblings = await database.sessionItems.where('sessionId').equals(sessionId).toArray();
    const maxPosition = siblings.reduce((max, s) => Math.max(max, s.sequencePosition), 0);

    const item: SessionItem = {
      id: newId(),
      sessionId,
      exerciseCatalogId: catalogEntry.id,
      exerciseNameSnapshot: catalogEntry.canonicalName,
      sequencePosition: maxPosition + 1,
      measurementTypeSnapshot: resolveMeasurementType(catalogEntry.measurementType),
      createdAt: now,
      updatedAt: now,
    };

    await database.sessionItems.add(item);
    created = item;
  });

  if (!created) {
    throw new Error(`addSessionItem: failed to create item for session ${sessionId}`);
  }
  return created;
}

export async function removeSessionItem(itemId: string, database: ActiOutDB = db): Promise<void> {
  await database.transaction('rw', database.sessionItems, database.sessionSets, async () => {
    const item = await database.sessionItems.get(itemId);
    if (!item) {
      throw new Error(`removeSessionItem: item ${itemId} does not exist`);
    }

    await database.sessionItems.delete(itemId);
    await database.sessionSets.where('sessionItemId').equals(itemId).delete();

    // Renumber the remaining items contiguously 1..n, preserving order.
    const remaining = (await database.sessionItems.where('sessionId').equals(item.sessionId).toArray()).sort(
      (a, b) => a.sequencePosition - b.sequencePosition
    );
    const now = nowIso();
    for (let index = 0; index < remaining.length; index += 1) {
      const row = remaining[index]!;
      const expected = index + 1;
      if (row.sequencePosition !== expected) {
        await database.sessionItems.put({ ...row, sequencePosition: expected, updatedAt: now });
      }
    }
  });
}

async function finishSession(
  id: string,
  status: 'completed' | 'dnf',
  eventType: 'completed' | 'dnf',
  database: ActiOutDB
): Promise<void> {
  await database.transaction(
    'rw',
    database.sessions,
    database.sessionItems,
    database.sessionSets,
    database.appEvents,
    async () => {
    const session = await database.sessions.get(id);
    if (!session) {
      throw new Error(`${eventType}Session: session ${id} does not exist`);
    }
    if (session.status !== 'draft') {
      throw new Error(`${eventType}Session: session ${id} is not a draft (status: ${session.status})`);
    }

    // Completion (not DNF) requires derived state: at least one item whose
    // work sets are all completed.
    if (status === 'completed') {
      const items = await database.sessionItems.where('sessionId').equals(id).toArray();
      let anyComplete = false;
      for (const item of items) {
        const sets = await database.sessionSets.where('sessionItemId').equals(item.id).toArray();
        if (isItemComplete(sets)) {
          anyComplete = true;
          break;
        }
      }
      if (!anyComplete) {
        throw new Error(`completeSession: session ${id} has no completed items`);
      }
    }

    const endedAt = nowIso();
    const startedMs = session.startedAt ? Date.parse(session.startedAt) : Date.parse(endedAt);
    const durationSeconds = Math.round((Date.parse(endedAt) - startedMs) / 1000);

    await database.sessions.put({ ...session, status, endedAt, durationSeconds, updatedAt: endedAt });
    await logEvent('session', id, eventType, { durationSeconds }, database);
    }
  );
}

// Cascade-deletes a session and all its children (links, items, sets) in one
// transaction, then logs a 'deleted' event. Throws on a missing id so a stray
// delete of an already-gone session emits no phantom event (INV-8).
export async function deleteSession(id: string, database: ActiOutDB = db): Promise<void> {
  await database.transaction(
    'rw',
    database.sessions,
    database.sessionRoutineLinks,
    database.sessionItems,
    database.sessionSets,
    database.appEvents,
    async () => {
      const session = await database.sessions.get(id);
      if (!session) {
        throw new Error(`deleteSession: session ${id} does not exist`);
      }

      await database.sessionRoutineLinks.where('sessionId').equals(id).delete();
      await database.sessionItems.where('sessionId').equals(id).delete();
      await database.sessionSets.where('sessionId').equals(id).delete();
      await database.sessions.delete(id);

      await logEvent('session', id, 'deleted', { status: session.status }, database);
    }
  );
}

// Validated entry point for the UI "Edit" affordance on a finished session.
// Mutation of completed/dnf sessions is now intended, so there is no status
// change to make — this only asserts the session exists and returns.
export async function unlockSession(id: string, database: ActiOutDB = db): Promise<void> {
  const session = await database.sessions.get(id);
  if (!session) {
    throw new Error(`unlockSession: session ${id} does not exist`);
  }
}

export async function completeSession(id: string, database: ActiOutDB = db): Promise<void> {
  await finishSession(id, 'completed', 'completed', database);
}

export async function dnfSession(id: string, database: ActiOutDB = db): Promise<void> {
  await finishSession(id, 'dnf', 'dnf', database);
}

export async function listSessions(
  opts?: { statuses?: SessionStatus[]; limit?: number },
  database: ActiOutDB = db
): Promise<Session[]> {
  const rows = await database.sessions.toArray();

  const statuses = opts?.statuses;
  const filtered = statuses ? rows.filter((row) => statuses.includes(row.status)) : rows;

  // Newest date first; break ties on createdAt (descending) for stability.
  filtered.sort((a, b) => {
    if (a.sessionDate !== b.sessionDate) {
      return a.sessionDate < b.sessionDate ? 1 : -1;
    }
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });

  const limited = opts?.limit !== undefined ? filtered.slice(0, opts.limit) : filtered;

  const hydrated = await Promise.all(limited.map((row) => hydrate(row.id, database)));
  return hydrated.filter((s): s is Session => s !== undefined);
}
