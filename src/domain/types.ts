// Domain shapes — copied from 04_types_and_events.md "TypeScript domain shapes",
// with the deltas specified in the Task 1 brief:
//   - RoutineTemplateItem gains optional `defaultWeightUnit?: WeightUnit` (D2)
//   - SessionItem gains required `weightUnit: WeightUnit`, always stamped (D2)
//   - ExerciseCatalogEntry gains `createdAt`/`updatedAt`
//   - AppEvent added for the future sync abstraction

export type WeightUnit = 'lb' | 'kg';
export type SessionStatus = 'draft' | 'completed' | 'dnf';
export type DraftConflictAction = 'ask' | 'resume' | 'close-and-start-new';

export type Preference = {
  id: string;
  theme: 'system' | 'light' | 'dark';
  weightUnit: WeightUnit;
  distanceUnit: 'mi' | 'km';
  defaultDraftConflictAction: DraftConflictAction;
  confirmBeforeReplacingDraft: boolean;
};

export type ExerciseCatalogEntry = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  category?: string;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RoutineTemplate = {
  id: string;
  name: string;
  category?: string;
  notes?: string;
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
  restSeconds?: number;
  notes?: string;
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
  setsActual?: number;
  repsActual?: number;
  weightActual?: number;
  weightUnit: WeightUnit;
  completed: boolean;
  notes?: string;
  fatigueGroup?: string;
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
