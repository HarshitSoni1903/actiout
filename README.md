# ActiOut

ActiOut is a local-first, mobile-first workout tracker for one person. It runs
as an installable PWA: start a live session from a routine, log exercises in
the order actually performed, and review progress by sequence position. There
is no account and no backend — all data lives on-device in IndexedDB, and the
app works offline once loaded.

Built with React 18 + TypeScript (strict) + Vite, Dexie/IndexedDB as the data
layer, Zustand for ephemeral UI state only, and vite-plugin-pwa for offline/
install support.

## Run

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Run the test suite (Vitest + fake-indexeddb):

```bash
npx vitest run
```

Typecheck only:

```bash
npx tsc --noEmit
```

Production build (also typechecks) and preview:

```bash
npm run build
npm run preview
```

## Folder structure

- `src/app` — app shell: routes, layout, theme, global styles.
- `src/components` — screen and widget components, grouped by feature
  (`home`, `routines`, `session`, `progress`, `settings`, `common`).
- `src/db` — Dexie schema (`schema.ts`) and dev seed data (`seed.ts`).
- `src/domain` — shared types (`types.ts`) and unit conversion logic
  (`units.ts`).
- `src/services` — pure TypeScript modules that wrap all Dexie writes
  (routines, sessions, bodyweight, exercises, preferences, export/import,
  event logging). Components never call Dexie write methods directly; reads
  go through `useLiveQuery`.
- `src/state` — Zustand store for ephemeral UI state (not persisted data).
- `src/utils` — small helpers (date formatting, id generation).
- `public/icons` — placeholder PWA icons (`icon-192.png`, `icon-512.png`,
  `apple-touch-icon.png`); replace with real artwork before shipping.
- `docs/` — design docs and specs (see
  `docs/superpowers/specs/2026-07-06-actiout-v1-design.md` for the v1 design
  decisions and `docs/superpowers/plans/` for the build plan).

## Backup format

Settings exposes an export/import backup flow backed by
`src/services/export-service.ts`. Export downloads a JSON file named
`actiout-backup-YYYY-MM-DD.json` containing an `ExportBundleV1`:

```ts
type ExportBundleV1 = {
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
```

`formatVersion` is checked on import; only `1` is currently supported.
Import parses the file, validates `formatVersion` plus the presence of all
ten array fields, shows a summary, and requires explicit confirmation. On
confirm it **fully replaces existing data** — all ten tables are cleared and
re-populated from the bundle inside a single Dexie transaction. There is no
merge; if any insert fails the whole transaction rolls back and existing
data is left untouched.

## Current state / roadmap notes

The UI is intentionally barebone right now — functional controls with no
visual polish — pending a later design pass. Backend/data-layer work has
been prioritized first.

The data layer is deliberately local-first, but it already writes an
`app_events` log (`src/services/events.ts`, table `appEvents`) on every
lifecycle mutation (session started/completed/dnf, routine created/updated/
deleted, bodyweight added, import performed). Per the v1 design doc's future
sync notes, this event log — plus nullable `user_id` fields and UUID ids on
every entity — is meant to let a future sync backend replay/push history and
support multi-device use without requiring schema changes. The export bundle
also doubles as a manual, file-based sync transport in the meantime.
