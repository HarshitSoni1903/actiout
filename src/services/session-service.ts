import type { RoutineTemplate, Session, SessionItem, SessionRoutineLink, SessionStatus } from '../domain/types';
import { ActiOutDB, db, type SessionRow } from '../db/schema';
import { convertWeight } from '../domain/units';
import { nowIso, todayLocalDate } from '../utils/dates';
import { newId } from '../utils/ids';
import { ensureExercise } from './exercise-service';
import { getPreferences } from './preference-service';
import { getRoutine } from './routine-service';
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
  // Resolve out-of-transaction dependencies first (Dexie forbids touching
  // tables not enrolled in the active transaction).
  const preference = await getPreferences(database);
  const prefUnit = preference.weightUnit;

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
      const setsPlanned = item.defaultSets ?? routine.defaultSets;
      const repsPlanned = item.defaultReps ?? routine.defaultReps;

      let weightActual = item.defaultWeight;
      if (weightActual !== undefined) {
        const fromUnit = item.defaultWeightUnit ?? prefUnit;
        if (fromUnit !== prefUnit) {
          weightActual = convertWeight(weightActual, fromUnit, prefUnit);
        }
      }

      itemRows.push({
        id: newId(),
        sessionId,
        sessionRoutineLinkId: linkId,
        exerciseCatalogId: item.exerciseCatalogId,
        exerciseNameSnapshot: item.exerciseNameSnapshot,
        sequencePosition: position,
        setsPlanned,
        repsPlanned,
        setsActual: setsPlanned,
        repsActual: repsPlanned,
        weightActual,
        weightUnit: prefUnit,
        completed: false,
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
  patch: Partial<Pick<SessionItem, 'setsActual' | 'repsActual' | 'weightActual' | 'notes' | 'completed'>>,
  database: ActiOutDB = db
): Promise<void> {
  await database.transaction('rw', database.sessionItems, async () => {
    const item = await database.sessionItems.get(itemId);
    if (!item) {
      throw new Error(`updateSessionItem: item ${itemId} does not exist`);
    }
    await database.sessionItems.put({ ...item, ...patch, updatedAt: nowIso() });
  });
}

export async function moveSessionItem(
  itemId: string,
  direction: 'up' | 'down',
  database: ActiOutDB = db
): Promise<void> {
  await database.transaction('rw', database.sessionItems, database.appEvents, async () => {
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

    await logEvent('session', item.sessionId, 'item-moved', { itemId, direction }, database);
  });
}

export async function addSessionItem(
  sessionId: string,
  exerciseName: string,
  database: ActiOutDB = db
): Promise<SessionItem> {
  // Resolve out-of-transaction dependencies first.
  const [preference, catalogEntry] = await Promise.all([
    getPreferences(database),
    ensureExercise(exerciseName, database),
  ]);

  const now = nowIso();
  let created: SessionItem | undefined;

  await database.transaction('rw', database.sessions, database.sessionItems, database.appEvents, async () => {
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
      weightUnit: preference.weightUnit,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    await database.sessionItems.add(item);
    await logEvent('session', sessionId, 'item-added', { itemId: item.id, exercise: catalogEntry.canonicalName }, database);
    created = item;
  });

  if (!created) {
    throw new Error(`addSessionItem: failed to create item for session ${sessionId}`);
  }
  return created;
}

export async function removeSessionItem(itemId: string, database: ActiOutDB = db): Promise<void> {
  await database.transaction('rw', database.sessionItems, database.appEvents, async () => {
    const item = await database.sessionItems.get(itemId);
    if (!item) {
      throw new Error(`removeSessionItem: item ${itemId} does not exist`);
    }

    await database.sessionItems.delete(itemId);

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

    await logEvent('session', item.sessionId, 'item-removed', { itemId }, database);
  });
}

async function finishSession(
  id: string,
  status: 'completed' | 'dnf',
  eventType: 'completed' | 'dnf',
  database: ActiOutDB
): Promise<void> {
  await database.transaction('rw', database.sessions, database.appEvents, async () => {
    const session = await database.sessions.get(id);
    if (!session) {
      throw new Error(`${eventType}Session: session ${id} does not exist`);
    }
    if (session.status !== 'draft') {
      throw new Error(`${eventType}Session: session ${id} is not a draft (status: ${session.status})`);
    }

    const endedAt = nowIso();
    const startedMs = session.startedAt ? Date.parse(session.startedAt) : Date.parse(endedAt);
    const durationSeconds = Math.round((Date.parse(endedAt) - startedMs) / 1000);

    await database.sessions.put({ ...session, status, endedAt, durationSeconds, updatedAt: endedAt });
    await logEvent('session', id, eventType, { durationSeconds }, database);
  });
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
