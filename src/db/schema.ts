import Dexie, { type Table } from 'dexie';
import type {
  AppEvent,
  BodyweightEntry,
  ExerciseCatalogEntry,
  Preference,
  RoutineTemplate,
  RoutineTemplateItem,
  Session,
  SessionItem,
  SessionRoutineLink,
} from '../domain/types';

export type RoutineTemplateRow = Omit<RoutineTemplate, 'items' | 'daysOfWeek'> & { isArchived: boolean };
export type RoutineTemplateItemRow = RoutineTemplateItem & {
  routineTemplateId: string;
  createdAt: string;
  updatedAt: string;
};
export type SessionRow = Omit<Session, 'items' | 'routineLinks'>;

export class ActiOutDB extends Dexie {
  preferences!: Table<Preference, string>;
  exerciseCatalog!: Table<ExerciseCatalogEntry, string>;
  routineTemplates!: Table<RoutineTemplateRow, string>;
  routineTemplateDays!: Table<{ id: string; routineTemplateId: string; weekday: number }, string>;
  routineTemplateItems!: Table<RoutineTemplateItemRow, string>;
  sessions!: Table<SessionRow, string>;
  sessionRoutineLinks!: Table<SessionRoutineLink & { sessionId: string }, string>;
  sessionItems!: Table<SessionItem, string>;
  bodyweightEntries!: Table<BodyweightEntry, string>;
  appEvents!: Table<AppEvent, string>;

  constructor(name: string = 'actiout') {
    super(name);
    this.version(1).stores({
      preferences: 'id',
      exerciseCatalog: 'id, &normalizedName',
      routineTemplates: 'id, isArchived',
      routineTemplateDays: 'id, routineTemplateId, &[routineTemplateId+weekday]',
      routineTemplateItems: 'id, routineTemplateId, [routineTemplateId+sequencePosition]',
      sessions: 'id, sessionDate, status',
      sessionRoutineLinks: 'id, sessionId',
      sessionItems: 'id, sessionId, exerciseCatalogId, [sessionId+sequencePosition]',
      bodyweightEntries: 'id, entryDate',
      appEvents: 'id, occurredAt, [entityType+entityId]',
    });
  }
}

export const db = new ActiOutDB();
