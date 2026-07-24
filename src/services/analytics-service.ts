import type { SessionItem, SessionSet, SessionStatus, WeightUnit } from '../domain/types';
import { ActiOutDB, db, type SessionRow } from '../db/schema';
import { convertWeight } from '../domain/units';
import { localDateDaysAgo, weekdayOf } from '../utils';
import { normalizeExerciseName } from './exercise-service';

// Per-item summary computed from that item's non-warmup, completed ("working")
// sets. topSet/totalReps/totalVolume are expressed in the first working set's
// own weightUnit, UNCONVERTED — consumers convert later.
export type HistoryEntry = {
  sessionId: string;
  date: string;
  status: SessionStatus;
  position: number;
  topSet?: number;
  totalReps?: number;
  totalVolume?: number;
  setCount: number;
  weightUnit: WeightUnit;
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

// A "working set" is a non-warmup set that was actually completed (INV-7 warmup
// exclusion; completed-only = actual logged work). Volume, PRs, history, and
// last-performance are all computed from these.
function workingSets(sets: SessionSet[]): SessionSet[] {
  return sets.filter((s) => !s.isWarmup && s.completed);
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

// As matchingItems, but joins each item to all of its SessionSet rows (raw —
// each consumer filters to working sets as needed).
async function matchingItemsWithSets(
  name: string,
  includeDnf: boolean,
  database: ActiOutDB
): Promise<Array<{ item: SessionItem; session: SessionRow; sets: SessionSet[] }>> {
  const base = await matchingItems(name, includeDnf, database);
  if (base.length === 0) {
    return [];
  }

  const itemIds = base.map((b) => b.item.id);
  const allSets = await database.sessionSets.where('sessionItemId').anyOf(itemIds).toArray();
  const byItem = new Map<string, SessionSet[]>();
  for (const set of allSets) {
    const bucket = byItem.get(set.sessionItemId);
    if (bucket) {
      bucket.push(set);
    } else {
      byItem.set(set.sessionItemId, [set]);
    }
  }

  return base.map(({ item, session }) => ({ item, session, sets: byItem.get(item.id) ?? [] }));
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

// Per-item history summarized over the item's working sets, newest date first
// (ties broken by ascending position for a stable order). topSet/totalReps/
// totalVolume are in the first working set's own unit, UNCONVERTED.
export async function getExerciseHistory(
  name: string,
  includeDnf: boolean = false,
  database: ActiOutDB = db
): Promise<HistoryEntry[]> {
  const matched = await matchingItemsWithSets(name, includeDnf, database);

  const entries: HistoryEntry[] = matched.map(({ item, session, sets }) => {
    const work = workingSets(sets).sort((a, b) => a.setNumber - b.setNumber);
    const weights = work.filter((s) => s.weight !== undefined).map((s) => s.weight as number);

    const summary =
      work.length === 0
        ? { topSet: undefined, totalReps: undefined, totalVolume: undefined }
        : {
            topSet: weights.length > 0 ? Math.max(...weights) : undefined,
            totalReps: work.reduce((sum, s) => sum + (s.reps ?? 0), 0),
            totalVolume: work.reduce((sum, s) => sum + (s.reps ?? 0) * (s.weight ?? 0), 0),
          };

    return {
      sessionId: item.sessionId,
      date: session.sessionDate,
      status: session.status,
      position: item.sequencePosition,
      topSet: summary.topSet,
      totalReps: summary.totalReps,
      totalVolume: summary.totalVolume,
      setCount: work.length,
      weightUnit: work[0]?.weightUnit ?? sets[0]?.weightUnit ?? 'lb',
    };
  });

  entries.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1; // newest first
    }
    return a.position - b.position;
  });
  return entries;
}

// Weight PR = heaviest single working set (converted to displayUnit). Volume PR
// = best per-session total working-set volume (each set converted before
// summing, since units can differ within a session). Absent when no qualifying
// sets exist.
export async function getPRs(
  name: string,
  displayUnit: WeightUnit,
  includeDnf: boolean = false,
  database: ActiOutDB = db
): Promise<PRSummary> {
  const matched = await matchingItemsWithSets(name, includeDnf, database);

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

  // Accumulate per-session volume across every matching item in that session.
  const sessionVolumes = new Map<string, { session: SessionRow; volume: number; has: boolean }>();

  for (const { session, sets } of matched) {
    const work = workingSets(sets);

    for (const set of work) {
      if (set.weight !== undefined) {
        const value = convertWeight(set.weight, set.weightUnit, displayUnit);
        if (isBetter(value, session, weightBest)) {
          weightBest = { value, date: session.sessionDate, sessionId: session.id };
        }
      }
    }

    let acc = sessionVolumes.get(session.id);
    if (!acc) {
      acc = { session, volume: 0, has: false };
      sessionVolumes.set(session.id, acc);
    }
    for (const set of work) {
      if (set.reps !== undefined && set.weight !== undefined) {
        acc.volume += convertWeight(set.reps * set.weight, set.weightUnit, displayUnit);
        acc.has = true;
      }
    }
  }

  for (const { session, volume: vol, has } of sessionVolumes.values()) {
    if (has && isBetter(vol, session, volumeBest)) {
      volumeBest = { value: vol, date: session.sessionDate, sessionId: session.id };
    }
  }

  weight = weightBest ? { value: weightBest.value, date: weightBest.date } : undefined;
  volume = volumeBest ? { value: volumeBest.value, date: volumeBest.date } : undefined;

  return { weight, volume };
}

