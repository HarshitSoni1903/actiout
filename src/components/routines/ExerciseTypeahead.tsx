import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
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
  const listboxId = useId();
  const timerRef = useRef<number | undefined>(undefined);

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
    onPick(trimmed);
    setQuery('');
    setSuggestions([]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      // Enter always accepts the typed text verbatim, even if suggestions
      // are showing — tapping a suggestion is the only way to pick one.
      event.preventDefault();
      commit(query);
    } else if (event.key === 'Escape') {
      setSuggestions([]);
    }
  }

  return (
    <div className="exercise-typeahead">
      <input
        type="text"
        className="exercise-typeahead__input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Add exercise'}
        aria-label={placeholder ?? 'Add exercise'}
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
      />
      {suggestions.length > 0 ? (
        <ul className="exercise-typeahead__suggestions" role="listbox" id={listboxId}>
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="exercise-typeahead__suggestion"
                onClick={() => commit(suggestion.canonicalName)}
              >
                {suggestion.canonicalName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
