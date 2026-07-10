# ActiOut v2 — Backend & Behavior Design

**Date:** 2026-07-10
**Status:** Draft for user review
**Supersedes/extends:** v1 design (`docs/superpowers/specs/2026-07-06-actiout-v1-design.md`) and the root source-of-truth docs (`01_product_brief.md`…`05_acceptance_criteria.md`).
**Predecessor state:** v1 complete at HEAD `6e2c9d0` + an uncommitted final-review fix pass (117 tests). This phase builds on that tree.

## Purpose of this phase

Two goals, in order:

1. **Close the three decisions** left open by the final whole-branch review (event-log policy, the dead `confirmBeforeReplacingDraft` preference, `restSeconds`).
2. **Ship a v2 backend + behavior layer** so a commissioned UI redesign can be designed against the *full intended app*, not v1's thin surface. This document doubles as the behavior spec a designer works from: every screen, its states, and what each action does (§9).

**Not in this phase:** the UI redesign itself (comes after, implemented from the designer's output), and any real sync transport (§8 records the decision only). UI work here is the *minimum functional wiring* to keep screens working against the new data model — no polish.

## Guiding principle (unchanged from the brief)

Local-first, no required account, fast phone entry, offline-capable, and *"architected so future cross-device sync can be added later without rebuilding the core model."* Every decision below is chosen to be **discarded cleanly** when a real centralized server or sync relay exists — this whole local-sync story is an explicit stopgap, not the permanent answer.

---

## 1. Data model: per-set logging

### The change

v1 stores actuals as aggregates on the session item: one `setsActual`, one `repsActual`, one `weightActual` for the whole exercise. This cannot represent ramping (8×100, 6×105, 5×105), drop sets, warmups, or AMRAP, and makes "volume" an approximation. v2 moves actual work to **per-set rows**.

**`sessionItems`** becomes purely the *exercise slot* in a session:
- identity: `id`, `sessionId`, `sessionRoutineLinkId?`, `exerciseCatalogId?`, `exerciseNameSnapshot`
- ordering: `sequencePosition` (first-class, unchanged semantics)
- plan: `setsPlanned?`, `repsPlanned?` (targets carried from the routine)
- `restSeconds?` (snapshotted from the routine item; drives the rest timer, §7d)
- `notes?`, `fatigueGroup?`, `createdAt`, `updatedAt`
- **removed:** `setsActual`, `repsActual`, `weightActual`, `weightUnit`, `completed`

**`sessionSets`** (new table) — one row per performed set:
- `id`, `sessionId`, `sessionItemId`
- `setNumber` (1-based, contiguous within an item; renumbered on delete like `sequencePosition` is)
- `reps?`, `weight?`, `weightUnit` (required — stamped per set, mirrors v1's per-row unit discipline)
- `isWarmup: boolean` (default false; warmups excluded from PRs and volume, §2)
- `completed: boolean`
- `createdAt`, `updatedAt`

`sessionId` is duplicated onto the set row (not only `sessionItemId`) so analytics can sweep sets without joining through items, and so export/referential-integrity checks can validate `sessionSets.sessionId → sessions.id` directly.

### Derived item completion

Item-level "done" is **derived**, not stored: an item is complete when it has ≥1 set and all its non-warmup sets are `completed`. This removes the v1 class of bug where a stored `completed` flag disagrees with the underlying data. Session Finish/DNF logic (§9 session screen) reads the derived value.

### Dexie version & migration

Because existing data is **wipe-and-reseed** (user decision — current data is throwaway), the schema is declared fresh at **`db.version(2)`** with new stores and **no `.upgrade()` function**. On first run under v2, `initializeDb` reseeds the 40-exercise catalog and default preference as today.

> **Recorded risk:** this is the *last* free schema change. Once real user data exists, any further schema change needs a genuine Dexie `.upgrade()` migration with a pre-migration snapshot (§3). The spec explicitly forbids future wipe-and-reseed once the app has shipped to real use.

New `version(2).stores()` (indexes chosen for the query patterns below):
```
preferences:          'id'
exerciseCatalog:      'id, &normalizedName'
routineTemplates:     'id'                                    // isArchived removed
routineTemplateDays:  'id, routineTemplateId, &[routineTemplateId+weekday]'
routineTemplateItems: 'id, routineTemplateId, [routineTemplateId+sequencePosition]'
sessions:             'id, sessionDate, status'
sessionRoutineLinks:  'id, sessionId'
sessionItems:         'id, sessionId, [sessionId+sequencePosition]'   // exerciseCatalogId index dropped (unused)
sessionSets:          'id, sessionId, sessionItemId, [sessionItemId+setNumber]'
bodyweightEntries:    'id, entryDate'
appEvents:            'id, occurredAt, [entityType+entityId]'
snapshots:            'id, createdAt, reason'                 // §3
```

### Dead fields removed (closes 2 of 3 open decisions)

- **`isArchived`** (on `routineTemplateRow`): nothing ever sets it true; it is indexed as a boolean, which IndexedDB cannot use as a key, so the index is inert and the archive-exclusion code paths are unreachable. **Removed entirely** (field, index, and the `hydrate`/`listRoutines` filters). Routines are hard-deleted, as today. *(Decision: "archived routines" resolved — feature does not exist; stop pretending it does.)*
- **`confirmBeforeReplacingDraft`** (on `Preference`): declared, seeded, exported, never read, absent from Settings. It is **redundant** — `defaultDraftConflictAction: 'ask'` already means "confirm before replacing a draft." **Removed** from the type, seed, and export bundle. *(Decision resolved.)*

---

## 2. Analytics, rebuilt on sets

All analytics currently derive from item aggregates (`rowVolume = setsActual * repsActual * weightActual`). They move to sets:

- **Volume** becomes the true `Σ(reps × weight)` over an item's **non-warmup, completed** sets, converted per-set into the display unit. No longer an approximation.
- **Weight PR** becomes the heaviest single non-warmup set (converted to display unit), keeping the deterministic tie-break the review added: on equal value, earliest `sessionDate`, then lexicographically smaller session id.
- **Volume PR** becomes the best per-session total volume for the exercise.
- **Sequence stats (fatigue analysis)** gain resolution: still grouped by `sequencePosition`, but now averaging real per-set weight/volume, which lets the chart show within-exercise decay (set 1 heavier than set 3), not just across-position differences. *(This is the product's differentiating feature per `01_product_brief.md`; per-set data is what makes it honest.)*
- **`getExerciseHistory`** returns a per-item summary computed from its sets: top set, total reps, total volume, set count — plus the session date/status/position it already returns.
- **`getConsistency`**, **`getBodyweightTrend`**, **`getLoggedExerciseNames`** are unaffected by the set change (they key off sessions/items/bodyweight, not set internals) and keep current behavior. `byDate` stays sparse; the UI keeps zero-filling.

Warmup handling is the one new semantic: warmup sets are stored but excluded from every performance metric. They exist for the rest timer and for honest session history, not for PRs.

---

## 3. Snapshots & rollback (built this phase; independent of sync)

Protects the user's single data copy against their own mistakes and bad imports — the exact failure class the final review's Critical was about.

**`snapshots` table:** `id`, `createdAt`, `reason` (`'pre-import' | 'pre-restore' | 'pre-sync' | 'manual'`), `summary` (e.g. `"8 routines, 142 sessions, 30 bodyweight"`), `bundleJson` (a compressed `ExportBundleV1` — the existing bundle format, gzipped via `CompressionStream` where available, plain JSON string fallback).

**When a snapshot is taken:** automatically and synchronously *before* any destructive whole-DB operation — **import**, **restore-from-snapshot**, and (later) the **sync overwrite**. Once sync exists, also at the **start of every sync session**. There is no daily-cadence snapshot; the trigger is "about to replace everything," which is precisely when a rollback point has value.

**Retention:** age-based **7-day TTL** — snapshots older than 7 days are pruned on creation. Sync twice a day → two that day; return after a month → all gone, and that is fine (a month-old restore point can only conflict with everything since). A hard cap of **20** guards against a pathological burst of syncs exhausting the storage quota (oldest-beyond-cap pruned first, regardless of age).

**Restore:** Settings → "Restore from snapshot" lists snapshots (date, reason, summary). Restoring runs the **hardened validate-then-replace path** from the final review (row-shape + referential validation before any `clear()`), and takes its own `pre-restore` snapshot first, so even a restore is reversible.

**Storage durability:** on startup, call `navigator.storage.persist()` to request persistent storage. Without it, Safari can evict IndexedDB under pressure — which would defeat every data-protection measure here. Log the granted/denied result; surface a one-line note in Settings if denied.

---

## 4. Event log → lifecycle audit trail

**Decision (third open item resolved):** the event log is a **lightweight audit trail**, not a source of truth and not a mergeable oplog. This follows directly from the sync model (§8): a thin-client, single-writer design never merges divergent edits, so no per-field oplog, CRDT, or version vectors are needed. Investing in merge machinery now would be building for a sync architecture we've explicitly chosen not to use.

Concretely:
- **Remove** the three unreplayable `item-*` events (`item-moved`, `item-added`, `item-removed`). They record that *something* changed without recording what it became, so they serve neither audit nor replay.
- **Keep** meaningful lifecycle facts, each carrying a small human-meaningful payload: `session started/completed/dnf` (with `durationSeconds`), `routine created/updated/deleted` (name, item count), `bodyweight created/deleted`, `import`, `restore`, `snapshot-created`. Per-set edits are **not** logged, by design.
- Fix the two review-noted event bugs regardless: no `deleted` event when the id did not exist (already fixed in the uncommitted pass — carry it forward), and events remain inside the mutation's transaction.

This is an audit/history convenience, cheap to keep. When a real server arrives, sync is designed against *that* server's requirements, not this log.

---

## 5. New feature — Quick / ad-hoc session

Uses the `sourceMode: 'quick'` the schema already declares but nothing sets.

- Start a session with **no routine**: creates a `draft` session with `sourceMode: 'quick'`, no `sessionRoutineLinks`, zero items.
- Add exercises live via the existing `ExerciseTypeahead`; each `addSessionItem` appends at the next `sequencePosition`, with an empty set list the user fills (or a first blank set, TBD in plan — default: one blank working set).
- Everything else (reorder, per-set logging, Finish/DNF, drafts, analytics) is identical to routine-sourced sessions. Quick sessions count in analytics and consistency exactly like any other.
- The draft-conflict rule (only one active draft) applies unchanged — starting a quick session when a draft exists goes through the same `defaultDraftConflictAction` flow.

---

## 6. New feature — Last-time prefill

Serves the brief's "defaults reduce repetitive typing." Read-only; no schema change.

- New analytics read: `getLastPerformance(name, database)` → the most recent **completed** session's sets for that exercise (matched by normalized name), returning the per-set reps/weight/unit and the session date.
- When an exercise is added to a session (routine-sourced or quick), and the routine provides no defaults (or in addition to them — precedence decided in plan; default: **last-time wins over routine defaults** when present), prefill the new item's sets from last time.
- The session UI shows a subtle "last time: 8×100, 6×105 · Jul 3" affordance (behavior spec §9; visual left to the designer).
- Absent history → no prefill, current blank behavior.

---

## 7. New feature set — editing reach & rest timer

### 7a/b. Backfill + edit past sessions

- **Backfill:** create a session with a user-chosen **past `sessionDate`** (not just today). Same creation paths; the date is an input rather than always `todayLocalDate()`.
- **Edit completed sessions:** the v1 UI gates completed/dnf sessions read-only. v2 makes editing an **explicit mode**: a completed session opens read-only, with an "Edit" affordance that unlocks mutation (sets, reps, weight, reorder, add/remove). This deliberately relaxes the v1 read-only invariant — mutation of historical data is now *intended*, entered explicitly, never accidental.
- **Delete a completed session:** allowed, confirm-gated, logs `session deleted`. Cascades to its items and sets in one transaction.
- Editing a completed session bumps its `updatedAt` (and the parent session's, per the review fix). Analytics recompute live, so edits reflect immediately in PRs/charts.

### 7c. Rest timer (makes `restSeconds` real)

- `restSeconds` becomes **editable** on routine items (a control in the routine editor) — closing the "stored but not editable" gap.
- On session creation it is **snapshotted** onto the session item (already a field there).
- When a set is marked `completed`, if the item has `restSeconds`, a **countdown** starts (item's value). This is a UI/runtime behavior (a timer in `ui-store` or a local hook), not persisted state — a reload does not resume a countdown. Behavior spec in §9; exact controls (skip, +15s, dismiss) are the designer's, but the data contract (each item carries its rest duration) is fixed here.

---

## 8. Sync — decision recorded, NOT built

**Model:** thin-client, single-writer, as a **stopgap until a centralized DB / real-time relay exists.**

- One device is the **primary** (user-selectable) and holds ground truth.
- A **secondary** is a *thin client*: it stores nothing authoritative. Over a live connection it sends **intents** ("add set", "set weight = 105") to the primary, which applies them to its own DB; resulting state streams back. Real-time while connected.
- **No merge, ever** — there is only one writer — therefore **no oplog, no CRDT, no version vectors, no reconciliation policy.** This is why §4 keeps the event log minimal.
- If the connection drops, nothing propagates. That is an honest, visible failure mode (not silent data loss).

**Recorded limitations (for the future sync project, not this phase):**
- iOS Safari suspends background PWA pages aggressively, so a **locked phone likely drops the data channel** — a phone-primary/desktop-secondary setup probably needs the phone foregrounded. A desktop-primary setup sidesteps this. Acceptable: the common case is logging on one phone; cross-device logging is the rare case.
- Transport (QR-initiated WebRTC with the offer encoded in the QR, a file handoff, or a tiny relay) is a **separate future decision**. The export/import bundle remains the only transport in the meantime.

Nothing in §8 is implemented now. It exists so §1–§4 don't accidentally foreclose it, and so the plan doesn't over-build.

---

## 9. Behavior spec (for the UI designer)

Screens exist and are functionally wired; this phase keeps them working against the new model with **zero polish**. The designer designs the real UI from this section. Each screen lists its states and what each action does.

### Home (date-centered)
- **States:** today's routines (scheduled for weekday) with start affordance; active draft banner (resume/discard per conflict rule); empty (no routines) with "create routine" and "quick session" actions; bodyweight quick-add.
- **Actions:** start scheduled routine(s) → new draft session; resume draft; **start quick session** (§5); log bodyweight; navigate to routines/progress/settings.

### Routines (list + editor)
- **List states:** routines present; empty with create action.
- **Editor states:** new; editing existing; per-item rows with exercise (typeahead), default sets/reps/weight(+unit), **`restSeconds` control (new)**, notes, reorder, delete; save/cancel; delete-routine (confirm, double-submit-guarded per review fix).

### Session (live logging) — the biggest change
- **States:** draft (editable); completed/dnf (read-only) with **"Edit" to unlock (§7a)**; empty draft (no items yet, esp. quick sessions).
- **Per exercise item:** header (name, sequence position, derived done state), **set table** (each row: set #, reps, weight+unit, warmup toggle, completed toggle), **add set**, remove set, **last-time hint (§6)**, item notes, reorder item.
- **On set complete:** **rest countdown (§7c)** if the item has `restSeconds`.
- **Actions:** add/remove/edit sets; mark set/item done; reorder items; add exercise (typeahead); **Finish** (confirm; needs ≥1 completed item) → `completed`; **DNF** (confirm, distinct) → `dnf`; back → draft persists ("saved as draft").

### Progress
- **States:** exercise picker; PR block (weight PR, volume PR — now per-set honest, §2); **sequence/fatigue chart** (per-position averages, now with within-exercise resolution); history list (per-session summary: top set, total reps, total volume); consistency strip (12-week, zero-filled); bodyweight chart. Empty states where no data.

### Settings
- **States/actions:** unit (lb/kg), theme, draft-conflict default (**`confirmBeforeReplacingDraft` removed** — this control is the single source of that intent); export (download bundle); import (validate → confirm "replaces all" → snapshot-then-replace); **restore from snapshot (§3)** list; **primary/secondary device role (§8) — deferred, may be a disabled placeholder**; storage-persistence status note; version.

---

## 10. Scope, sequencing, and testing

Large phase; the schema change alone rewrites `session-service`, `analytics-service`, `export-service`, and every session/progress screen. The implementation plan will sequence it so each part lands green:

1. **Schema + session/set services** — v2 stores, `sessionSets`, per-set CRUD, derived completion, dead-field removal, `restSeconds` editable. Rewrite session-service tests.
2. **Analytics on sets** — volume/PR/sequence/history rebuilt; warmup exclusion; rewrite analytics tests.
3. **Snapshots + storage durability + event-log trim** — `snapshots` table, snapshot-before-destructive, restore, `navigator.storage.persist()`, remove `item-*` events.
4. **Features** — quick session, last-time prefill, backfill/edit-completed, rest timer; minimal functional UI wiring throughout.

**Export bundle** gains `sessionSets`, drops `confirmBeforeReplacingDraft`, and **excludes** `snapshots` (snapshots are device-local, not user data). The bundle's `formatVersion` bumps to **2** because the shape changed materially (session actuals moved from item aggregates to set rows). `validateBundle` gains `sessionSets` row-shape checks plus `sessionSets.sessionId→sessions.id` and `sessionSets.sessionItemId→sessionItems.id` referential checks; a `formatVersion: 1` bundle is rejected with a clear message (there is no real user data to preserve, per wipe-and-reseed).

**Testing:** service-layer TDD as in v1 (real `fake-indexeddb`, no mocks; no test re-derives expected values through the implementation). The 117 existing tests are **substantially rewritten, not merely extended** — expected, because the actuals model changed shape. Definition of done per part: `tsc` clean, all tests green, `npm run build` clean. No browser walkthrough required (bare-minimum UI protocol holds until the redesign).

## Decisions locked in this spec (veto at review)
1. Per-set rows; item completion derived. **(user: per-set)**
2. Wipe-and-reseed → `db.version(2)`, no upgrade fn; last free schema change. **(user)**
3. Event log = lifecycle audit trail; drop `item-*` events; no oplog. **(user: sync is thin-client single-writer)**
4. Remove `isArchived` and `confirmBeforeReplacingDraft`. **(lead default; closes 2 decisions)**
5. `restSeconds` editable + snapshotted + drives rest timer. **(user: rest timer)**
6. Snapshots before destructive ops + on sync session; 7-day TTL, cap 20. **(user)**
7. Features: quick session, last-time prefill, backfill/edit-completed, rest timer. **(user: all four)**
8. Sync recorded only (thin-client, single-writer); export bundle `formatVersion: 2`. **(user)**
9. `navigator.storage.persist()` on startup. **(lead default; data-durability)**
