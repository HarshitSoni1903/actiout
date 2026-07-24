import type { ExerciseCategory, MeasurementType } from '../domain/types';
import { normalizeExerciseName } from '../services/exercise-service';
import { newId, nowIso } from '../utils';
import { ActiOutDB, db } from './schema';

export const STARTER_EXERCISES: ReadonlyArray<{
  name: string;
  category: ExerciseCategory;
  measurementType: MeasurementType;
}> = [
  // chest
  { name: 'Bench Press', category: 'chest', measurementType: 'weight_reps' },
  { name: 'Incline Bench Press', category: 'chest', measurementType: 'weight_reps' },
  { name: 'Decline Bench Press', category: 'chest', measurementType: 'weight_reps' },
  { name: 'Incline Dumbbell Press', category: 'chest', measurementType: 'weight_reps' },
  { name: 'Dumbbell Fly', category: 'chest', measurementType: 'weight_reps' },
  { name: 'Push Up', category: 'chest', measurementType: 'reps' },
  // back
  { name: 'Deadlift', category: 'back', measurementType: 'weight_reps' },
  { name: 'Barbell Row', category: 'back', measurementType: 'weight_reps' },
  { name: 'Pull Up', category: 'back', measurementType: 'reps' },
  { name: 'Chin Up', category: 'back', measurementType: 'reps' },
  { name: 'Lat Pulldown', category: 'back', measurementType: 'weight_reps' },
  { name: 'Seated Cable Row', category: 'back', measurementType: 'weight_reps' },
  { name: 'T-Bar Row', category: 'back', measurementType: 'weight_reps' },
  // legs
  { name: 'Squat', category: 'legs', measurementType: 'weight_reps' },
  { name: 'Front Squat', category: 'legs', measurementType: 'weight_reps' },
  { name: 'Romanian Deadlift', category: 'legs', measurementType: 'weight_reps' },
  { name: 'Leg Press', category: 'legs', measurementType: 'weight_reps' },
  { name: 'Leg Curl', category: 'legs', measurementType: 'weight_reps' },
  { name: 'Leg Extension', category: 'legs', measurementType: 'weight_reps' },
  { name: 'Lunge', category: 'legs', measurementType: 'weight_reps' },
  { name: 'Calf Raise', category: 'legs', measurementType: 'weight_reps' },
  // shoulders
  { name: 'Overhead Press', category: 'shoulders', measurementType: 'weight_reps' },
  { name: 'Arnold Press', category: 'shoulders', measurementType: 'weight_reps' },
  { name: 'Lateral Raise', category: 'shoulders', measurementType: 'weight_reps' },
  { name: 'Front Raise', category: 'shoulders', measurementType: 'weight_reps' },
  { name: 'Face Pull', category: 'shoulders', measurementType: 'weight_reps' },
  // arms
  { name: 'Bicep Curl', category: 'arms', measurementType: 'weight_reps' },
  { name: 'Hammer Curl', category: 'arms', measurementType: 'weight_reps' },
  { name: 'Tricep Pushdown', category: 'arms', measurementType: 'weight_reps' },
  { name: 'Skull Crusher', category: 'arms', measurementType: 'weight_reps' },
  { name: 'Tricep Dip', category: 'arms', measurementType: 'reps' },
  { name: 'Preacher Curl', category: 'arms', measurementType: 'weight_reps' },
  // core
  { name: 'Plank', category: 'core', measurementType: 'duration' },
  { name: 'Crunch', category: 'core', measurementType: 'reps' },
  { name: 'Russian Twist', category: 'core', measurementType: 'reps' },
  { name: 'Hanging Leg Raise', category: 'core', measurementType: 'reps' },
  { name: 'Sit Up', category: 'core', measurementType: 'reps' },
  // cardio
  { name: 'Treadmill Run', category: 'cardio', measurementType: 'distance_duration' },
  { name: 'Cycling', category: 'cardio', measurementType: 'distance_duration' },
  { name: 'Rowing Machine', category: 'cardio', measurementType: 'distance_duration' },
];

// Idempotent: safe to call on every app start. Detects prior seeding via the
// 'default' preference row and skips re-seeding entirely if present.
// Concurrency-safe: if two overlapping calls (e.g. two tabs both launching
// cold) both miss the initial get, the duplicate 'default' primary key (and,
// separately, the &normalizedName unique index on the catalog bulkAdd)
// rejects the losing writer with a ConstraintError. We catch that and treat
// it as "another caller already seeded" rather than propagating it — same
// idiom as getPreferences (preference-service.ts) and ensureExercise
// (exercise-service.ts). Deliberately uses `add`, never `put`, so a
// concurrent double-seed can never overwrite a user's real preferences.
export async function initializeDb(database: ActiOutDB = db): Promise<void> {
  const alreadySeeded = await database.preferences.get('default');
  if (alreadySeeded) {
    return;
  }

  const now = nowIso();

  try {
    await database.transaction('rw', database.preferences, database.exerciseCatalog, async () => {
      await database.preferences.add({
        id: 'default',
        theme: 'system',
        weightUnit: 'lb',
        distanceUnit: 'mi',
        defaultDraftConflictAction: 'ask',
        loggingMode: 'basic',
      });

      await database.exerciseCatalog.bulkAdd(
        STARTER_EXERCISES.map((entry) => ({
          id: newId(),
          canonicalName: entry.name,
          normalizedName: normalizeExerciseName(entry.name),
          category: entry.category,
          measurementType: entry.measurementType,
          isCustom: false,
          createdAt: now,
          updatedAt: now,
        }))
      );
    });
  } catch (error) {
    // Lost a check-then-write race: another call seeded between our get and
    // this transaction. Confirm the winner actually landed before swallowing
    // the error; otherwise rethrow (a genuine failure, not a race).
    const winner = await database.preferences.get('default');
    if (!winner) {
      throw error;
    }
  }
}
