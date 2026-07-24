import type { BodyweightEntry, WeightUnit } from '../domain/types';
import { ActiOutDB, db } from '../db/schema';
import { newId, nowIso, todayLocalDate } from '../utils';
import { logEvent } from './events';

export async function addBodyweight(
  value: number,
  unit: WeightUnit,
  date?: string,
  notes?: string,
  database: ActiOutDB = db
): Promise<BodyweightEntry> {
  if (!(value > 0)) {
    throw new Error(`addBodyweight: value must be greater than 0, got ${value}`);
  }

  const now = nowIso();
  const entry: BodyweightEntry = {
    id: newId(),
    entryDate: date ?? todayLocalDate(),
    weightValue: value,
    weightUnit: unit,
    notes,
    createdAt: now,
    updatedAt: now,
  };

  await database.bodyweightEntries.add(entry);
  await logEvent('bodyweight', entry.id, 'created', undefined, database);

  return entry;
}

// Newest entryDate first; break ties on createdAt (descending) for stability.
export async function listBodyweight(database: ActiOutDB = db): Promise<BodyweightEntry[]> {
  const rows = await database.bodyweightEntries.toArray();
  return rows.sort((a, b) => {
    if (a.entryDate !== b.entryDate) {
      return a.entryDate < b.entryDate ? 1 : -1;
    }
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });
}

// A missing id is a silent no-op (does not throw) and, per M1, logs no event
// — without this existence check a double-clicked delete button (or any
// delete of an already-gone id) would emit a phantom 'deleted' event for an
// entity that never existed.
export async function deleteBodyweight(id: string, database: ActiOutDB = db): Promise<void> {
  const existing = await database.bodyweightEntries.get(id);
  if (!existing) {
    return;
  }

  await database.bodyweightEntries.delete(id);
  await logEvent('bodyweight', id, 'deleted', undefined, database);
}
