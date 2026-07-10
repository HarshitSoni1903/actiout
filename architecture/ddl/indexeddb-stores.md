# IndexedDB Object Stores (Runtime Schema)

This is the **actual persistence schema** the app runs on: IndexedDB object stores declared through [Dexie](https://dexie.org/) in `src/db/schema.ts`. It is the physical realization of the [data model](../data-model.md); the [relational DDL](./relational-schema.sql) is the parallel server-facing realization.

## How to read Dexie schema strings

Dexie declares stores as `storeName: 'indexSpec'`. In an index spec:

- the **first token is the primary key** (here always `id`, a client-generated UUID);
- `&field` = a **unique** index;
- `[a+field]` = a **compound** index;
- other tokens are plain secondary indexes.

**IndexedDB only enforces the primary key and `&` unique indexes.** It does *not* enforce foreign keys, NOT NULL, value ranges, or enum membership. Every such rule is enforced in the service layer at runtime (see [`../connection-layer.md`](../connection-layer.md)) and expressed as a constraint in the [relational DDL](./relational-schema.sql). Row *shape* is additionally validated on import/restore (see [`../data-safety.md`](../data-safety.md)).

## Version 2 declaration

```ts
// src/db/schema.ts  (target v2)
this.version(2).stores({
  preferences:          'id',
  exerciseCatalog:      'id, &normalizedName',
  routineTemplates:     'id',
  routineTemplateDays:  'id, routineTemplateId, &[routineTemplateId+weekday]',
  routineTemplateItems: 'id, routineTemplateId, [routineTemplateId+sequencePosition]',
  sessions:             'id, sessionDate, status',
  sessionRoutineLinks:  'id, sessionId',
  sessionItems:         'id, sessionId, [sessionId+sequencePosition]',
  sessionSets:          'id, sessionId, sessionItemId, [sessionItemId+setNumber]',
  bodyweightEntries:    'id, entryDate',
  appEvents:            'id, occurredAt, [entityType+entityId]',
  snapshots:            'id, createdAt, reason',
});
```

## Store-by-store

| Store | Primary key | Secondary / compound indexes | Notes |
|-------|-------------|------------------------------|-------|
| `preferences` | `id` | — | Singleton row, `id = 'default'`. |
| `exerciseCatalog` | `id` | `&normalizedName` (unique) | Uniqueness of the match key is the one catalog invariant IndexedDB enforces directly. Seeded with 40 exercises. |
| `routineTemplates` | `id` | — | `isArchived` **removed** in v2 (was an inert boolean index). |
| `routineTemplateDays` | `id` | `routineTemplateId`, `&[routineTemplateId+weekday]` (unique) | One row per (routine, weekday); a routine can't be scheduled twice on the same day. |
| `routineTemplateItems` | `id` | `routineTemplateId`, `[routineTemplateId+sequencePosition]` | Position index is **non-unique** to allow transient states mid-reorder; contiguity/uniqueness of the *final* state is a service invariant (INV-2). |
| `sessions` | `id` | `sessionDate`, `status` | `status` index powers the active-draft lookup; `sessionDate` powers history/consistency. |
| `sessionRoutineLinks` | `id` | `sessionId` | `routineTemplateId` is a denormalized snapshot, not indexed, may dangle by design. |
| `sessionItems` | `id` | `sessionId`, `[sessionId+sequencePosition]` | v2: actuals removed; `exerciseCatalogId` index dropped (was unused). |
| `sessionSets` | `id` | `sessionId`, `sessionItemId`, `[sessionItemId+setNumber]` | **New in v2.** `sessionId` duplicated so analytics can sweep all sets without joining through items. Position index non-unique (see INV-3 caveat). |
| `bodyweightEntries` | `id` | `entryDate` | |
| `appEvents` | `id` | `occurredAt`, `[entityType+entityId]` | Append-only audit trail. |
| `snapshots` | `id` | `createdAt`, `reason` | **New in v2.** Device-local; excluded from export. |

## Migration strategy

v2 is created with **`version(2).stores(...)` and no `.upgrade()` function**, on the explicit decision to **wipe and reseed** (existing data is throwaway development data). On first launch under v2, `initializeDb` reseeds the catalog and default preference.

> ⚠️ **This is the last free schema change.** Once real user data exists, wipe-and-reseed is forbidden. Any subsequent schema change must ship a genuine Dexie `.upgrade(tx => …)` migration that transforms existing rows, and must take a pre-migration [snapshot](../data-safety.md) first. The `version(1)` block stays in the code as history; new versions are added, never edited.

## Type ↔ store mapping

Domain types live in `src/domain/types.ts`; a few stores persist a *row* variant that flattens nested arrays into child stores (Dexie stores are flat). The mapping:

| Domain type | Store | Row-shape delta |
|---|---|---|
| `Preference` | `preferences` | identical (minus removed `confirmBeforeReplacingDraft`) |
| `ExerciseCatalogEntry` | `exerciseCatalog` | identical |
| `RoutineTemplate` | `routineTemplates` | `RoutineTemplateRow` = omit `items` + `daysOfWeek` (they become child stores); `isArchived` removed |
| `RoutineTemplateItem` | `routineTemplateItems` | `+ routineTemplateId, createdAt, updatedAt` |
| — | `routineTemplateDays` | `{ id, routineTemplateId, weekday }` (extracted from `daysOfWeek`) |
| `Session` | `sessions` | `SessionRow` = omit `items` + `routineLinks` |
| `SessionRoutineLink` | `sessionRoutineLinks` | `+ sessionId` |
| `SessionItem` | `sessionItems` | v2: actuals (`setsActual/repsActual/weightActual/weightUnit/completed`) removed; `restSeconds` added |
| `SessionSet` (new) | `sessionSets` | new type |
| `BodyweightEntry` | `bodyweightEntries` | identical |
| `AppEvent` | `appEvents` | identical |
| `Snapshot` (new) | `snapshots` | new type |