// Averages grouped by the item's sequence position. avgWeight = mean of all
// working-set weights (converted); avgVolume = mean of per-session total working
// volumes at that position; count = distinct sessions at that position.
export async function getSequenceStats(
  name: string,
  displayUnit: WeightUnit,
  includeDnf: boolean = false,
  database: ActiOutDB = db
): Promise<SequenceStat[]> {
  const matched = await matchingItemsWithSets(name, includeDnf, database);

  const buckets = new Map<
    number,
    { weights: number[]; sessionVolumes: Map<string, { volume: number; has: boolean }>; sessions: Set<string> }
  >();

  for (const { item, session, sets } of matched) {
    let bucket = buckets.get(item.sequencePosition);
    if (!bucket) {
      bucket = { weights: [], sessionVolumes: new Map(), sessions: new Set() };
      buckets.set(item.sequencePosition, bucket);
    }
    bucket.sessions.add(session.id);

    const work = workingSets(sets);
    for (const set of work) {
      if (set.weight !== undefined) {
        bucket.weights.push(convertWeight(set.weight, set.weightUnit, displayUnit));
      }
    }

    let acc = bucket.sessionVolumes.get(session.id);
    if (!acc) {
      acc = { volume: 0, has: false };
      bucket.sessionVolumes.set(session.id, acc);
    }
    for (const set of work) {
      if (set.reps !== undefined && set.weight !== undefined) {
        acc.volume += convertWeight(set.reps * set.weight, set.weightUnit, displayUnit);
        acc.has = true;
      }
    }
  }

  const mean = (values: number[]): number | undefined =>
    values.length === 0 ? undefined : values.reduce((a, b) => a + b, 0) / values.length;

  return [...buckets.entries()]
    .map(([position, bucket]) => {
      const volumes = [...bucket.sessionVolumes.values()].filter((v) => v.has).map((v) => v.volume);
      return {
        position,
        avgWeight: mean(bucket.weights),
        avgVolume: mean(volumes),
        count: bucket.sessions.size,
      };
    })
    .sort((a, b) => a.position - b.position);
}

// The most recent completed session's working sets for the exercise (matched by
// normalized name), by descending sessionDate then descending createdAt. Sets
// are sorted by setNumber and reported in their own stored unit. undefined when
// no completed history exists.
export async function getLastPerformance(
  name: string,
  database: ActiOutDB = db
): Promise<
  { date: string; sets: Array<{ setNumber: number; reps?: number; weight?: number; weightUnit: WeightUnit }> } | undefined
> {
  const matched = await matchingItemsWithSets(name, false, database);
  // Only candidates with at least one working set are eligible — an item that
  // was only warmups (or wasn't the item that satisfied completeSession's
  // ≥1-complete-item rule) must not shadow a real earlier performance.
  const withWork = matched.filter((c) => workingSets(c.sets).length > 0);
  if (withWork.length === 0) {
    return undefined;
  }

  let best: { item: SessionItem; session: SessionRow; sets: SessionSet[] } | undefined;
  for (const candidate of withWork) {
    if (!best) {
      best = candidate;
      continue;
    }
    const c = candidate.session;
    const b = best.session;
    if (c.sessionDate > b.sessionDate) {
      best = candidate;
    } else if (c.sessionDate === b.sessionDate) {
      if (c.createdAt > b.createdAt) {
        best = candidate;
      } else if (c.createdAt === b.createdAt && candidate.item.sequencePosition < best.item.sequencePosition) {
        best = candidate;
      }
    }
  }

  if (!best) {
    return undefined;
  }

  const work = workingSets(best.sets).sort((a, b) => a.setNumber - b.setNumber);
  return {
    date: best.session.sessionDate,
    sets: work.map((s) => ({ setNumber: s.setNumber, reps: s.reps, weight: s.weight, weightUnit: s.weightUnit })),
  };
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
