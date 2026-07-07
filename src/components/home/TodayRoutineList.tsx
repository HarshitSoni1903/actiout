import type { RoutineTemplate } from '../../domain/types';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { RoutineStartRows } from './RoutineStartRows';

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

      <RoutineStartRows
        routines={routines}
        doneIds={doneIds}
        suggestedId={suggestedId}
        multiSelect={multiSelect}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        onStart={onStart}
      />

      {multiSelect ? (
        <Button variant="primary" disabled={selectedIds.size === 0} onClick={onStartSelected}>
          Start selected
        </Button>
      ) : null}
    </section>
  );
}
