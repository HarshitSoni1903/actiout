import type { ExerciseCatalogEntry, ExerciseCategory, MeasurementType } from '../domain/types';
import { ActiOutDB, db } from '../db/schema';
import { newId, normalizeExerciseName, nowIso } from '../utils';

const DEFAULT_SEARCH_LIMIT = 8;

export const DEFAULT_MEASUREMENT_TYPE: MeasurementType = 'weight_reps';

// Falls back to DEFAULT_MEASUREMENT_TYPE when an exercise (catalog entry,
// routine item, session item) predates the measurement-type field.
export function resolveMeasurementType(t: MeasurementType | undefined): MeasurementType {
  return t ?? DEFAULT_MEASUREMENT_TYPE;
}

export type EnsureExerciseOptions = {
  measurementType?: MeasurementType;
  category?: ExerciseCategory;
};

// Used as the uniqueness key for the exercise catalog (see
// `exerciseCatalog: 'id, &normalizedName'` in schema.ts). Implementation
// lives in utils/index.ts (zero-dependency) so it can also be imported by
// Dexie-free logic modules; re-exported here so existing callers importing
// it from this service module are unaffected.
export { normalizeExerciseName };

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

// Full catalog listing (mirrors searchExercises' own toArray() approach —
// the catalog is expected to stay small). Used where a caller needs an
// authoritative, un-truncated view rather than searchExercises' ranked and
// limited suggestions — e.g. the typeahead's existing-vs-new-exercise check,
// which must not be fooled by a debounce lag or an exact match ranked
// outside a search's limit.
export async function listExercises(database: ActiOutDB = db): Promise<ExerciseCatalogEntry[]> {
  return database.exerciseCatalog.toArray();
}

// Finds an existing catalog entry by normalizedName; creates a new
// isCustom:true entry otherwise. Idempotent and safe under concurrent calls
// (e.g. a UI double-tap): if two overlapping calls both miss the lookup, the
// &normalizedName unique index rejects the losing add; we catch that and
// return the winning row instead of propagating the ConstraintError.
// `opts` only applies when creating a new entry; an existing entry's type
// wins and opts are ignored.
export async function ensureExercise(
  name: string,
  opts?: EnsureExerciseOptions,
  database: ActiOutDB = db
): Promise<ExerciseCatalogEntry> {
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
    category: opts?.category,
    measurementType: opts?.measurementType ?? DEFAULT_MEASUREMENT_TYPE,
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
