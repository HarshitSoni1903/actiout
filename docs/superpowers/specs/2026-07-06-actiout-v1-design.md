# ActiOut v1 — Design

Date: 2026-07-06
Status: approved pending final user review
Source of truth: `01_product_brief.md` … `05_acceptance_criteria.md` (project root). This doc records the build design and the agreed deviations from those specs. Where this doc is silent, the numbered docs govern.

## 1. Product summary

ActiOut is a local-first, mobile-first workout tracker for one person. Core loop: Home suggests today's routine → user starts a live session → logs exercises in actual performed order → finishes (or explicitly DNFs) → progress views analyze PRs and performance by sequence position. No accounts, no backend; works offline; export/import JSON backup.

## 2. Decisions log (agreed with user)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Flat set model, per spec.** One row per exercise: `sets_actual`, `reps_actual`, `weight_actual` scalars. | Fastest entry; matches schema docs. Per-set child table can be added later without breaking anything. |
| D2 | **Weight unit snapshots.** `weight_unit: 'lb' \| 'kg'` added to `session_items` (for `weight_actual`) and `routine_template_items` (for `default_weight`), stamped from preference at entry time. Conversion happens on read only. | Bare numerics corrupt history when the user switches lb↔kg. Matches the existing `bodyweight_entries` pattern. |
| D3 | **Single active draft, globally.** A previous-day draft surfaces on Home ("unfinished — resume or mark DNF"); starting a new session while any draft exists triggers the three-way prompt (resume / DNF old + start new / cancel), honoring `defaultDraftConflictAction`. | Prevents a forgotten Tuesday draft from blocking Friday forever while keeping the spec'd conflict flow. |
| D4 | **Prefill actuals from planned.** On session start, `sets_actual/reps_actual/weight_actual` are copied from planned values; "did what the plan said" = one tap (done toggle). | Speed of entry is the top product priority. |
| D5 | **Export/import: versioned JSON bundle; import = validate, confirm, full replace.** No merge. | Merge-on-import is a sync problem in disguise; out of scope for v1. |
| D6 | **Reorder via up/down buttons** (drag optional later). | Reliable one-handed on iOS Safari; matches doc 04's "moves up or down" language. |
| D7 | **Quick sessions supported** (`sourceMode: 'quick'`, empty session, add exercises ad hoc). | Already in the spec's types; cheap; useful. |
| D8 | **PWA now, not later.** `vite-plugin-pwa` for app-shell caching + manifest. | Offline-first is a must-have acceptance criterion; the service worker is required regardless. |
| D9 | **`app_events` written on lifecycle mutations** (session started/completed/dnf, routine created/updated/deleted, bodyweight added, import performed). | Makes the `SyncTransport` seam real at trivial cost. |
| D10 | **No unique constraint on `sequence_position`.** Plain compound index; renumbering is atomic inside a Dexie transaction. | The SQL unique index fights renumbering and doesn't map to Dexie anyway; the transaction gives the same guarantee. |
| D11 | **`users` table omitted; `user_id` fields kept nullable** on all entities. | Future-proof for sync without dead v1 code. |
| D12 | **Vestigial fields kept but inert:** `distance_unit` preference, `fatigue_group`, `rest_seconds` (stored/editable on templates, no timer UI). | Schema fidelity; zero v1 behavior. |
| D13 | **Dates:** `session_date`/`entry_date` are local-date strings `YYYY-MM-DD` from the device timezone at creation. Timestamps are ISO 8601. | "Today" must mean the user's today, including late-night sessions. |
| D14 | **Sequence position is 1-based and global within a session** (not per routine link), renumbered contiguously on every reorder/insert/delete. | Fatigue is temporal across the whole workout. |
| D15 | **Tiered model delegation for the build.** Lead (Fable) does architecture, schema, types, service signatures, pseudocode, review. Implementation dispatched to subagents: Opus for complex-but-specified chunks, Sonnet default, Haiku for boilerplate. Contract in `.claude/agents/actiout-implementer.md`. | User directive: conserve resources. |

## 3. Stack

