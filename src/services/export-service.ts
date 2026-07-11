import type {
  AppEvent,
  BodyweightEntry,
  ExerciseCatalogEntry,
  Preference,
  SessionItem,
  SessionRoutineLink,
  SessionSet,
} from '../domain/types';
import { ActiOutDB, db, type RoutineTemplateItemRow, type RoutineTemplateRow, type SessionRow } from '../db/schema';
import { nowIso } from '../utils/dates';
import { logEvent } from './events';
import { takeSnapshot } from './snapshot-service';

type RoutineTemplateDayRow = { id: string; routineTemplateId: string; weekday: number };
type SessionRoutineLinkRow = SessionRoutineLink & { sessionId: string };

export type ExportBundleV2 = {
  formatVersion: 2;
  exportedAt: string;
  preferences: Preference[];
  exerciseCatalog: ExerciseCatalogEntry[];
  routineTemplates: RoutineTemplateRow[];
  routineTemplateDays: RoutineTemplateDayRow[];
  routineTemplateItems: RoutineTemplateItemRow[];
  sessions: SessionRow[];
  sessionRoutineLinks: SessionRoutineLinkRow[];
  sessionItems: SessionItem[];
  sessionSets: SessionSet[];
  bodyweightEntries: BodyweightEntry[];
  appEvents: AppEvent[];
};

// Keys shared between ExportBundleV2's table arrays and ActiOutDB's table
// properties, in a fixed order used for validation, transaction enrollment,
// and the clear-then-bulkAdd import pass. `snapshots` is device-local and is
// deliberately excluded, so a pre-import snapshot survives the import clear.
const TABLE_FIELDS = [
  'preferences',
  'exerciseCatalog',
  'routineTemplates',
  'routineTemplateDays',
  'routineTemplateItems',
  'sessions',
  'sessionRoutineLinks',
  'sessionItems',
  'sessionSets',
  'bodyweightEntries',
  'appEvents',
] as const satisfies ReadonlyArray<keyof ExportBundleV2 & keyof ActiOutDB>;

export async function exportBundle(database: ActiOutDB = db): Promise<ExportBundleV2> {
  const [
    preferences,
    exerciseCatalog,
    routineTemplates,
    routineTemplateDays,
    routineTemplateItems,
    sessions,
    sessionRoutineLinks,
    sessionItems,
    sessionSets,
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
    database.sessionSets.toArray(),
    database.bodyweightEntries.toArray(),
    database.appEvents.toArray(),
  ]);

  return {
    formatVersion: 2,
    exportedAt: nowIso(),
    preferences,
    exerciseCatalog,
    routineTemplates,
    routineTemplateDays,
    routineTemplateItems,
    sessions,
    sessionRoutineLinks,
    sessionItems,
    sessionSets,
    bodyweightEntries,
    appEvents,
  };
}

export type ValidationResult = { ok: true; bundle: ExportBundleV2; summary: string } | { ok: false; reason: string };

type FieldCheck = (v: unknown) => boolean;
const isStr: FieldCheck = (v) => typeof v === 'string';
const isNum: FieldCheck = (v) => typeof v === 'number' && Number.isFinite(v);
const isBool: FieldCheck = (v) => typeof v === 'boolean';
const oneOf =
  (...allowed: readonly string[]): FieldCheck =>
  (v) =>
    typeof v === 'string' && allowed.includes(v);

type TableField = (typeof TABLE_FIELDS)[number];

// Child field -> parent table it must reference an existing id in. Only the
// carve-outs the C1 fix explicitly enforces (see export-service.test.ts and
// the final-review-fix brief) — sessionRoutineLinks.routineTemplateId and the
// optional exerciseCatalogId fields legitimately dangle (routines are
// hard-deleted while sessions keep name snapshots) and are deliberately NOT
// checked here.
type RefCheck = { field: string; parentTable: TableField };

type TableSpec = {
  fields: Record<string, FieldCheck>;
  refs: RefCheck[];
};

