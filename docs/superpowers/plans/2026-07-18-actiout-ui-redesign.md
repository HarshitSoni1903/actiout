# ActiOut UI Redesign (Mantine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five barebone screens with a polished Mantine v8 UI matching `screendesigns/*.svg`, carrying the locked session behaviors (tap-to-activate numbering, float-to-top, per-exercise DNF, loggingMode-gated per-set input, drag-to-reorder, plank timer) in both light and dark modes.

**Architecture:** Mantine v8 becomes the component layer (provider + theme tokens derived from the SVGs); services stay the sole data writers. One small domain addition (`SessionItem.activatedAt`/`dnfAt` + two service functions + a pure ordering helper) powers the new session flow; everything else is presentation. Hand-rolled SVG charts are kept and re-wrapped. `src/components/common/*` is deleted at the end once nothing imports it.

**Tech Stack:** React 18 + TS strict · Vite · Dexie · Zustand (transient) · **@mantine/core v8 + @mantine/hooks + @mantine/notifications** · @tabler/icons-react · @dnd-kit (core/sortable/utilities) · @fontsource/inter · Vitest + fake-indexeddb.

## Global Constraints

- **NEVER run `git add` / `git commit` / `git push`.** The user commits personally. Every "Commit" step below is a **USER CHECKPOINT**: print the exact command, continue working. *(user-mandated)*
- **Bare-minimum-UI protocol is LIFTED for this plan.** Polish is in scope. Every screen task ends with a browser verification at 390×844 in **both** light and dark schemes (kill only your own dev server afterwards, by port).
- **NO new chart libraries.** Progress charts stay hand-rolled SVG (restyle their containers only).
- **NO @mantine/dates / dayjs.** Time-of-day input stays a native `type="time"` input inside a Mantine `TextInput`.
- **Reference designs:** `screendesigns/home1.svg`, `home2.svg`, `routine.svg`, `session.svg` (390×844). Colors/spacing are *reference*, not law — match the vibe via theme tokens, not hardcoded hex in components.
- **Copy normalization:** the SVG copy is AI-generated. "Start exercise" → **"Start workout"**; "Quick exercise" → **"Quick session"**. Any other odd copy: prefer the app's existing copy.
- **Locked UX decisions (auto-memory `ui-design-decisions`, HANDOFF):** session exercises start collapsed/unnumbered; tapping one activates it (#1, #2, … in tap order regardless of list position); a finished (done or DNF) exercise floats to the top; green check = done, amber = activated/in-progress, red cross = per-exercise DNF (needs a button), plain/gray = untouched; drag-to-reorder for the untouched queue; per-set input is gated by the `loggingMode` preference ('basic' = one aggregate row with a nested per-set disclosure, 'advanced' = per-set rows up front).
- **Theme:** system default (`defaultColorScheme="auto"`), overridden by the existing `Preference.theme` ('system'|'light'|'dark') from Settings. Green accent `#2b8a57`, light surfaces per SVGs, dark equivalents via Mantine's dark palette.
- **RESPONSIVE, not mobile-only (user, 2026-07-18):** layouts must adapt from small phones (320px) through desktop. No hardcoded pixel widths or 390px assumptions. Screens use `Container size="xs" px="md"` (fluid below 540px, centered column above); buttons/inputs use fluid/`fullWidth` sizing; anything wider-than-column (future grids) is the user's own polish pass.
- **Quick-start emphasis (user, 2026-07-18):** the SVGs' core principle is *simple and quick starting* — primary start actions are LARGE (`size="lg"`/`xl`, hero-width per home1.svg's 264×58 centered button; per-routine Start buttons generous per routine.svg's 154×42). Do not shrink primary actions to fit more content.
- **Routine overview line is REQUIRED wherever a routine is listed** (Home today section, routines list): exercise summary like "Incline press (3×10) · Chest press (3×10) · Fly (3×12)". Bodyweight quick-add stays where it is on Home.
- **Visual testing is the USER's (user, 2026-07-18):** the lead runs functional browser smoke only (boot, nav, console errors, behavior flows); cosmetic/visual verification loops are dropped — the user tests and iterates on the UI themselves.
- **Services stay pure TS** (no React imports); components never write `db.*` directly.
- **Definition of done, every task:** `npx tsc --noEmit` clean · `npx vitest run` green · `npm run build` clean at part boundaries · screen tasks browser-verified light+dark.

**Delegation:** lead orchestrates + reviews; implementation via `.claude/agents/actiout-implementer.md` (Sonnet default; C1 service work Sonnet with TDD; C2/C3 are the complex dispatches — consider Opus). Each dispatch: task-brief file + report file + never-git override.

**Baseline:** working tree has the uncommitted TIME placeholder (166/166 tests, tsc/build clean) awaiting user commit. Start Part A only after the user commits it.

---

## File Structure

**New files**
- `postcss.config.cjs` — postcss-preset-mantine + postcss-simple-vars.
- `src/app/mantine-theme.ts` — `createTheme` tokens (green palette, radius, Inter) + scheme-sync hook `useColorSchemeSync()`.
- `src/services/session-flow.ts` — `activateSessionItem`, `dnfSessionItem` (toggle), `applyAggregateSets`; pure `orderSessionItems` + `activationNumbers`. (+ `.test.ts`)
- `src/components/session/SetRowTimer.tsx` — start/stop stopwatch writing `SessionSet.durationSeconds`.

**Rewritten (Mantine) files** — same paths, same props where stated: all five screen trees under `src/components/{home,routines,session,progress,settings}/`, `src/app/layout/TabBar.tsx`, `src/app/App.tsx`, `src/main.tsx`.

**Modified**
- `src/domain/types.ts` — `SessionItem` gains `activatedAt?: string; dnfAt?: string` (optional ⇒ old backups stay valid; no export-service change).
- `src/state/ui-store.ts` — `showToast` re-implemented over `@mantine/notifications` (public API unchanged).
- `src/app/theme.ts` — deleted (replaced by Mantine scheme sync).

**Deleted at D3 (after nothing imports them):** `src/components/common/*` (Button, Field, Modal, SegmentedControl, Stepper, Toast, EmptyState), obsolete screen CSS files.

---

# PART A — Foundation (provider, theme, shell)

### Task A1: Mantine install + theme + scheme sync + toast bridge *(Sonnet)*

**Files:** Create `postcss.config.cjs`, `src/app/mantine-theme.ts`. Modify `package.json`, `src/main.tsx`, `src/app/App.tsx`, `src/state/ui-store.ts` (+ its test). Delete `src/app/theme.ts`.

**Interfaces produced:** `mantineTheme: MantineThemeOverride`; `useColorSchemeSync(): void` (reads `getPreferences()` via `useLiveQuery`, maps 'system'→`'auto'` else the literal, calls `setColorScheme` from `useMantineColorScheme`); `useUiStore.showToast(message, kind?)` unchanged for all callers.

- [ ] **Step 1:** `npm install @mantine/core @mantine/hooks @mantine/notifications @tabler/icons-react @fontsource/inter && npm install -D postcss postcss-preset-mantine postcss-simple-vars`
- [ ] **Step 2:** `postcss.config.cjs`:

```js
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: { 'mantine-breakpoint-xs': '36em', 'mantine-breakpoint-sm': '48em', 'mantine-breakpoint-md': '62em', 'mantine-breakpoint-lg': '75em', 'mantine-breakpoint-xl': '88em' },
    },
  },
};
```

- [ ] **Step 3:** `src/app/mantine-theme.ts`:

```ts
import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Green ramp built around the reference accent #2b8a57 (index 6 = primary shade).
const actiGreen: MantineColorsTuple = [
  '#e8f6ed', '#d3ecdc', '#a8d8ba', '#7ac496', '#54b378',
  '#3ca865', '#2b8a57', '#1f7a4d', '#166b42', '#0a5c37',
];

export const mantineTheme = createTheme({
  primaryColor: 'actiGreen',
  primaryShade: { light: 6, dark: 5 },
  colors: { actiGreen },
  fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
  defaultRadius: 'lg',
  radius: { lg: '16px', xl: '20px' },
  headings: { fontFamily: "'Inter', -apple-system, system-ui, sans-serif", fontWeight: '700' },
});
```

Also export `useColorSchemeSync()` from this file (useLiveQuery on `getPreferences`, `useMantineColorScheme().setColorScheme(pref.theme === 'system' ? 'auto' : pref.theme)` in a `useEffect` keyed on `pref?.theme`).

- [ ] **Step 4:** `src/main.tsx`: import `@mantine/core/styles.css`, `@mantine/notifications/styles.css`, and `@fontsource/inter/{400,500,600,700}.css`; wrap the app in `<MantineProvider theme={mantineTheme} defaultColorScheme="auto">` + `<Notifications position="top-center" />`. `src/app/App.tsx`: call `useColorSchemeSync()`; drop the old `applyTheme` effect and delete `src/app/theme.ts`.
- [ ] **Step 5:** `src/state/ui-store.ts`: keep the `showToast(message, kind)` signature but implement via `notifications.show({ message, color: kind === 'error' ? 'red' : 'actiGreen', autoClose: 3500 })`; remove toast state fields; update `ui-store.test.ts` (mock `@mantine/notifications` with `vi.mock`, assert `show` is called with the message and red color for errors); remove `<Toast/>` rendering from App.
- [ ] **Step 6:** Gate: `npx tsc --noEmit` && `npx vitest run` && `npm run build` (note the new bundle size in the report). Browser sanity check: app boots, toasts fire, OS scheme toggle flips the app.
- [ ] **Step 7: USER CHECKPOINT** — print: `git add -A && git commit -m "Add Mantine v8 foundation: theme, color-scheme sync, notifications"`

### Task A2: App shell + tab bar *(Sonnet)*

**Files:** Rewrite `src/app/layout/TabBar.tsx`; modify `src/app/App.tsx`, `src/app/routes/index.tsx` (wrap routed screens in a Mantine `Container size="xs" px="md"` (fluid below 540px — responsive constraint)); delete `TabBar`'s old CSS.

Bottom tab bar per the SVGs: 4 items (Home / Routines / Progress / Settings) with @tabler icons (`IconHome`, `IconBarbell`, `IconChartLine`, `IconSettings`), active = filled green + 700 label, inactive = muted; hairline top border; `env(safe-area-inset-bottom)` padding; hidden on `/session/:id` (preserve the existing hide-list behavior). Use `UnstyledButton` + CSS module or inline styles via `style` props — not `Tabs` (it's navigation, not tabs).

- [ ] **Step 1:** Implement; keep route paths from `tab-routes.ts`.
- [ ] **Step 2:** Gate + browser check light/dark: bar renders, active state tracks route, safe-area OK in responsive mode.
- [ ] **Step 3: USER CHECKPOINT** — `git commit -m "Mantine app shell and tab bar"`

---

# PART B — Home + Routines

### Task B1: Routines list screen *(Sonnet)*

**Files:** Rewrite `src/components/routines/RoutineListScreen.tsx`; delete its replaced CSS rules.

Per `routine.svg`: heading "Routines" + sub "Create and customize your workouts."; full-width green `Button size="lg"` "+ New routine"; section label "YOUR ROUTINES" (`Text size="sm" fw={700} c="dimmed" tt="uppercase"`); one block per routine — `Title order={3}` name, one `Text c="dimmed" size="sm"` summary line "Incline DB Press (3×10) · …" built from items (`exerciseNameSnapshot (defaultSets×defaultReps)` joined by " · "), a green **"Start workout"** button (copy rule!) wired to the same start flow the Home screen uses (`attemptStart`-equivalent via navigate or lifted helper — reuse `startSession` + draft-conflict handling by extracting the existing logic from HomeScreen into a small hook `src/components/home/useStartSession.ts` and importing it here), an "Edit" `Anchor` → `/routines/:id`; `Divider` between blocks. Show `timeOfDay` as a right-aligned dimmed chip when set.

- [ ] **Step 1:** Extract `useStartSession()` hook from HomeScreen (move `attemptStart`/conflict-modal state; HomeScreen consumes it too — keep HomeScreen compiling, its rewrite lands in B3).
- [ ] **Step 2:** Implement screen; gate; browser check light+dark.
- [ ] **Step 3: USER CHECKPOINT** — `git commit -m "Redesign routines list"`

### Task B2: Routine editor *(Sonnet)*

**Files:** Rewrite `src/components/routines/RoutineEditorScreen.tsx`, `RoutineItemRow.tsx`, `ExerciseTypeahead.tsx`; delete `routines.css` rules that die.

Mantine mapping: name → `TextInput`; category → `Select` (same options, clearable); days → `Chip.Group multiple` with 7 round `Chip`s (S M T W T F S); time of day → `TextInput type="time"` label "Time of day" description "Leave empty for an all-day routine"; default sets/reps → `NumberInput` (min 0, step 1, `allowDecimal={false}`); items → `Card withBorder radius="lg"` per item with `Autocomplete`-backed name (keep existing typeahead data logic — swap its input for Mantine `Autocomplete`, preserving the `{onPick(name), placeholder?}` contract), per-item NumberInputs (sets/reps/weight), unit `SegmentedControl data={['lb','kg']}`, rest seconds `NumberInput`, notes `Textarea autosize`; remove item = `ActionIcon color="red" variant="subtle"` with `IconTrash`; keep ↑/↓ buttons for now (drag lands in C5); Save = sticky bottom `Button size="lg"`; Delete routine = `Button color="red" variant="light"` + Mantine `Modal` confirm.

- [ ] **Step 1:** Implement; all existing behavior (prefill 3×10, restSeconds 90 on new items, name-required error via `error` prop) preserved.
- [ ] **Step 2:** Gate; browser check light+dark incl. create → save → edit → delete round trip.
- [ ] **Step 3: USER CHECKPOINT** — `git commit -m "Redesign routine editor"`

### Task B3: Home screen *(Sonnet)*

**Files:** Rewrite `src/components/home/HomeScreen.tsx`, `TodayRoutineList.tsx`, `RoutineStartRows.tsx`, `DraftCard.tsx`, `RoutinePickerModal.tsx`, `StartConflictModal.tsx`, `BodyweightQuickAdd.tsx`; delete `home.css` rules that die.

Per `home1.svg`/`home2.svg`: big date header (`Title order={1}` "Tuesday, Jul 7" style); "TODAY" section label; the **suggested** routine rendered hero-style (name + summary line + centered large green button) — label "Start workout", or "Continue" when it's the active draft (draft case also gets a secondary outline "Start new workout" button per home2.svg); remaining today-routines as compact rows (name, done ✓ in green when finished, time badge; row Start buttons). **Clock-aware due label:** with `routinesForWeekday` already in due-order, compute `const now = 'HH:MM' of new Date()`; the suggested routine gets a dimmed sub-label — "Due now" if its `timeOfDay` ≤ now, "Due at {timeOfDay}" if later, nothing if all-day. "Quick session" stays an underlined text link near the bottom (copy rule). Multi-select flow, picker modal (→ Mantine `Modal`), conflict modal, bodyweight quick add (→ `NumberInput` + small Button in a `Card withBorder`) all preserved on Mantine primitives, using `useStartSession()` from B1.

- [ ] **Step 1:** Implement; gate; browser check light+dark: no-draft state, draft state, all-done state, empty state.
- [ ] **Step 2: USER CHECKPOINT** — `git commit -m "Redesign home screen"`

---

# PART C — Session flow (services first, then the screen)

### Task C1: Session-flow service + types *(Sonnet, TDD)*

**Files:** Modify `src/domain/types.ts`. Create `src/services/session-flow.ts` + `src/services/session-flow.test.ts`.

**Types:** `SessionItem` gains `activatedAt?: string;` (stamped on first tap) and `dnfAt?: string;` (per-exercise DNF). Optional ⇒ export validation untouched (add one tolerance assertion to the existing export placeholder-tolerance test).

**Produces (exact):**

```ts
// All writes bump item.updatedAt and parent session.updatedAt (same tx, matching session-service idiom).
export async function activateSessionItem(itemId: string, database?: ActiOutDB): Promise<void>; // no-op if already activated
export async function dnfSessionItem(itemId: string, database?: ActiOutDB): Promise<void>;      // toggles dnfAt on/off
// Basic-mode aggregate entry: make the item have exactly `sets` sets, each reps/weight/weightUnit as given,
// completed: true, preserving isWarmup=false; extra sets removed (renumber 1..n), missing ones added.
export async function applyAggregateSets(
  itemId: string,
  agg: { sets: number; reps?: number; weight?: number; weightUnit: WeightUnit },
  database?: ActiOutDB
): Promise<void>;

export type ItemPhase = 'finished' | 'active' | 'queued';
export function itemPhase(item: SessionItem, complete: boolean): ItemPhase;
// finished = dnfAt set OR (activated && complete); active = activated && not finished; queued = never activated.
export function orderSessionItems(items: SessionItem[], completeById: Map<string, boolean>): SessionItem[];
// finished (by activatedAt asc) → active (by activatedAt asc) → queued (by sequencePosition asc)
export function activationNumbers(items: SessionItem[]): Map<string, number>;
// 1-based rank of activatedAt among activated items; unactivated items absent from the map
```

- [ ] **Step 1:** Write failing tests: activate stamps once (second call keeps the first timestamp); dnf toggles; applyAggregateSets grows/shrinks/overwrites (3→5 sets, 5→2 renumbers 1..2, values overwritten, all completed, warmups… replaced — aggregate mode owns the item); ordering: finished first by activation order, queued keeps sequencePosition; activationNumbers = tap order. Run: `npx vitest run src/services/session-flow.test.ts` → FAIL (module missing).
- [ ] **Step 2:** Implement; tests green; full gate.
- [ ] **Step 3: USER CHECKPOINT** — `git commit -m "Session flow service: activation, per-exercise DNF, aggregate sets"`

### Task C2: Session screen — structure + tap-to-activate *(Opus recommended)*

**Files:** Rewrite `src/components/session/SessionScreen.tsx`, `SessionHeader.tsx`, `FinishBar.tsx`, and `SessionItemCard.tsx`'s collapsed shell; delete replaced CSS.

Per `session.svg`: header = `Title` session name + dimmed "Draft • {elapsed} min elapsed" + small outline red "DNF" button (whole-session DNF, existing `dnfSession`); collapsed exercise rows = `Card withBorder radius="lg"` with: left numbered circle (activation number from `activationNumbers`; **empty circle if unactivated**), name + dimmed summary ("60 lb × 10 × 3" from planned/last data), right status icon — `IconCircleCheck` green (finished-done), `IconClock` amber (active), `IconX` red in light-red circle (DNF'd), plain gray circle (queued). Row order = `orderSessionItems`. **Tap semantics:** tapping a queued row calls `activateSessionItem` and expands it; tapping active/finished rows just toggles expansion; only one row expanded at a time (Mantine `Collapse`). Per-exercise DNF button lives in the expanded card footer (`Button variant="light" color="red" size="xs"` "Didn't finish" — toggles via `dnfSessionItem`, collapses the card). "+ Add exercise" row (existing `AddExerciseRow` re-skinned) and bottom sticky "Finish workout" green button (existing confirm flow) round it out. Read-only completed/dnf view: same layout, no mutations, Edit-to-unlock preserved.

- [ ] **Step 1:** Implement structure with the *existing* per-set table temporarily inside the expanded card (C3 replaces it); gate; browser check light+dark: activation numbering in tap order, float-to-top on completion, DNF coloring, elapsed timer.
- [ ] **Step 2: USER CHECKPOINT** — `git commit -m "Redesign session screen: tap-to-activate flow"`

### Task C3: Expanded card logging — loggingMode gating + rest timer *(Opus recommended)*

**Files:** Rewrite `src/components/session/SessionItemCard.tsx` expanded body; modify `src/components/session/SetRowTimer.tsx` consumer wiring (component itself lands in C4 — build the set row with a slot for it).

**basic mode** (default, from `getPreferences().loggingMode ?? 'basic'`): one row — Sets/Reps/Weight `NumberInput`s + unit `SegmentedControl` — prefilled from planned values or last performance (`getLastPerformance` hint stays, dimmed "Prev: 25 lb × 12 × 3"); a green "Completed" button calls `applyAggregateSets` (marks the whole exercise done → card collapses, row floats up, rest timer fires). Below the row, a plain down-arrow `UnstyledButton` ("dropdown inside a dropdown") opens a `Collapse` with prefilled per-set rows for tweaking — those rows are the **advanced** row component.
**advanced mode:** per-set rows up front (reps/weight/unit/warmup `Checkbox`/completed `Checkbox`, add/remove set) — the current barebone table re-skinned: `Table` → compact `Stack` of rows with `NumberInput size="xs"`.
**Rest timer:** on marking a set (advanced) or exercise (basic) completed with `restSeconds` set, existing ui-store `startRestTimer` fires; render as a slim `Progress` bar countdown pinned under the card with remaining seconds text. Notes button → `Textarea` in a `Collapse`.

- [ ] **Step 1:** Implement both modes; verify mode switch live-updates from Settings; gate; browser check light+dark in both modes.
- [ ] **Step 2: USER CHECKPOINT** — `git commit -m "Session logging: basic/advanced modes and rest timer"`

### Task C4: Timed-exercise stopwatch *(Sonnet)*

**Files:** Create `src/components/session/SetRowTimer.tsx`; wire into the per-set row from C3.

`SetRowTimerProps = { set: SessionSet; disabled?: boolean }`. A small `ActionIcon` (`IconStopwatch`); tap → starts a local `setInterval` count-up shown as `m:ss` in place of the icon; tap again → stops and `updateSet(set.id, { durationSeconds })`; when `set.durationSeconds` exists show it as a dimmed `0:45` badge (tap to re-run). Pure component + service call — no store. This **consumes the `SessionSet.durationSeconds` placeholder** (plank use-case).

- [ ] **Step 1:** Implement + wire; gate; browser check: record a duration, reload, badge persists.
- [ ] **Step 2: USER CHECKPOINT** — `git commit -m "Per-set stopwatch for timed exercises"`

### Task C5: Drag-to-reorder *(Sonnet)*

**Files:** Modify `SessionScreen.tsx` (queued rows only) and `RoutineEditorScreen.tsx` items list (replace ↑/↓ buttons). `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`.

`DndContext` + `SortableContext verticalListSortingStrategy`; touch-friendly (`PointerSensor` with small activation distance so taps still expand); drag handle = `IconGripVertical` on the row's left edge. Session: only **queued** items are sortable (finished/active are pinned by the flow); on drop call `moveSessionItem(itemId, newPosition)` where newPosition maps to the item's target `sequencePosition` among all items. Routine editor: reorder the local `items` array on drop (state-only, saved on Save).

- [ ] **Step 1:** Implement both surfaces; gate; browser check: drag works with mouse + touch emulation, taps still expand cards.
- [ ] **Step 2: USER CHECKPOINT** — `git commit -m "Drag-to-reorder for session queue and routine editor"`

---

# PART D — Progress, Settings, cleanup

### Task D1: Progress screen *(Sonnet)*

**Files:** Rewrite `src/components/progress/ProgressScreen.tsx`, `ExercisePicker.tsx`, `HistoryList.tsx`, `PRBlock.tsx` containers; keep `BodyweightChart.tsx`, `SequenceChart.tsx`, `ConsistencyStrip.tsx` SVG internals (recolor via CSS variables `var(--mantine-color-actiGreen-6)` etc. so charts obey the scheme); delete replaced CSS.

Layout: `Stack` of `Card withBorder radius="lg"` sections (Consistency, Bodyweight, per-exercise: picker + PRs + sequence + history). ExercisePicker → Mantine `Select searchable`. PRBlock → two stat tiles (`Text size="xl" fw={700}` value + dimmed label). HistoryList → compact rows with set count / top set / volume.

- [ ] **Step 1:** Implement; gate; browser check light+dark (charts must recolor, not stay hardcoded).
- [ ] **Step 2: USER CHECKPOINT** — `git commit -m "Redesign progress screen"`

### Task D2: Settings screen *(Sonnet)*

**Files:** Rewrite `src/components/settings/SettingsScreen.tsx`, `ImportConfirmModal.tsx` (→ Mantine `Modal`); delete replaced CSS.

Grouped `Card withBorder` sections: **Preferences** (theme/units/draft-conflict/logging-mode → Mantine `SegmentedControl`s with labels + dimmed descriptions), **Data** (Export button, Import file button, snapshot list rows with date + summary + "Restore" `Button variant="light"`, storage-persistence note as dimmed text), **About** (version footer from `__APP_VERSION__`). All existing handlers/flows preserved verbatim.

- [ ] **Step 1:** Implement; gate; browser check light+dark; verify theme SegmentedControl flips the scheme instantly (A1's sync hook).
- [ ] **Step 2: USER CHECKPOINT** — `git commit -m "Redesign settings screen"`

### Task D3: Cleanup + full acceptance pass *(LEAD — no delegation)*

- [ ] **Step 1:** Delete `src/components/common/*` and all dead CSS once `grep -r "components/common" src/` is empty; remove dead tokens from the old CSS custom-property sheet (keep any still referenced by charts).
- [ ] **Step 2:** Copy sweep: grep for "Start exercise", "Quick exercise", stray v1 copy; fix per Global Constraints.
- [ ] **Step 3:** Manifest: set `theme_color` to match the light surface (`#f6f6f4`) + keep `background_color` dark? → decide with a quick check of installed-PWA look; update `vite.config.ts` manifest block accordingly.
- [ ] **Step 4:** Full gate: `npx tsc --noEmit` · `npx vitest run` · `npm run build`. Bundle-size note vs pre-Mantine baseline.
- [ ] **Step 5:** **Runtime PWA offline test (first ever):** `npm run preview`, load, devtools → offline, reload — app must boot and show data. Record result.
- [ ] **Step 6:** Browser acceptance walkthrough at 390×844, both schemes, all five screens + session flow end-to-end (activate → log → complete → float → finish).
- [ ] **Step 7:** Update `.superpowers/sdd/HANDOFF.md` + `progress.md`; remaining known work: real app icons, sync (spec §8).
- [ ] **Step 8: USER CHECKPOINT** — `git commit -m "Redesign cleanup, offline verification, acceptance pass"`

---

## Self-review notes

- Spec coverage: tap-to-activate/float/DNF (C1/C2), loggingMode gating + nested disclosure (C3), plank timer consuming `durationSeconds` (C4), drag-to-reorder (C5), dark+light everywhere (A1 + per-task checks), component library not hand-rolled (A1), copy normalization (B1/B3/D3), clock-aware due label (B3), time-of-day editor (B2), offline test + icons deferred-list (D3).
- Type consistency: `activateSessionItem`/`dnfSessionItem`/`applyAggregateSets`/`orderSessionItems`/`activationNumbers`/`itemPhase` defined in C1, consumed in C2/C3 with identical names; `useStartSession` defined B1, consumed B3.
- No placeholder steps: every UI task names exact Mantine components and behavior rules; service task has signatures + test list.
