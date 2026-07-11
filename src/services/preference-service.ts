import type { Preference } from '../domain/types';
import { ActiOutDB, db } from '../db/schema';

const PREFERENCE_ID = 'default';

const DEFAULT_PREFERENCES: Preference = {
  id: PREFERENCE_ID,
  theme: 'system',
  weightUnit: 'lb',
  distanceUnit: 'mi',
  defaultDraftConflictAction: 'ask',
};

// Returns the singleton preference row, creating it with spec defaults if
// it doesn't exist yet (e.g. in tests that don't run initializeDb first).
// Safe under concurrent calls: if two overlapping calls both miss the get,
// the duplicate 'default' primary key rejects the losing add; we catch that
// and return the winning row instead of propagating the ConstraintError.
export async function getPreferences(database: ActiOutDB = db): Promise<Preference> {
  const existing = await database.preferences.get(PREFERENCE_ID);
  if (existing) {
    return existing;
  }

  try {
    await database.preferences.add(DEFAULT_PREFERENCES);
    return DEFAULT_PREFERENCES;
  } catch (error) {
    // Lost a check-then-write race: another call created the singleton
    // between our get and add. Return the winner.
    const winner = await database.preferences.get(PREFERENCE_ID);
    if (winner) {
      return winner;
    }
    throw error;
  }
}

// Applies a partial patch to the singleton preference row (creating it with
// defaults first if missing) and returns the updated record.
export async function updatePreferences(
  patch: Partial<Omit<Preference, 'id'>>,
  database: ActiOutDB = db
): Promise<Preference> {
  const current = await getPreferences(database);
  const updated: Preference = { ...current, ...patch, id: PREFERENCE_ID };

  await database.preferences.put(updated);
  return updated;
}
