import type { SessionItem, SessionStatus, WeightUnit } from '../domain/types';
import { ActiOutDB, db, type SessionRow } from '../db/schema';
import { convertWeight } from '../domain/units';
import { localDateDaysAgo, weekdayOf } from '../utils/dates';
import { normalizeExerciseName } from './exercise-service';

export type HistoryEntry = {
  sessionId: string;
  date: string;
  status: SessionStatus;
  position: number;
  sets?: number;
  reps?: number;
  weight?: number;
  weightUnit: WeightUnit;
  volume?: number;
};

// Values expressed in the caller's requested displayUnit.
export type PRSummary = {
  weight?: { value: number; date: string };
  volume?: { value: number; date: string };
};

// Values expressed in the caller's requested displayUnit.
export type SequenceStat = {
  position: number;
  avgWeight?: number;
  avgVolume?: number;
  count: number;
};

// volume is meaningful only when sets, reps, and weight are all present.
// Returned in the row's own weightUnit (weight is not converted here).
function rowVolume(item: SessionItem): number | undefined {
  if (item.setsActual === undefined || item.repsActual === undefined || item.weightActual === undefined) {
    return undefined;
  }
  return item.setsActual * item.repsActual * item.weightActual;
}

// Loads the session items whose exercise matches `name` (via canonical
// normalization), joined to their session, honoring the status rules:
// completed always; DNF only when includeDnf; draft never.
async function matchingItems(
  name: string,
  includeDnf: boolean,
  database: ActiOutDB
): Promise<Array<{ item: SessionItem; session: SessionRow }>> {
  const target = normalizeExerciseName(name);
  const allItems = await database.sessionItems.toArray();
  const matched = allItems.filter((item) => normalizeExerciseName(item.exerciseNameSnapshot) === target);
  if (matched.length === 0) {
    return [];
  }

  const sessionIds = [...new Set(matched.map((i) => i.sessionId))];
  const sessions = await Promise.all(sessionIds.map((id) => database.sessions.get(id)));
  const sessionMap = new Map<string, SessionRow>();
  for (const session of sessions) {
    if (session) {
      sessionMap.set(session.id, session);
    }
  }

  const allowed: SessionStatus[] = includeDnf ? ['completed', 'dnf'] : ['completed'];
  const result: Array<{ item: SessionItem; session: SessionRow }> = [];
  for (const item of matched) {
    const session = sessionMap.get(item.sessionId);
    if (session && allowed.includes(session.status)) {
      result.push({ item, session });
    }
  }
  return result;
}

// Distinct exercise-name snapshots across all non-draft sessions, sorted.
// Draft sessions are never counted (per the analytics semantics).
export async function getLoggedExerciseNames(database: ActiOutDB = db): Promise<string[]> {
  const [sessions, items] = await Promise.all([
    database.sessions.toArray(),
    database.sessionItems.toArray(),
  ]);

  const nonDraftIds = new Set(sessions.filter((s) => s.status !== 'draft').map((s) => s.id));
  const names = new Set<string>();
  for (const item of items) {
    if (nonDraftIds.has(item.sessionId)) {
      names.add(item.exerciseNameSnapshot);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

// Per-item history, newest date first (ties broken by ascending position for a
// stable order). Weight/volume are reported in each row's own unit.
export async function getExerciseHistory(
  name: string,
  includeDnf: boolean = false,
  database: ActiOutDB = db
): Promise<HistoryEntry[]> {
  const matched = await matchingItems(name, includeDnf, database);

  const entries: HistoryEntry[] = matched.map(({ item, session }) => ({
    sessionId: item.sessionId,
    date: session.sessionDate,
    status: session.status,
    position: item.sequencePosition,
    sets: item.setsActual,
    reps: item.repsActual,
    weight: item.weightActual,
    weightUnit: item.weightUnit,
    volume: rowVolume(item),
  }));

  entries.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1; // newest first
    }
    return a.position - b.position;
  });
  return entries;
}

