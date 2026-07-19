import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Autocomplete } from '@mantine/core';
import type { ExerciseCatalogEntry } from '../../domain/types';
import { searchExercises } from '../../services/exercise-service';

const DEBOUNCE_MS = 150;

// Reused by the Session screen (Task 11) — keep the prop contract stable.
export type ExerciseTypeaheadProps = {
  onPick(name: string): void;
  placeholder?: string;
};

export function ExerciseTypeahead({ onPick, placeholder }: ExerciseTypeaheadProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ExerciseCatalogEntry[]>([]);
  const timerRef = useRef<number | undefined>(undefined);
  const lastCommitRef = useRef(0);

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

  function commit(name: string) {
    const trimmed = name.trim();
    if (trimmed === '') {
      return;
    }
    // A single Enter press can reach commit via both onOptionSubmit (when a
    // suggestion is keyboard-highlighted) and our own onKeyDown fallback —
    // Mantine doesn't let a consumer suppress one in favor of the other.
    // Collapse any second commit within the same interaction into a no-op;
    // whichever call lands first wins (the highlighted option, if any).
    const now = Date.now();
    if (now - lastCommitRef.current < 250) {
      return;
    }
    lastCommitRef.current = now;
    onPick(trimmed);
    setQuery('');
    setSuggestions([]);
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
      commit(query);
    } else if (event.key === 'Escape') {
      setSuggestions([]);
    }
  }

  return (
    <Autocomplete
      value={query}
      onChange={setQuery}
      onOptionSubmit={commit}
      onKeyDown={handleKeyDown}
      data={suggestions.map((suggestion) => suggestion.canonicalName)}
      placeholder={placeholder ?? 'Add exercise'}
      aria-label={placeholder ?? 'Add exercise'}
    />
  );
}
