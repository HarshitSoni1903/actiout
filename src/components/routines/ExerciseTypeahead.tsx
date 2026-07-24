import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Autocomplete, Button, Group, Select, Stack, Text } from '@mantine/core';
import type { ExerciseCatalogEntry, ExerciseCategory, MeasurementType } from '../../domain/types';
import type { EnsureExerciseOptions } from '../../services/exercise-service';
import { listExercises, searchExercises } from '../../services/exercise-service';
import { CATEGORY_SELECT_OPTIONS, findExactMatch, groupByCategory } from './exercise-typeahead-logic';

const DEBOUNCE_MS = 150;

const MEASUREMENT_TYPE_OPTIONS: Array<{ value: MeasurementType; label: string }> = [
  { value: 'weight_reps', label: 'Weight & reps' },
  { value: 'reps', label: 'Reps' },
  { value: 'duration', label: 'Duration' },
  { value: 'distance_duration', label: 'Distance & time' },
];

// Reused by the Session screen (Task 11) — keep the prop contract stable.
// `opts` carries the resolved measurementType/category for BOTH an existing
// catalog match (values come from the matched entry) and a brand-new custom
// exercise (values come from the inline picker below) so callers can seed
// their local row immediately, without waiting on a reload.
export type ExerciseTypeaheadProps = {
  onPick(name: string, opts?: EnsureExerciseOptions): void;
  placeholder?: string;
};

export function ExerciseTypeahead({ onPick, placeholder }: ExerciseTypeaheadProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ExerciseCatalogEntry[]>([]);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [pendingMeasurementType, setPendingMeasurementType] = useState<MeasurementType>('weight_reps');
  const [pendingCategory, setPendingCategory] = useState<ExerciseCategory | undefined>(undefined);
  const timerRef = useRef<number | undefined>(undefined);
  const lastCommitRef = useRef(0);
  // Bumped on every commit attempt (typed or option-picked); a commitTyped
  // lookup that resolves after being superseded by a newer attempt discards
  // its own result instead of committing a possibly-stale decision.
  const commitTokenRef = useRef(0);

  const groupedSuggestions = useMemo(() => groupByCategory(suggestions), [suggestions]);

  useEffect(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }

    const trimmed = query.trim();
    if (trimmed === '') {
      setSuggestions([]);
      return;
    }

    timerRef.current = window.setTimeout(() => {
      void searchExercises(trimmed, 8).then(setSuggestions);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [query]);

  function resetInput() {
    setQuery('');
    setSuggestions([]);
  }

  // A single Enter press can reach here via both onOptionSubmit (when a
  // suggestion is keyboard-highlighted) and our own onKeyDown fallback —
  // Mantine doesn't let a consumer suppress one in favor of the other.
  // Collapse any second commit within the same interaction into a no-op;
  // whichever call lands first wins (the highlighted option, if any).
  function finalizeCommit(name: string, matched: ExerciseCatalogEntry | undefined) {
    const now = Date.now();
    if (now - lastCommitRef.current < 250) {
      return;
    }
    lastCommitRef.current = now;

    if (matched) {
      onPick(matched.canonicalName, { measurementType: matched.measurementType, category: matched.category });
      resetInput();
      return;
    }

    // Brand-new exercise — hold off on onPick until the user confirms a
    // measurement type (and optional category) below.
    setPendingMeasurementType('weight_reps');
    setPendingCategory(undefined);
    setPendingName(name);
    resetInput();
  }

  // Fired by Mantine when a listed suggestion is chosen (click or
  // keyboard-highlighted Enter) — value is always an existing entry's name.
  function commitOption(value: string) {
    const matched = suggestions.find((entry) => entry.canonicalName === value);
    if (!matched) {
      // Should be unreachable — the Autocomplete's options are derived from
      // `suggestions` itself — but on a miss, degrade into the authoritative
      // lookup rather than silently opening the new-exercise picker for what
      // might actually be an existing exercise.
      void commitTyped(value);
      return;
    }
    // Invalidate any in-flight commitTyped lookup so its later resolution
    // can't overwrite this decisive, synchronous pick.
    commitTokenRef.current += 1;
    finalizeCommit(value, matched);
  }

  // Fired for raw typed text (Enter with nothing highlighted). Resolves the
  // existing-vs-new decision authoritatively against the *full* catalog
  // (listExercises), never against the debounced/ranked/limited `suggestions`
  // state — that state can be empty (fast paste before the debounce timer
  // fires) or missing an exact match ranked outside searchExercises' 8-item
  // slice, both of which would otherwise open the new-exercise picker for an
  // exercise that already exists.
  async function commitTyped(name: string) {
    const trimmed = name.trim();
    if (trimmed === '') {
      return;
    }

    const token = ++commitTokenRef.current;
    const allEntries = await listExercises();
    if (commitTokenRef.current !== token) {
      // A newer commit attempt (typed or option-picked) started while this
      // lookup was in flight — abandon rather than act on a stale decision.
      return;
    }
    const matched = findExactMatch(trimmed, allEntries);
    finalizeCommit(trimmed, matched);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      // Enter accepts the typed text verbatim — unless an option is actively
      // highlighted (keyboard-navigated), in which case Mantine's
      // onOptionSubmit will fire with that option's value and the raw-text
      // commit here must yield to it (aria-activedescendant is how Mantine
      // marks a highlighted option on the input).
      if (event.currentTarget.getAttribute('aria-activedescendant')) {
        return;
      }
      event.preventDefault();
      void commitTyped(query);
    } else if (event.key === 'Escape') {
      setSuggestions([]);
    }
  }

  function confirmNew() {
    if (pendingName === null) {
      return;
    }
    onPick(pendingName, { measurementType: pendingMeasurementType, category: pendingCategory });
    setPendingName(null);
  }

  function cancelNew() {
    setPendingName(null);
  }

  if (pendingName !== null) {
    return (
      <Stack gap="xs">
        <Text size="sm">
          New exercise: <strong>{pendingName}</strong>
        </Text>
        <Select
          label="Type"
          data={MEASUREMENT_TYPE_OPTIONS}
          value={pendingMeasurementType}
          onChange={(value) => setPendingMeasurementType((value as MeasurementType) ?? 'weight_reps')}
          allowDeselect={false}
        />
        <Select
          label="Category"
          placeholder="None"
          clearable
          data={CATEGORY_SELECT_OPTIONS}
          value={pendingCategory ?? null}
          onChange={(value) => setPendingCategory((value as ExerciseCategory) ?? undefined)}
        />
        <Group gap="xs">
          <Button size="xs" onClick={confirmNew}>
            Add exercise
          </Button>
          <Button size="xs" variant="subtle" onClick={cancelNew}>
            Cancel
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Autocomplete
      value={query}
      onChange={setQuery}
      onOptionSubmit={commitOption}
      onKeyDown={handleKeyDown}
      data={groupedSuggestions}
      placeholder={placeholder ?? 'Add exercise'}
      aria-label={placeholder ?? 'Add exercise'}
    />
  );
}
