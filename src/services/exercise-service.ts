import type { ExerciseCatalogEntry } from '../domain/types';
import { ActiOutDB, db } from '../db/schema';
import { nowIso } from '../utils/dates';
import { newId } from '../utils/ids';

const DEFAULT_SEARCH_LIMIT = 8;

// Canonical normalization: trim, collapse internal whitespace runs to a
// single space, lowercase. Used as the uniqueness key for the exercise
// catalog (see `exerciseCatalog: 'id, &normalizedName'` in schema.ts).
export function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Prefix matches on normalizedName rank first, then substring matches
// elsewhere in the name. Empty (or whitespace-only) query short-circuits to [].
export async function searchExercises(
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
  database: ActiOutDB = db
): Promise<ExerciseCatalogEntry[]> {
  const normalizedQuery = normalizeExerciseName(query);
  if (normalizedQuery === '') {
    return [];
  }

  const all = await database.exerciseCatalog.toArray();
  const prefixMatches: ExerciseCatalogEntry[] = [];
  const substringMatches: ExerciseCatalogEntry[] = [];

  for (const entry of all) {
    if (entry.normalizedName.startsWith(normalizedQuery)) {
      prefixMatches.push(entry);
    } else if (entry.normalizedName.includes(normalizedQuery)) {
      substringMatches.push(entry);
    }
  }

  return [...prefixMatches, ...substringMatches].slice(0, limit);
}

// Finds an existing catalog entry by normalizedName; creates a new
// isCustom:true entry otherwise. Idempotent and safe under concurrent calls
// (e.g. a UI double-tap): if two overlapping calls both miss the lookup, the
// &normalizedName unique index rejects the losing add; we catch that and
// return the winning row instead of propagating the ConstraintError.
export async function ensureExercise(name: string, database: ActiOutDB = db): Promise<ExerciseCatalogEntry> {
  const normalizedName = normalizeExerciseName(name);
  if (normalizedName === '') {
    throw new Error('ensureExercise: name must not be empty or whitespace-only');
  }

  const existing = await database.exerciseCatalog.where('normalizedName').equals(normalizedName).first();
  if (existing) {
    return existing;
  }

  const now = nowIso();
  const entry: ExerciseCatalogEntry = {
    id: newId(),
    canonicalName: name.trim().replace(/\s+/g, ' '),
    normalizedName,
    isCustom: true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await database.exerciseCatalog.add(entry);
    return entry;
  } catch (error) {
    // Lost a check-then-write race: another call inserted the same
    // normalizedName between our lookup and add. Return the winner.
    const winner = await database.exerciseCatalog.where('normalizedName').equals(normalizedName).first();
    if (winner) {
      return winner;
    }
    throw error;
  }
}
