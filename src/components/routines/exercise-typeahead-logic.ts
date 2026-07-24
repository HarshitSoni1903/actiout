import type { ComboboxItemGroup } from '@mantine/core';
import type { ExerciseCatalogEntry, ExerciseCategory } from '../../domain/types';
import { normalizeExerciseName } from '../../utils';

// Pure logic extracted out of ExerciseTypeahead so it can be unit-tested with
// plain vitest — no React, no Dexie (mirrors the SetRowTimer.ts /
// aggregate-prefill.ts pattern used elsewhere in this codebase). Importing
// normalizeExerciseName is safe here — it's a zero-dependency string util
// (src/utils/index.ts), not the Dexie-touching exercise-service module.

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  cardio: 'Cardio',
  other: 'Other',
};

export const CATEGORY_SELECT_OPTIONS = (Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

// Groups catalog entries by category (missing category -> "Other"),
// preserving the relevance order the caller's entries already came ranked
// in — the first category encountered becomes the first group, and items
// within a group keep their original relative order.
export function groupByCategory(entries: ExerciseCatalogEntry[]): ComboboxItemGroup[] {
  const order: string[] = [];
  const byGroup = new Map<string, ExerciseCatalogEntry[]>();
  for (const entry of entries) {
    const label = CATEGORY_LABELS[entry.category ?? 'other'];
    if (!byGroup.has(label)) {
      byGroup.set(label, []);
      order.push(label);
    }
    byGroup.get(label)!.push(entry);
  }
  return order.map((label) => ({
    group: label,
    items: byGroup.get(label)!.map((entry) => ({ value: entry.canonicalName, label: entry.canonicalName })),
  }));
}

// Authoritative "does this typed name already exist" check: an exact
// (normalized) match against a *complete* entries list. Callers must supply
// a full, un-truncated list (e.g. exercise-service.ts's listExercises) —
// never the typeahead's own debounced/ranked/limited suggestions, which is
// exactly what let this check silently miss an existing exercise before.
export function findExactMatch(
  typedName: string,
  entries: ExerciseCatalogEntry[]
): ExerciseCatalogEntry | undefined {
  const normalized = normalizeExerciseName(typedName);
  if (normalized === '') {
    return undefined;
  }
  return entries.find((entry) => entry.normalizedName === normalized);
}
