import type { RoutineTemplate, RoutineTemplateItem, WeightUnit } from '../domain/types';
import { ActiOutDB, db } from '../db/schema';
import { nowIso } from '../utils/dates';
import { newId } from '../utils/ids';
import { ensureExercise } from './exercise-service';
import { getPreferences } from './preference-service';
import { logEvent } from './events';

export type RoutineItemInput = {
  exerciseName: string;
  defaultSets?: number;
  defaultReps?: number;
  defaultWeight?: number;
  defaultWeightUnit?: WeightUnit;
  restSeconds?: number;
  notes?: string;
};

export type RoutineInput = {
  name: string;
  category?: string;
  notes?: string;
  defaultSets?: number;
  defaultReps?: number;
  daysOfWeek: number[];
  items: RoutineItemInput[];
};

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new Error('RoutineInput: name must not be empty or whitespace-only');
  }
  return trimmed;
}

// Validates each value is an integer 0-6 (0 = Sunday, matching Date#getDay())
// and dedupes, preserving first-seen order.
function normalizeDaysOfWeek(daysOfWeek: number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const day of daysOfWeek) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error(`RoutineInput: daysOfWeek values must be integers 0-6, got ${day}`);
    }
    if (!seen.has(day)) {
      seen.add(day);
      result.push(day);
    }
  }
  return result;
}

// Resolves each item's exercise against the catalog (creating custom entries
// as needed) and builds the persisted item rows, positions 1..n from input
// order. `defaultWeightUnit` defaults to the current preference's weightUnit
// when `defaultWeight` is set and no explicit unit was given.
async function buildItemRows(
  routineTemplateId: string,
  items: RoutineItemInput[],
  now: string,
  database: ActiOutDB
): Promise<Array<RoutineTemplateItem & { routineTemplateId: string; createdAt: string; updatedAt: string }>> {
  const preference = await getPreferences(database);

  const rows: Array<RoutineTemplateItem & { routineTemplateId: string; createdAt: string; updatedAt: string }> = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as RoutineItemInput;
    const catalogEntry = await ensureExercise(item.exerciseName, database);
    const defaultWeightUnit =
      item.defaultWeight !== undefined ? item.defaultWeightUnit ?? preference.weightUnit : item.defaultWeightUnit;

    rows.push({
      id: newId(),
      routineTemplateId,
      exerciseCatalogId: catalogEntry.id,
      exerciseNameSnapshot: catalogEntry.canonicalName,
      sequencePosition: index + 1,
      defaultSets: item.defaultSets,
      defaultReps: item.defaultReps,
      defaultWeight: item.defaultWeight,
      defaultWeightUnit,
      restSeconds: item.restSeconds,
      notes: item.notes,
      createdAt: now,
      updatedAt: now,
    });
  }
  return rows;
}

async function hydrate(
  templateId: string,
  database: ActiOutDB
): Promise<RoutineTemplate | undefined> {
  const templateRow = await database.routineTemplates.get(templateId);
  if (!templateRow) {
    return undefined;
  }

  const [dayRows, itemRows] = await Promise.all([
    database.routineTemplateDays.where('routineTemplateId').equals(templateId).toArray(),
    database.routineTemplateItems.where('routineTemplateId').equals(templateId).toArray(),
  ]);

  const items = itemRows
    .slice()
    .sort((a, b) => a.sequencePosition - b.sequencePosition)
    .map((row): RoutineTemplateItem => ({
      id: row.id,
      exerciseCatalogId: row.exerciseCatalogId,
      exerciseNameSnapshot: row.exerciseNameSnapshot,
      sequencePosition: row.sequencePosition,
      defaultSets: row.defaultSets,
      defaultReps: row.defaultReps,
      defaultWeight: row.defaultWeight,
      defaultWeightUnit: row.defaultWeightUnit,
      restSeconds: row.restSeconds,
      notes: row.notes,
    }));

  return {
    id: templateRow.id,
    name: templateRow.name,
    category: templateRow.category,
    notes: templateRow.notes,
    defaultSets: templateRow.defaultSets,
    defaultReps: templateRow.defaultReps,
    createdAt: templateRow.createdAt,
    updatedAt: templateRow.updatedAt,
    daysOfWeek: dayRows.map((d) => d.weekday).sort((a, b) => a - b),
    items,
  };
}