- React 18 + TypeScript (strict) + Vite
- Dexie (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`) — DB is the single source of truth
- Zustand — ephemeral UI state only (modals, in-flight interactions)
- React Router — bottom tab bar: Home / Routines / Progress / Settings, plus full-screen `/session/:id`
- `vite-plugin-pwa` — app shell cache, manifest, installability
- **No component library, no chart library.** Hand-rolled CSS with design tokens (dark-first); charts are small custom SVG components.
- Vitest + `fake-indexeddb` for service/analytics tests

## 4. Architecture

```
React components (read via useLiveQuery, never write db directly)
  -> services (pure TS, wrap Dexie transactions, write app_events)
    -> Dexie db (schema.ts)
```

Module layout follows `02_system_design.md`:

```
src/
  app/            routes + layout (tab bar, theme)
  components/     common/ home/ routines/ session/ progress/ settings/
  domain/         types.ts (04 shapes + D2 additions), constants, unit conversion
  db/             schema.ts, seed (starter exercise catalog)
  services/       routine-service, session-service, analytics-service,
                  export-service, bodyweight-service, preference-service,
                  exercise-service (catalog + typeahead)
  state/          ui-store.ts (Zustand, ephemeral only)
  utils/          dates, ids, formatting
```

Each service exposes plain async functions; components never construct entities themselves.

## 5. Data model

Dexie tables mirror `03_schema.md` minus `users` (D11), with D2's unit columns added. String UUIDs (`crypto.randomUUID()`), ISO timestamps everywhere. Indexes:

- `sessions`: `id, session_date, status`
- `session_items`: `id, session_id, exercise_catalog_id, [session_id+sequence_position]`
- `routine_templates`: `id, is_archived`
- `routine_template_items`: `id, routine_template_id, [routine_template_id+sequence_position]`
- `routine_template_days`: `id, routine_template_id, weekday, [routine_template_id+weekday]` (unique via `&`)
- `exercise_catalog`: `id, &normalized_name`
- `bodyweight_entries`: `id, entry_date`
- `app_events`: `id, occurred_at, [entity_type+entity_id]`
- `preferences`: `id` (singleton row, created on first run with spec defaults)

`exercise_catalog` is seeded on first run with ~40 common exercises (`is_custom: 0`); user entries are added on first use of a new name (`normalized_name` = lowercase, trimmed, collapsed whitespace).

## 6. Key flows

**Home.** Shows: date header; draft-resume card if any draft exists (top priority, per spec); today's scheduled routines (by weekday assignment) with done/undone state derived from today's completed sessions' routine links; primary action = resume draft → else start first unfinished scheduled routine → else start any routine / quick session; bodyweight quick-add.

**Start session.** Select one or more routines (or quick). If a draft exists: three-way prompt per D3. Create `session` (status `draft`, `started_at` now) + `session_routine_links` (in selection order) + `session_items` copied from template items in template order, positions renumbered 1..n globally, actuals prefilled (D4), unit stamped (D2). Single Dexie transaction. Event logged.

**Live session.** Ordered list; each row: position number, exercise name, sets/reps/weight steppers, done toggle, notes, up/down reorder. Add-exercise with typeahead (catalog suggestions + free text). Remove item allowed. Every mutation is a service call in a transaction; reorder/insert/delete renumber positions contiguously (D14).

**Finish.** Sets `status: completed`, `ended_at`, `duration_seconds = ended_at - started_at`. Items not marked done stay as logged (their `completed` flag differentiates them). Event logged.

**DNF.** Explicit button (visually distinct from Finish, confirmation required). Sets `status: dnf`, `ended_at`. Stays in history; excluded from PR/sequence analytics by default (toggle to include).

## 7. Analytics (completed sessions only, unless toggled)

All computed on read in `analytics-service` (no materialized projections in v1 — data volumes are single-user tiny):

- Exercise history: sessions × (sets, reps, weight, position), newest first
- PR weight: max `weight_actual` (converted to display unit); PR volume: max `sets×reps×weight`
- Sequence-position chart: group items for exercise X by `sequence_position`; avg weight, avg volume, count per position
- Consistency: completed-session counts by date (recent weeks strip) and by weekday
- Bodyweight trend: line over time, converted to display unit
- Unit conversion: exact factor 1 lb = 0.45359237 kg, applied on read only (D2)

## 8. Export / import

`export-service` produces `{ formatVersion: 1, exportedAt, preferences, exerciseCatalog, routineTemplates (+days/items), sessions (+links/items), bodyweightEntries, appEvents }` as a downloaded JSON file. Import: parse → validate `formatVersion` + shape → show summary + explicit "replace everything" confirmation → clear tables and insert in one transaction. Failure at any step leaves existing data untouched.

## 9. UI design language

Dark-first (light supported via tokens), left-aligned, dense-but-readable, mobile-first with bottom tab bar for thumb reach. Large tap targets (min 44px). No gradients, blobs, heroes, or feature grids; quiet direct copy. Steppers over keyboards where possible; numeric keyboards (`inputmode`) when typing is needed. Functional monochrome-plus-one-accent charts.

## 10. Error handling

- Service write failures → non-blocking toast with retry; DB state never left partially mutated (transactions).
- Import validation failures → rejected before any table is touched, with a reason shown.
- Draft-conflict and DNF are confirm-gated; no other confirmations (speed).

## 11. Testing

Vitest + `fake-indexeddb` on the service layer: session lifecycle (start/resume/complete/dnf, draft conflict), reorder renumbering invariants (contiguous 1..n after any mutation), analytics math (PRs, sequence aggregation, DNF exclusion), unit conversion, export→import round-trip. Component testing is light (smoke-level); manual review checklist from `05_acceptance_criteria.md` governs UI acceptance.

## 12. Future sync notes

- `app_events` is already written (D9); `SyncTransport` (doc 04) can replay/push it.
- All entities carry nullable `user_id` and UUID ids — no rekeying needed for multi-device.
- Export bundle doubles as the manual-file-sync transport.
- Snapshots (names, units) make merged histories readable even when catalogs diverge.
