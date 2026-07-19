import { useState } from 'react';
import { Anchor, Button, Modal, Stack, Text } from '@mantine/core';
import type { RoutineTemplate } from '../../domain/types';
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
    <Modal opened={open} onClose={handleClose} title="Start a workout">
      {routines.length === 0 ? (
        <Text c="dimmed" size="sm">
          No routines yet.
        </Text>
      ) : (
        <Stack gap="md">
          <Anchor
            component="button"
            type="button"
            size="sm"
            c="dimmed"
            style={{ alignSelf: 'flex-end' }}
            onClick={() => {
              setMultiSelect((prev) => !prev);
              setSelectedIds(new Set());
            }}
          >
            {multiSelect ? 'Cancel' : 'Select multiple'}
          </Anchor>

          <RoutineStartRows
            routines={routines}
            showCategory
            multiSelect={multiSelect}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelected}
            onStart={(id) => handleStart([id])}
          />

          {multiSelect ? (
            <Button size="lg" fullWidth disabled={selectedIds.size === 0} onClick={() => handleStart(Array.from(selectedIds))}>
              Start selected
            </Button>
          ) : null}
        </Stack>
      )}
    </Modal>
  );
}