// Best weight and best volume, each converted per-row into displayUnit before
// comparison. Absent when no qualifying rows exist.
export async function getPRs(
  name: string,
  displayUnit: WeightUnit,
  includeDnf: boolean = false,
  database: ActiOutDB = db
): Promise<PRSummary> {
  const matched = await matchingItems(name, includeDnf, database);

  let weight: PRSummary['weight'];
  let volume: PRSummary['volume'];

  // A PR means "first achieved": on an equal value, keep the earliest
  // session.sessionDate rather than whichever row iteration (primary-key /
  // insertion order, unrelated to date) happens to visit first. If the date
  // also ties, break on the lexicographically smaller session id so the
  // result is fully deterministic.
  const isBetter = (
    value: number,
    session: SessionRow,
    current: { value: number; date: string; sessionId: string } | undefined
  ): boolean => {
    if (!current) {
      return true;
    }
    if (value > current.value) {
      return true;
    }
    if (value < current.value) {
      return false;
    }
    if (session.sessionDate < current.date) {
      return true;
    }
    if (session.sessionDate > current.date) {
      return false;
    }
    return session.id < current.sessionId;
  };

  let weightBest: { value: number; date: string; sessionId: string } | undefined;
  let volumeBest: { value: number; date: string; sessionId: string } | undefined;

  for (const { item, session } of matched) {
    if (item.weightActual !== undefined) {
      const value = convertWeight(item.weightActual, item.weightUnit, displayUnit);
      if (isBetter(value, session, weightBest)) {
        weightBest = { value, date: session.sessionDate, sessionId: session.id };
      }
    }

    const vol = rowVolume(item);
    if (vol !== undefined) {
      // Convert to displayUnit: volume scales linearly with weight.
      const value = convertWeight(vol, item.weightUnit, displayUnit);
      if (isBetter(value, session, volumeBest)) {
        volumeBest = { value, date: session.sessionDate, sessionId: session.id };
      }
    }
  }

  weight = weightBest ? { value: weightBest.value, date: weightBest.date } : undefined;
  volume = volumeBest ? { value: volumeBest.value, date: volumeBest.date } : undefined;

  return { weight, volume };
}

// Average weight/volume grouped by sequence position, converted per-row into
// displayUnit before averaging. Rows with undefined weight are excluded from
// avgWeight (and undefined volume from avgVolume) but still counted.
export async function getSequenceStats(
  name: string,
  displayUnit: WeightUnit,
  includeDnf: boolean = false,
  database: ActiOutDB = db
): Promise<SequenceStat[]> {
  const matched = await matchingItems(name, includeDnf, database);

  const buckets = new Map<number, { weights: number[]; volumes: number[]; count: number }>();
  for (const { item } of matched) {
    let bucket = buckets.get(item.sequencePosition);
    if (!bucket) {
      bucket = { weights: [], volumes: [], count: 0 };
      buckets.set(item.sequencePosition, bucket);
    }
    bucket.count += 1;

    if (item.weightActual !== undefined) {
      bucket.weights.push(convertWeight(item.weightActual, item.weightUnit, displayUnit));
    }
    const vol = rowVolume(item);
    if (vol !== undefined) {
      bucket.volumes.push(convertWeight(vol, item.weightUnit, displayUnit));
    }
  }

  const mean = (values: number[]): number | undefined =>
    values.length === 0 ? undefined : values.reduce((a, b) => a + b, 0) / values.length;

  return [...buckets.entries()]
    .map(([position, bucket]) => ({
      position,
      avgWeight: mean(bucket.weights),
      avgVolume: mean(bucket.volumes),
      count: bucket.count,
    }))
    .sort((a, b) => a.position - b.position);
}

// Completed-session counts over the last `days` days (inclusive of today).
// byWeekday has length 7, index 0 = Sunday. Consistency counts completed only
// (DNF and draft excluded). byDate lists dates that have a completed session,
// ascending.
export async function getConsistency(
  days: number,
  database: ActiOutDB = db
): Promise<{ byDate: Array<{ date: string; completed: number }>; byWeekday: number[] }> {
  const cutoff = localDateDaysAgo(Math.max(days - 1, 0));
  const sessions = await database.sessions.toArray();

  const byWeekday = new Array<number>(7).fill(0);
  const perDate = new Map<string, number>();

  for (const session of sessions) {
    if (session.status !== 'completed') {
      continue;
    }
    if (session.sessionDate < cutoff) {
      continue;
    }
    const weekday = weekdayOf(session.sessionDate);
    byWeekday[weekday] = (byWeekday[weekday] ?? 0) + 1;
    perDate.set(session.sessionDate, (perDate.get(session.sessionDate) ?? 0) + 1);
  }

  const byDate = [...perDate.entries()]
    .map(([date, completed]) => ({ date, completed }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { byDate, byWeekday };
}

// Bodyweight entries converted into displayUnit, ascending by date.
export async function getBodyweightTrend(
  displayUnit: WeightUnit,
  database: ActiOutDB = db
): Promise<Array<{ date: string; value: number }>> {
  const entries = await database.bodyweightEntries.toArray();
  return entries
    .map((entry) => ({
      date: entry.entryDate,
      value: convertWeight(entry.weightValue, entry.weightUnit, displayUnit),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
