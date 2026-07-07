import { useState } from 'react';
import type { RoutineTemplate } from '../../domain/types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { RoutineStartRows } from './RoutineStartRows';

// Lists ALL routines (not just today's) so any routine can be started from
// Home. Owns its own multi-select state; starting delegates to the caller
// (which runs the shared attemptStart conflict flow) and resets the picker.
export type RoutinePickerModalProps = {
  open: boolean;
  routines: RoutineTemplate[];
  onStart(routineTemplateIds: string[]): void;
  onClose(): void;
};

export function RoutinePickerModal({ open, routines, onStart, onClose }: RoutinePickerModalProps) {
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const reset = () => {
    setMultiSelect(false);
    setSelectedIds(new Set());
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleStart = (ids: string[]) => {
    reset();
    onStart(ids);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Modal open={open} title="Start a workout" onClose={handleClose}>
      {routines.length === 0 ? (
        <p className="routine-picker__empty">No routines yet.</p>
      ) : (
        <>
          <div className="routine-picker__header">
            <button
              type="button"
              className="routine-picker__select-link"
              onClick={() => {
                setMultiSelect((prev) => !prev);
                setSelectedIds(new Set());
              }}
            >
              {multiSelect ? 'Cancel' : 'Select multiple'}
            </button>
          </div>

          <RoutineStartRows
            routines={routines}
            showCategory
            multiSelect={multiSelect}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelected}
            onStart={(id) => handleStart([id])}
          />

          {multiSelect ? (
            <Button
              variant="primary"
              className="routine-picker__start-selected"
              disabled={selectedIds.size === 0}
              onClick={() => handleStart(Array.from(selectedIds))}
            >
              Start selected
            </Button>
          ) : null}
        </>
      )}
    </Modal>
  );
}
