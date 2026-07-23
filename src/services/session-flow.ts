import type { SessionItem, SessionSet, WeightUnit } from '../domain/types';
import { ActiOutDB, db } from '../db/schema';
import { nowIso } from '../utils/dates';
import { newId } from '../utils/ids';

// Stamps activatedAt on first tap. No-op (no write at all) if already
// activated, so a repeated tap can never move the item's rank in the
// activation order.
export async function activateSessionItem(itemId: string, database: ActiOutDB = db): Promise<void> {
  await database.transaction('rw', database.sessionItems, database.sessions, async () => {
    const item = await database.sessionItems.get(itemId);
    if (!item) {
      throw new Error(`activateSessionItem: session item ${itemId} does not exist`);
    }
    if (item.activatedAt) {
      return;
    }

    const now = nowIso();
    await database.sessionItems.put({ ...item, activatedAt: now, updatedAt: now });

    const session = await database.sessions.get(item.sessionId);
    if (session) {
      await database.sessions.put({ ...session, updatedAt: now });
    }
  });
}

// Toggles per-exercise DNF on/off.
export async function dnfSessionItem(itemId: string, database: ActiOutDB = db): Promise<void> {
  await database.transaction('rw', database.sessionItems, database.sessions, async () => {
    const item = await database.sessionItems.get(itemId);
    if (!item) {
      throw new Error(`dnfSessionItem: session item ${itemId} does not exist`);
    }

    const now = nowIso();
    const { dnfAt: _dnfAt, ...rest } = item;
    const patched: SessionItem = item.dnfAt ? { ...rest, updatedAt: now } : { ...item, dnfAt: now, updatedAt: now };
    await database.sessionItems.put(patched);

    const session = await database.sessions.get(item.sessionId);
    if (session) {
      await database.sessions.put({ ...session, updatedAt: now });
    }
  });
}

// Basic-mode aggregate entry: makes the item have exactly `agg.sets` sets,
// completed: true, isWarmup: false — aggregate mode owns the item's set
// count/completed/isWarmup regardless of prior state. For existing (kept)
// rows, each metric field (reps/weight/durationSeconds/distance/distanceUnit)
// is overwritten only when `agg` provides it; an omitted field falls back to
// the row's current value so a blank basic-mode input never silently erases
// a value recorded elsewhere (e.g. a per-set stopwatch). weightUnit always
// comes from `agg` (it is required). New rows simply take the agg values —
// there is nothing to preserve. Extra sets are removed; missing ones are
// added; all are renumbered contiguously 1..n.
export async function applyAggregateSets(
  itemId: string,
  agg: {
    sets: number;
    reps?: number;
    weight?: number;
    weightUnit: WeightUnit;
    durationSeconds?: number;
    distance?: number;
    distanceUnit?: 'mi' | 'km';
  },
  database: ActiOutDB = db
): Promise<void> {
  await database.transaction('rw', database.sessionItems, database.sessionSets, database.sessions, async () => {
    const item = await database.sessionItems.get(itemId);
    if (!item) {
      throw new Error(`applyAggregateSets: session item ${itemId} does not exist`);
    }

    const existing = (await database.sessionSets.where('sessionItemId').equals(itemId).toArray()).sort(
      (a, b) => a.setNumber - b.setNumber
    );

    const now = nowIso();
    const target = agg.sets;
    const kept = Math.min(existing.length, target);

    for (let index = 0; index < kept; index += 1) {
      const row = existing[index]!;
      const patched: SessionSet = {
        ...row,
        setNumber: index + 1,
        reps: agg.reps ?? row.reps,
        weight: agg.weight ?? row.weight,
        // The unit only travels with a weight — a type whose lb/kg control is
        // hidden must never silently relabel an existing weight.
        weightUnit: agg.weight !== undefined ? agg.weightUnit : row.weightUnit,
        durationSeconds: agg.durationSeconds ?? row.durationSeconds,
        distance: agg.distance ?? row.distance,
        distanceUnit: agg.distanceUnit ?? row.distanceUnit,
        isWarmup: false,
        completed: true,
        updatedAt: now,
      };
      await database.sessionSets.put(patched);
    }

    for (let index = kept; index < target; index += 1) {
      const created: SessionSet = {
        id: newId(),
        sessionId: item.sessionId,
        sessionItemId: itemId,
        setNumber: index + 1,
        reps: agg.reps,
        weight: agg.weight,
        weightUnit: agg.weightUnit,
        durationSeconds: agg.durationSeconds,
        distance: agg.distance,
        distanceUnit: agg.distanceUnit,
        isWarmup: false,
        completed: true,
        createdAt: now,
        updatedAt: now,
      };
      await database.sessionSets.add(created);
    }

    for (let index = target; index < existing.length; index += 1) {
      await database.sessionSets.delete(existing[index]!.id);
    }

    await database.sessionItems.put({ ...item, updatedAt: now });

    const session = await database.sessions.get(item.sessionId);
    if (session) {
      await database.sessions.put({ ...session, updatedAt: now });
    }
  });
}

export type ItemPhase = 'finished' | 'active' | 'queued';

// finished = dnfAt set OR (activated && complete); active = activated && not
// finished; queued = never activated.
export function itemPhase(item: SessionItem, complete: boolean): ItemPhase {
  if (item.dnfAt || (item.activatedAt && complete)) {
    return 'finished';
  }
  if (item.activatedAt) {
    return 'active';
  }
  return 'queued';
}

// finished (by activatedAt asc) -> active (by activatedAt asc) -> queued
// (by sequencePosition asc).
export function orderSessionItems(items: SessionItem[], completeById: Map<string, boolean>): SessionItem[] {
  const finished: SessionItem[] = [];
  const active: SessionItem[] = [];
  const queued: SessionItem[] = [];

  for (const item of items) {
    const phase = itemPhase(item, completeById.get(item.id) ?? false);
    if (phase === 'finished') {
      finished.push(item);
    } else if (phase === 'active') {
      active.push(item);
    } else {
      queued.push(item);
    }
  }

  // Finished items DNF'd straight from the queue (never activated) have no
  // activatedAt to sort by — fall back to dnfAt so they slot in
  // chronologically among items that were activated first. Ties (same
  // millisecond) rely on Array#sort's ES2019 sort stability, keeping the
  // original relative order.
  const byFinishedKey = (a: SessionItem, b: SessionItem): number =>
    (a.activatedAt ?? a.dnfAt ?? '').localeCompare(b.activatedAt ?? b.dnfAt ?? '');
  // Active items are always activated (queued items never reach this group),
  // so activatedAt is always present here.
  const byActivatedAt = (a: SessionItem, b: SessionItem): number => (a.activatedAt ?? '').localeCompare(b.activatedAt ?? '');

  finished.sort(byFinishedKey);
  active.sort(byActivatedAt);
  queued.sort((a, b) => a.sequencePosition - b.sequencePosition);

  return [...finished, ...active, ...queued];
}

// 1-based rank of activatedAt among activated items; unactivated items are
// absent from the map.
export function activationNumbers(items: SessionItem[]): Map<string, number> {
  const activated = items
    .filter((item): item is SessionItem & { activatedAt: string } => item.activatedAt !== undefined)
    .slice()
    .sort((a, b) => a.activatedAt.localeCompare(b.activatedAt));

  const numbers = new Map<string, number>();
  activated.forEach((item, index) => {
    numbers.set(item.id, index + 1);
  });
  return numbers;
}
