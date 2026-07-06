import type {
  AppEvent,
  BodyweightEntry,
  ExerciseCatalogEntry,
  Preference,
  SessionItem,
  SessionRoutineLink,
} from '../domain/types';
import { ActiOutDB, db, type RoutineTemplateItemRow, type RoutineTemplateRow, type SessionRow } from '../db/schema';
import { nowIso } from '../utils/dates';
import { logEvent } from './events';

type RoutineTemplateDayRow = { id: string; routineTemplateId: string; weekday: number };
type SessionRoutineLinkRow = SessionRoutineLink & { sessionId: string };

export type ExportBundleV1 = {
  formatVersion: 1;
  exportedAt: string;
  preferences: Preference[];
  exerciseCatalog: ExerciseCatalogEntry[];
  routineTemplates: RoutineTemplateRow[];
  routineTemplateDays: RoutineTemplateDayRow[];
  routineTemplateItems: RoutineTemplateItemRow[];
  sessions: SessionRow[];
  sessionRoutineLinks: SessionRoutineLinkRow[];
  sessionItems: SessionItem[];
  bodyweightEntries: BodyweightEntry[];
  appEvents: AppEvent[];
};

// Keys shared between ExportBundleV1's table arrays and ActiOutDB's table
// properties, in a fixed order used for validation, transaction enrollment,
// and the clear-then-bulkAdd import pass.
const TABLE_FIELDS = [
  'preferences',
  'exerciseCatalog',
  'routineTemplates',
  'routineTemplateDays',
  'routineTemplateItems',
  'sessions',
  'sessionRoutineLinks',
  'sessionItems',
  'bodyweightEntries',
  'appEvents',
] as const satisfies ReadonlyArray<keyof ExportBundleV1 & keyof ActiOutDB>;

export async function exportBundle(database: ActiOutDB = db): Promise<ExportBundleV1> {
  const [
    preferences,
    exerciseCatalog,
    routineTemplates,
    routineTemplateDays,
    routineTemplateItems,
    sessions,
    sessionRoutineLinks,
    sessionItems,
    bodyweightEntries,
    appEvents,
  ] = await Promise.all([
    database.preferences.toArray(),
    database.exerciseCatalog.toArray(),
    database.routineTemplates.toArray(),
    database.routineTemplateDays.toArray(),
    database.routineTemplateItems.toArray(),
    database.sessions.toArray(),
    database.sessionRoutineLinks.toArray(),
    database.sessionItems.toArray(),
    database.bodyweightEntries.toArray(),
    database.appEvents.toArray(),
  ]);

  return {
    formatVersion: 1,
    exportedAt: nowIso(),
    preferences,
    exerciseCatalog,
    routineTemplates,
    routineTemplateDays,
    routineTemplateItems,
    sessions,
    sessionRoutineLinks,
    sessionItems,
    bodyweightEntries,
    appEvents,
  };
}

export type ValidationResult = { ok: true; bundle: ExportBundleV1; summary: string } | { ok: false; reason: string };

// Pure/synchronous structural check: formatVersion === 1, then all 10 table
// fields present as arrays. Does not inspect row shapes beyond that.
export function validateBundle(data: unknown): ValidationResult {
  if (typeof data !== 'object' || data === null) {
    return { ok: false, reason: 'Bundle must be an object' };
  }

  const candidate = data as Record<string, unknown>;

  if (candidate.formatVersion !== 1) {
    return { ok: false, reason: `Unsupported formatVersion: ${JSON.stringify(candidate.formatVersion)} (expected 1)` };
  }

  for (const field of TABLE_FIELDS) {
    if (!Array.isArray(candidate[field])) {
      return { ok: false, reason: `Missing or invalid "${field}" field: expected an array` };
    }
  }

  const bundle = candidate as unknown as ExportBundleV1;
  const summary = `${bundle.routineTemplates.length} routines, ${bundle.sessions.length} sessions, ${bundle.bodyweightEntries.length} bodyweight entries`;

  return { ok: true, bundle, summary };
}

// One rw transaction spanning all 10 tables: clears each, then bulkAdds the
// bundle's rows. If any bulkAdd throws (e.g. duplicate primary keys within an
// array), Dexie rolls back the entire transaction, so prior data is left
// intact. The 'import' event is logged only after the transaction commits,
// so a failed import never logs anything.
export async function importBundle(bundle: ExportBundleV1, database: ActiOutDB = db): Promise<void> {
  const tables = TABLE_FIELDS.map((field) => database[field]);

  await database.transaction('rw', tables, async () => {
    for (const field of TABLE_FIELDS) {
      await database[field].clear();
    }
    for (const field of TABLE_FIELDS) {
      const rows = bundle[field];
      if (rows.length > 0) {
        await (database[field] as { bulkAdd: (items: readonly unknown[]) => Promise<unknown> }).bulkAdd(rows);
      }
    }
  });

  await logEvent('app', 'app', 'import', undefined, database);
}