// Required fields per table, derived from src/domain/types.ts + src/db/schema.ts.
// Only required fields are validated; optional fields and unknown extra
// fields are tolerated.
const TABLE_SPECS: Record<TableField, TableSpec> = {
  preferences: {
    fields: {
      id: isStr,
      theme: oneOf('system', 'light', 'dark'),
      weightUnit: oneOf('lb', 'kg'),
      distanceUnit: oneOf('mi', 'km'),
      defaultDraftConflictAction: oneOf('ask', 'resume', 'close-and-start-new'),
    },
    refs: [],
  },
  exerciseCatalog: {
    fields: {
      id: isStr,
      canonicalName: isStr,
      normalizedName: isStr,
      isCustom: isBool,
      createdAt: isStr,
      updatedAt: isStr,
    },
    refs: [],
  },
  routineTemplates: {
    fields: {
      id: isStr,
      name: isStr,
      createdAt: isStr,
      updatedAt: isStr,
    },
    refs: [],
  },
  routineTemplateDays: {
    fields: {
      id: isStr,
      routineTemplateId: isStr,
      weekday: isNum,
    },
    refs: [{ field: 'routineTemplateId', parentTable: 'routineTemplates' }],
  },
  routineTemplateItems: {
    fields: {
      id: isStr,
      routineTemplateId: isStr,
      exerciseNameSnapshot: isStr,
      sequencePosition: isNum,
      createdAt: isStr,
      updatedAt: isStr,
    },
    refs: [{ field: 'routineTemplateId', parentTable: 'routineTemplates' }],
  },
  sessions: {
    fields: {
      id: isStr,
      sessionDate: isStr,
      status: oneOf('draft', 'completed', 'dnf'),
      sourceMode: oneOf('routine', 'quick'),
      createdAt: isStr,
      updatedAt: isStr,
    },
    refs: [],
  },
  sessionRoutineLinks: {
    fields: {
      id: isStr,
      sessionId: isStr,
      routineTemplateId: isStr,
      routineNameSnapshot: isStr,
      sourceSequence: isNum,
    },
    refs: [{ field: 'sessionId', parentTable: 'sessions' }],
  },
  sessionItems: {
    fields: {
      id: isStr,
      sessionId: isStr,
      exerciseNameSnapshot: isStr,
      sequencePosition: isNum,
      createdAt: isStr,
      updatedAt: isStr,
    },
    refs: [{ field: 'sessionId', parentTable: 'sessions' }],
  },
  // reps/weight are optional (unlogged sets) and deliberately NOT validated.
  // Both refs are required — a dangling sessionItemId must reject (no carve-out).
  sessionSets: {
    fields: {
      id: isStr,
      sessionId: isStr,
      sessionItemId: isStr,
      setNumber: isNum,
      weightUnit: oneOf('lb', 'kg'),
      isWarmup: isBool,
      completed: isBool,
      createdAt: isStr,
      updatedAt: isStr,
    },
    refs: [
      { field: 'sessionId', parentTable: 'sessions' },
      { field: 'sessionItemId', parentTable: 'sessionItems' },
    ],
  },
  bodyweightEntries: {
    fields: {
      id: isStr,
      entryDate: isStr,
      weightValue: isNum,
      weightUnit: oneOf('lb', 'kg'),
      createdAt: isStr,
      updatedAt: isStr,
    },
    refs: [],
  },
  appEvents: {
    fields: {
      id: isStr,
      entityType: isStr,
      entityId: isStr,
      eventType: isStr,
      payloadJson: isStr,
      occurredAt: isStr,
      createdAt: isStr,
    },
    refs: [],
  },
};

// Structural + row-shape + referential-integrity check: formatVersion === 2,
// all table fields present as arrays, every row is a well-formed object
// with its required fields, no duplicate primary keys within a table, and no
// child row referencing a parent id absent from the bundle. Runs entirely
// before importBundle touches the transaction, so a garbage bundle is
// rejected before any existing data is cleared.
export function validateBundle(data: unknown): ValidationResult {
  if (typeof data !== 'object' || data === null) {
    return { ok: false, reason: 'Bundle must be an object' };
  }

  const candidate = data as Record<string, unknown>;

  if (candidate.formatVersion !== 2) {
    return { ok: false, reason: `Unsupported formatVersion: ${JSON.stringify(candidate.formatVersion)} (expected 2)` };
  }

  for (const field of TABLE_FIELDS) {
    if (!Array.isArray(candidate[field])) {
      return { ok: false, reason: `Missing or invalid "${field}" field: expected an array` };
    }
  }

  // Row shape + duplicate-id checks, table by table. TABLE_FIELDS order also
  // guarantees each parent table (routineTemplates, sessions) is checked
  // before its children, so id sets are ready for the ref pass below.
  const idsByTable = new Map<TableField, Set<string>>();

  for (const table of TABLE_FIELDS) {
    const rows = candidate[table] as unknown[];
    const spec = TABLE_SPECS[table];
    const ids = new Set<string>();

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        return { ok: false, reason: `${table}[${i}] is not an object` };
      }
      const rowRecord = row as Record<string, unknown>;

      for (const [field, check] of Object.entries(spec.fields)) {
        if (!check(rowRecord[field])) {
          return { ok: false, reason: `${table}[${i}]: missing or invalid "${field}"` };
        }
      }

      const id = rowRecord.id as string;
      if (ids.has(id)) {
        return { ok: false, reason: `${table}: duplicate id "${id}"` };
      }
      ids.add(id);
    }

    idsByTable.set(table, ids);
  }

  for (const table of TABLE_FIELDS) {
    const rows = candidate[table] as Array<Record<string, unknown>>;
    const spec = TABLE_SPECS[table];

    for (const ref of spec.refs) {
      const parentIds = idsByTable.get(ref.parentTable) ?? new Set<string>();
      for (let i = 0; i < rows.length; i += 1) {
        const value = rows[i]![ref.field] as string;
        if (!parentIds.has(value)) {
          return {
            ok: false,
            reason: `${table}[${i}]: "${ref.field}" references unknown ${ref.parentTable} id "${value}"`,
          };
        }
      }
    }
  }

  const bundle = candidate as unknown as ExportBundleV2;
  const summary = `${bundle.routineTemplates.length} routines, ${bundle.sessions.length} sessions, ${bundle.bodyweightEntries.length} bodyweight entries`;

  return { ok: true, bundle, summary };
}

// Re-validates (cheap insurance for callers that skip validateBundle, e.g.
// importBundle is reachable directly via the dev window.__actiout hook), then
// runs one rw transaction spanning all 10 tables: clears each, then bulkAdds
// the bundle's rows. If any bulkAdd throws (e.g. duplicate primary keys
// within an array not otherwise caught by validateBundle), Dexie rolls back
// the entire transaction, so prior data is left intact. The 'import' event is
// logged only after the transaction commits, so a failed import never logs
// anything.
export async function importBundle(bundle: ExportBundleV2, database: ActiOutDB = db): Promise<void> {
  // (1) Validate before touching anything — a garbage bundle must be rejected
  // before any snapshot or clear happens.
  const result = validateBundle(bundle);
  if (!result.ok) {
    throw new Error(result.reason);
  }

  // (2) Capture a pre-import snapshot. `snapshots` is not in TABLE_FIELDS, so
  // it survives the clear pass below and remains available for restore.
  await takeSnapshot('pre-import', database);

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
