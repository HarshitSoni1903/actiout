import { normalizeExerciseName } from '../services/exercise-service';
import { nowIso } from '../utils/dates';
import { newId } from '../utils/ids';
import { ActiOutDB, db } from './schema';

export const STARTER_EXERCISES: ReadonlyArray<{ name: string; category: string }> = [
  // chest
  { name: 'Bench Press', category: 'chest' },
  { name: 'Incline Bench Press', category: 'chest' },
  { name: 'Decline Bench Press', category: 'chest' },
  { name: 'Incline Dumbbell Press', category: 'chest' },
  { name: 'Dumbbell Fly', category: 'chest' },
  { name: 'Push Up', category: 'chest' },
  // back
  { name: 'Deadlift', category: 'back' },
  { name: 'Barbell Row', category: 'back' },
  { name: 'Pull Up', category: 'back' },
  { name: 'Chin Up', category: 'back' },
  { name: 'Lat Pulldown', category: 'back' },
  { name: 'Seated Cable Row', category: 'back' },
  { name: 'T-Bar Row', category: 'back' },
  // legs
  { name: 'Squat', category: 'legs' },
  { name: 'Front Squat', category: 'legs' },
  { name: 'Romanian Deadlift', category: 'legs' },
  { name: 'Leg Press', category: 'legs' },
  { name: 'Leg Curl', category: 'legs' },
  { name: 'Leg Extension', category: 'legs' },
  { name: 'Lunge', category: 'legs' },
  { name: 'Calf Raise', category: 'legs' },
  // shoulders
  { name: 'Overhead Press', category: 'shoulders' },
  { name: 'Arnold Press', category: 'shoulders' },
  { name: 'Lateral Raise', category: 'shoulders' },
  { name: 'Front Raise', category: 'shoulders' },
  { name: 'Face Pull', category: 'shoulders' },
  // arms
  { name: 'Bicep Curl', category: 'arms' },
  { name: 'Hammer Curl', category: 'arms' },
  { name: 'Tricep Pushdown', category: 'arms' },
  { name: 'Skull Crusher', category: 'arms' },
  { name: 'Tricep Dip', category: 'arms' },
  { name: 'Preacher Curl', category: 'arms' },
  // core
  { name: 'Plank', category: 'core' },
  { name: 'Crunch', category: 'core' },
  { name: 'Russian Twist', category: 'core' },
  { name: 'Hanging Leg Raise', category: 'core' },
  { name: 'Sit Up', category: 'core' },
  // cardio
  { name: 'Treadmill Run', category: 'cardio' },
  { name: 'Cycling', category: 'cardio' },
  { name: 'Rowing Machine', category: 'cardio' },
];

// Idempotent: safe to call on every app start. Detects prior seeding via the
// 'default' preference row and skips re-seeding entirely if present.
export async function initializeDb(database: ActiOutDB = db): Promise<void> {
  const alreadySeeded = await database.preferences.get('default');
  if (alreadySeeded) {
    return;
  }

  const now = nowIso();

  await database.transaction('rw', database.preferences, database.exerciseCatalog, async () => {
    await database.preferences.add({
      id: 'default',
      theme: 'system',
      weightUnit: 'lb',
      distanceUnit: 'mi',
      defaultDraftConflictAction: 'ask',
      confirmBeforeReplacingDraft: true,
    });

    await database.exerciseCatalog.bulkAdd(
      STARTER_EXERCISES.map((entry) => ({
        id: newId(),
        canonicalName: entry.name,
        normalizedName: normalizeExerciseName(entry.name),
        category: entry.category,
        isCustom: false,
        createdAt: now,
        updatedAt: now,
      }))
    );
  });
}