export async function createRoutine(input: RoutineInput, database: ActiOutDB = db): Promise<RoutineTemplate> {
  const name = validateName(input.name);
  const daysOfWeek = normalizeDaysOfWeek(input.daysOfWeek);

  const id = newId();
  const now = nowIso();

  const itemRows = await buildItemRows(id, input.items, now, database);

  await database.transaction(
    'rw',
    database.routineTemplates,
    database.routineTemplateDays,
    database.routineTemplateItems,
    database.appEvents,
    async () => {
      await database.routineTemplates.add({
        id,
        name,
        category: input.category,
        notes: input.notes,
        defaultSets: input.defaultSets,
        defaultReps: input.defaultReps,
        createdAt: now,
        updatedAt: now,
      });

      await database.routineTemplateDays.bulkAdd(
        daysOfWeek.map((weekday) => ({ id: newId(), routineTemplateId: id, weekday }))
      );

      await database.routineTemplateItems.bulkAdd(itemRows);

      await logEvent('routine', id, 'created', { name, itemCount: itemRows.length }, database);
    }
  );

  const created = await hydrate(id, database);
  if (!created) {
    throw new Error(`createRoutine: failed to hydrate newly created routine ${id}`);
  }
  return created;
}

export async function updateRoutine(
  id: string,
  input: RoutineInput,
  database: ActiOutDB = db
): Promise<RoutineTemplate> {
  const existing = await database.routineTemplates.get(id);
  if (!existing) {
    throw new Error(`updateRoutine: routine ${id} does not exist`);
  }

  const name = validateName(input.name);
  const daysOfWeek = normalizeDaysOfWeek(input.daysOfWeek);
  const now = nowIso();

  const itemRows = await buildItemRows(id, input.items, now, database);

  await database.transaction(
    'rw',
    database.routineTemplates,
    database.routineTemplateDays,
    database.routineTemplateItems,
    database.appEvents,
    async () => {
      await database.routineTemplates.put({
        id,
        name,
        category: input.category,
        notes: input.notes,
        defaultSets: input.defaultSets,
        defaultReps: input.defaultReps,
        createdAt: existing.createdAt,
        updatedAt: now,
      });

      await database.routineTemplateDays.where('routineTemplateId').equals(id).delete();
      await database.routineTemplateDays.bulkAdd(
        daysOfWeek.map((weekday) => ({ id: newId(), routineTemplateId: id, weekday }))
      );

      await database.routineTemplateItems.where('routineTemplateId').equals(id).delete();
      await database.routineTemplateItems.bulkAdd(itemRows);

      await logEvent('routine', id, 'updated', { name, itemCount: itemRows.length }, database);
    }
  );

  const updated = await hydrate(id, database);
  if (!updated) {
    throw new Error(`updateRoutine: failed to hydrate updated routine ${id}`);
  }
  return updated;
}

// Hard delete: removes the template, its days, and its items. Sessions (and
// their snapshots) are untouched, and the exercise catalog is never modified.
// A missing id is a silent no-op (does not throw) and, per M1, logs no event
// — Dexie's own `.delete()` is a no-op on a missing key, so without this
// existence check a double-clicked delete button (or any delete of an
// already-gone id) would emit a phantom 'deleted' event for an entity that
// never existed.
export async function deleteRoutine(id: string, database: ActiOutDB = db): Promise<void> {
  await database.transaction(
    'rw',
    database.routineTemplates,
    database.routineTemplateDays,
    database.routineTemplateItems,
    database.appEvents,
    async () => {
      const existing = await database.routineTemplates.get(id);
      if (!existing) {
        return;
      }

      await database.routineTemplates.delete(id);
      await database.routineTemplateDays.where('routineTemplateId').equals(id).delete();
      await database.routineTemplateItems.where('routineTemplateId').equals(id).delete();
      await logEvent('routine', id, 'deleted', undefined, database);
    }
  );
}

export async function getRoutine(id: string, database: ActiOutDB = db): Promise<RoutineTemplate | undefined> {
  return hydrate(id, database);
}

export async function listRoutines(database: ActiOutDB = db): Promise<RoutineTemplate[]> {
  const rows = await database.routineTemplates.toArray();
  const hydrated = await Promise.all(rows.map((row) => hydrate(row.id, database)));
  return hydrated
    .filter((r): r is RoutineTemplate => r !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function routinesForWeekday(weekday: number, database: ActiOutDB = db): Promise<RoutineTemplate[]> {
  // No standalone `weekday` index exists (only the compound
  // `[routineTemplateId+weekday]`), so filter in JS instead.
  const dayRows = await database.routineTemplateDays.toArray();
  const templateIds = [...new Set(dayRows.filter((row) => row.weekday === weekday).map((row) => row.routineTemplateId))];
  const hydrated = await Promise.all(templateIds.map((templateId) => hydrate(templateId, database)));
  return hydrated
    .filter((r): r is RoutineTemplate => r !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
}
