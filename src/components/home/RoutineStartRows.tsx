import type { RoutineTemplate } from '../../domain/types';
import { Button } from '../common/Button';

// Shared row list for "start a routine" surfaces (Today section + the
// all-routines picker): per-row Start button, or checkboxes in multi-select
// mode. Selection state is owned by the caller.
export type RoutineStartRowsProps = {
  routines: RoutineTemplate[];
  doneIds?: Set<string>;
  suggestedId?: string;
  showCategory?: boolean;
  multiSelect: boolean;
  selectedIds: Set<string>;
  onToggleSelect(id: string): void;
  onStart(id: string): void;
};

export function RoutineStartRows({
  routines,
  doneIds,
  suggestedId,
  showCategory = false,
  multiSelect,
  selectedIds,
  onToggleSelect,
  onStart,
}: RoutineStartRowsProps) {
  return (
    <ul className="routine-rows">
      {routines.map((routine) => {
        const done = doneIds?.has(routine.id) ?? false;
        const checked = selectedIds.has(routine.id);

        const nameBlock = (
          <span className="routine-rows__name">
            {done ? (
              <span className="routine-rows__check" aria-hidden="true">
                &#10003;
              </span>
            ) : null}
            {routine.name}
            {done ? <span className="visually-hidden"> (done)</span> : null}
            {showCategory && routine.category ? (
              <span className="routine-rows__category">{routine.category}</span>
            ) : null}
            {routine.timeOfDay ? <span className="routine-rows__time">{routine.timeOfDay}</span> : null}
          </span>
        );

        return (
          <li key={routine.id} className="routine-rows__item">
            {multiSelect ? (
              <label className="routine-rows__checkbox-label">
                <input
                  type="checkbox"
                  className="routine-rows__checkbox"
                  checked={checked}
                  onChange={() => onToggleSelect(routine.id)}
                />
                {nameBlock}
              </label>
            ) : (
              nameBlock
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
  );
}
