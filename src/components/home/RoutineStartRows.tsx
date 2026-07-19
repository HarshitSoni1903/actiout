import { Badge, Button, Checkbox, Group, Stack, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import type { RoutineTemplate } from '../../domain/types';
import { summaryLine } from '../routines/routine-summary';

// Shared row list for "start a routine" surfaces (Today section + the
// all-routines picker): per-row Start button, or checkboxes in multi-select
// mode. Selection state is owned by the caller.
export type RoutineStartRowsProps = {
  routines: RoutineTemplate[];
  doneIds?: Set<string>;
  showCategory?: boolean;
  multiSelect: boolean;
  selectedIds: Set<string>;
  onToggleSelect(id: string): void;
  onStart(id: string): void;
};

export function RoutineStartRows({
  routines,
  doneIds,
  showCategory = false,
  multiSelect,
  selectedIds,
  onToggleSelect,
  onStart,
}: RoutineStartRowsProps) {
  return (
    <Stack gap="sm">
      {routines.map((routine) => {
        const done = doneIds?.has(routine.id) ?? false;
        const checked = selectedIds.has(routine.id);

        const nameBlock = (
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Group gap={6} wrap="nowrap">
              {done ? <IconCheck size={16} color="var(--mantine-color-actiGreen-filled)" aria-hidden="true" /> : null}
              <Text fw={600} truncate style={{ flex: 1, minWidth: 0 }}>
                {routine.name}
                {done ? <span className="visually-hidden"> (done)</span> : null}
              </Text>
              {showCategory && routine.category ? (
                <Badge variant="light" color="gray" size="sm">
                  {routine.category}
                </Badge>
              ) : null}
              {routine.timeOfDay ? (
                <Badge variant="light" color="gray" size="sm">
                  {routine.timeOfDay}
                </Badge>
              ) : null}
            </Group>
            {routine.items.length > 0 ? (
              <Text size="xs" c="dimmed" truncate>
                {summaryLine(routine)}
              </Text>
            ) : null}
          </Stack>
        );

        return (
          <Group key={routine.id} justify="space-between" align="flex-start" wrap="nowrap">
            {multiSelect ? (
              <Checkbox
                checked={checked}
                onChange={() => onToggleSelect(routine.id)}
                label={nameBlock}
                styles={{ body: { alignItems: 'flex-start', flex: 1, minWidth: 0 }, labelWrapper: { flex: 1, minWidth: 0 } }}
              />
            ) : (
              nameBlock
            )}

            {!multiSelect ? (
              <Button size="lg" onClick={() => onStart(routine.id)}>
                Start
              </Button>
            ) : null}
          </Group>
        );
      })}
    </Stack>
  );
}
