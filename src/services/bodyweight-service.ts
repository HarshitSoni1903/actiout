import type { BodyweightEntry, WeightUnit } from '../domain/types';
import { ActiOutDB, db } from '../db/schema';
import { nowIso, todayLocalDate } from '../utils/dates';
import { newId } from '../utils/ids';
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

export async function deleteBodyweight(id: string, database: ActiOutDB = db): Promise<void> {
  await database.bodyweightEntries.delete(id);
  await logEvent('bodyweight', id, 'deleted', undefined, database);
}
