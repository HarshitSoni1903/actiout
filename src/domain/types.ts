// Domain shapes — copied from 04_types_and_events.md "TypeScript domain shapes",
// with the deltas specified in the Task 1 brief:
//   - RoutineTemplateItem gains optional `defaultWeightUnit?: WeightUnit` (D2)
//   - SessionItem gains required `weightUnit: WeightUnit`, always stamped (D2)
//   - ExerciseCatalogEntry gains `createdAt`/`updatedAt`
//   - AppEvent added for the future sync abstraction
//   - v2 (Task A1): per-set logging via SessionSet; SessionItem slimmed to
//     planning fields only (setsActual/repsActual/weightActual/weightUnit/
//     completed moved to SessionSet); Snapshot added for backup/restore.

export type WeightUnit = 'lb' | 'kg';
export type SessionStatus = 'draft' | 'completed' | 'dnf';
export type DraftConflictAction = 'ask' | 'resume' | 'close-and-start-new';
// basic = one entry per exercise; advanced = log each set individually.
export type LoggingMode = 'basic' | 'advanced';
// What a given exercise records: straight weight+reps, bodyweight reps only,
// a held/timed duration, or a distance covered over a duration.
export type MeasurementType = 'weight_reps' | 'reps' | 'duration' | 'distance_duration';
export type ExerciseCategory =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'cardio'
  | 'other';

export type Preference = {
  id: string;
  theme: 'system' | 'light' | 'dark';
  weightUnit: WeightUnit;
  distanceUnit: 'mi' | 'km';
  defaultDraftConflictAction: DraftConflictAction;
  // Optional: preference rows created before this field existed lack it;
  // readers fall back to 'basic'.
  loggingMode?: LoggingMode;
};

export type ExerciseCatalogEntry = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  category?: ExerciseCategory;
  measurementType?: MeasurementType;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RoutineTemplate = {
  id: string;
  name: string;
  category?: string;
  notes?: string;
  // 'HH:MM' 24h local; absent = all-day (no fixed time)
  timeOfDay?: string;
  defaultSets?: number;
  defaultReps?: number;
  daysOfWeek: number[];
  items: RoutineTemplateItem[];
  createdAt: string;
  updatedAt: string;
};

export type RoutineTemplateItem = {
  id: string;
  exerciseCatalogId?: string;
  exerciseNameSnapshot: string;
  sequencePosition: number;
  defaultSets?: number;
  defaultReps?: number;
  defaultWeight?: number;
  defaultWeightUnit?: WeightUnit;
  // planned duration for timed exercises (e.g. plank); placeholder, no UI yet
  defaultDurationSeconds?: number;
  restSeconds?: number;
  notes?: string;
  measurementType?: MeasurementType;
};

export type Session = {
  id: string;
  sessionDate: string;
  status: SessionStatus;
  sourceMode: 'routine' | 'quick';
  notes?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  routineLinks: SessionRoutineLink[];
  items: SessionItem[];
  createdAt: string;
  updatedAt: string;
};

export type SessionRoutineLink = {
  id: string;
  routineTemplateId: string;
  routineNameSnapshot: string;
  sourceSequence: number;
};

export type SessionItem = {
  id: string;
  sessionId: string;
  sessionRoutineLinkId?: string;
  exerciseCatalogId?: string;
  exerciseNameSnapshot: string;
  sequencePosition: number;
  setsPlanned?: number;
  repsPlanned?: number;
  restSeconds?: number;
  notes?: string;
  fatigueGroup?: string;
  // stamped on first tap-to-activate; absent while queued
  activatedAt?: string;
  // per-exercise DNF; toggled independently of session-level status
  dnfAt?: string;
  measurementTypeSnapshot?: MeasurementType;
  createdAt: string;
  updatedAt: string;
};

export type SessionSet = {
  id: string;
  sessionId: string;
  sessionItemId: string;
  setNumber: number;
  reps?: number;
  weight?: number;
  // actual recorded duration for timed exercises; placeholder, timer UI pending
  durationSeconds?: number;
  distance?: number;
  distanceUnit?: 'mi' | 'km';
  weightUnit: WeightUnit;
  isWarmup: boolean;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BodyweightEntry = {
  id: string;
  entryDate: string;
  weightValue: number;
  weightUnit: WeightUnit;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type AppEvent = {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  payloadJson: string;
  occurredAt: string;
  createdAt: string;
};

export type SnapshotReason = 'pre-import' | 'pre-restore' | 'pre-sync' | 'manual';

export type Snapshot = {
  id: string;
  createdAt: string;
  reason: SnapshotReason;
  summary: string;
  bundleJson: string;
};
