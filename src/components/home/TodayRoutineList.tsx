import type { RoutineTemplate } from '../../domain/types';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';

export type TodayRoutineListProps = {
  routines: RoutineTemplate[];
  doneIds: Set<string>;
  suggestedId?: string;
  multiSelect: boolean;
  selectedIds: Set<string>;
  onToggleSelect(id: string): void;
  onStart(id: string): void;
  onToggleMultiSelect(): void;
  onStartSelected(): void;
  onStartAWorkout(): void;
};

export function TodayRoutineList({
  routines,
  doneIds,
  suggestedId,
  multiSelect,
  selectedIds,
  onToggleSelect,
  onStart,
  onToggleMultiSelect,
  onStartSelected,
  onStartAWorkout,
}: TodayRoutineListProps) {
  if (routines.length === 0) {
    return (
      <section className="today-list">
        <h2 className="today-list__heading">Today</h2>
        <EmptyState
          title="Nothing scheduled."
          action={
            <Button variant="primary" onClick={onStartAWorkout}>
              Start a workout
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section className="today-list">
      <div className="today-list__header">
        <h2 className="today-list__heading">Today</h2>
        <button type="button" className="today-list__select-link" onClick={onToggleMultiSelect}>
          {multiSelect ? 'Cancel' : 'Select multiple'}
        </button>
      </div>

      <ul className="today-list__items">
        {routines.map((routine) => {
          const done = doneIds.has(routine.id);
          const checked = selectedIds.has(routine.id);

          return (
            <li key={routine.id} className="today-list__item">
              {multiSelect ? (
                <label className="today-list__checkbox-label">
                  <input
                    type="checkbox"
                    className="today-list__checkbox"
                    checked={checked}
                    onChange={() => onToggleSelect(routine.id)}
                  />
                  <span className="today-list__name">{routine.name}</span>
                </label>
              ) : (
                <span className="today-list__name">
                  {done ? (
                    <span className="today-list__check" aria-hidden="true">
                      &#10003;
                    </span>
                  ) : null}
                  {routine.name}
                  {done ? <span className="visually-hidden"> (done)</span> : null}
                </span>
              )}

              {!multiSelect ? (
                <Button
                  variant={routine.id === suggestedId ? 'primary' : 'ghost'}
                  onClick={() => onStart(routine.id)}
                >
                  Start
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {multiSelect ? (
        <Button variant="primary" disabled={selectedIds.size === 0} onClick={onStartSelected}>
          Start selected
        </Button>
      ) : null}
    </section>
  );
}
