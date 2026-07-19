import { Anchor, Button, Group, Stack, Text, Title } from '@mantine/core';
import type { RoutineTemplate } from '../../domain/types';
import { summaryLine } from '../routines/routine-summary';
import { RoutineStartRows } from './RoutineStartRows';

export type TodayRoutineListProps = {
  routines: RoutineTemplate[];
  doneIds: Set<string>;
  suggestedId?: string;
  dueLabel?: string;
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
  dueLabel,
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
      <Stack gap="md">
        <Text size="sm" fw={700} c="dimmed" tt="uppercase">
          Today
        </Text>
        <Text c="dimmed" size="sm">
          Nothing scheduled.
        </Text>
        <Button size="lg" fullWidth onClick={onStartAWorkout}>
          Start a workout
        </Button>
      </Stack>
    );
  }

  // The suggested routine (due-order's first unfinished one) gets pulled out
  // into a hero block; the rest render as compact rows. In multi-select mode
  // every routine — including the suggested one — becomes a plain checkbox row.
  const showHero = !multiSelect && suggestedId !== undefined;
  const suggested = showHero ? routines.find((routine) => routine.id === suggestedId) : undefined;
  const rowRoutines = suggested ? routines.filter((routine) => routine.id !== suggestedId) : routines;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={700} c="dimmed" tt="uppercase">
          Today
        </Text>
        <Anchor component="button" type="button" size="sm" c="dimmed" onClick={onToggleMultiSelect}>
          {multiSelect ? 'Cancel' : 'Select multiple'}
        </Anchor>
      </Group>

      {suggested ? (
        <Stack gap={4}>
          {dueLabel ? (
            <Text size="xs" c="dimmed">
              {dueLabel}
            </Text>
          ) : null}
          <Title order={2}>{suggested.name}</Title>
          {suggested.items.length > 0 ? (
            <Text c="dimmed" size="sm">
              {summaryLine(suggested)}
            </Text>
          ) : null}
          <Button size="xl" fullWidth mt="sm" onClick={() => onStart(suggested.id)}>
            Start workout
          </Button>
        </Stack>
      ) : null}

      {rowRoutines.length > 0 ? (
        <RoutineStartRows
          routines={rowRoutines}
          doneIds={doneIds}
          multiSelect={multiSelect}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onStart={onStart}
        />
      ) : null}

      {multiSelect ? (
        <Button size="lg" fullWidth disabled={selectedIds.size === 0} onClick={onStartSelected}>
          Start selected
        </Button>
      ) : null}
    </Stack>
  );
}
