import { useMemo, useState } from 'react';
import { EmptyState } from '../common/EmptyState';

export type ExercisePickerProps = {
  exercises: string[];
  selected: string | null;
  onSelect(name: string): void;
};

export function ExercisePicker({ exercises, selected, onSelect }: ExercisePickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === '') {
      return exercises;
    }
    return exercises.filter((name) => name.toLowerCase().includes(trimmed));
  }, [exercises, query]);

  if (exercises.length === 0) {
    return <EmptyState title="No logged exercises yet" description="Complete a workout to see progress here." />;
  }

  return (
    <div className="exercise-picker">
      <input
        type="text"
        className="exercise-picker__search"
        placeholder="Search exercises"
        aria-label="Search exercises"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="exercise-picker__list">
        {filtered.map((name) => (
          <li key={name}>
            <button
              type="button"
              className={`exercise-picker__item${name === selected ? ' exercise-picker__item--active' : ''}`}
              aria-pressed={name === selected}
              onClick={() => onSelect(name)}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
      {filtered.length === 0 ? <p className="exercise-picker__no-match">No matches.</p> : null}
    </div>
  );
}
