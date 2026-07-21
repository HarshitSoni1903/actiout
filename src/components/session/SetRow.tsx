import type { ReactNode } from 'react';
import { ActionIcon, Box, Checkbox, Group, NumberInput, SegmentedControl, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { SessionSet, WeightUnit } from '../../domain/types';

export type SetRowPatch = Partial<Pick<SessionSet, 'reps' | 'weight' | 'weightUnit' | 'isWarmup' | 'completed'>>;

export type SetRowProps = {
  set: SessionSet;
  onChange(patch: SetRowPatch): void;
  onRemove(): void;
  // C4 mount point: SetRowTimer (per-set stopwatch → durationSeconds) lands here,
  // rendered next to the reps/weight inputs. Empty until C4.
  timerSlot?: ReactNode;
};

// One editable set: reps / weight / unit inputs on top, warmup + done + remove
// below. Two compact rows so it never overflows horizontally at 320px.
export function SetRow({ set, onChange, onRemove, timerSlot }: SetRowProps) {
  return (
    <Box>
      <Group gap="xs" wrap="nowrap" align="flex-end">
        <Text size="xs" c="dimmed" fw={700} style={{ width: 14, flexShrink: 0 }}>
          {set.setNumber}
        </Text>
        <NumberInput
          size="xs"
          aria-label={`Set ${set.setNumber} reps`}
          placeholder="Reps"
          value={set.reps}
          onChange={(value) => onChange({ reps: typeof value === 'number' ? value : undefined })}
          min={0}
          step={1}
          allowDecimal={false}
          style={{ flex: 1, minWidth: 0 }}
        />
        <NumberInput
          size="xs"
          aria-label={`Set ${set.setNumber} weight`}
          placeholder="Weight"
          value={set.weight}
          onChange={(value) => onChange({ weight: typeof value === 'number' ? value : undefined })}
          min={0}
          step={set.weightUnit === 'kg' ? 1 : 5}
          style={{ flex: 1, minWidth: 0 }}
        />
        <SegmentedControl
          size="xs"
          data={['lb', 'kg']}
          value={set.weightUnit}
          onChange={(value) => onChange({ weightUnit: value as WeightUnit })}
        />
      </Group>

      <Group gap="sm" wrap="nowrap" justify="space-between" mt={4}>
        <Group gap="sm" wrap="nowrap">
          <Checkbox
            size="xs"
            label="Warmup"
            checked={set.isWarmup}
            onChange={(event) => onChange({ isWarmup: event.currentTarget.checked })}
          />
          <Checkbox
            size="xs"
            label="Done"
            checked={set.completed}
            onChange={(event) => onChange({ completed: event.currentTarget.checked })}
          />
          {timerSlot}
        </Group>
        <ActionIcon
          color="red"
          variant="subtle"
          size="sm"
          aria-label={`Remove set ${set.setNumber}`}
          onClick={onRemove}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    </Box>
  );
}
