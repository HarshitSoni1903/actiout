import type { ReactNode } from 'react';
import { ActionIcon, Box, Checkbox, Group, NumberInput, SegmentedControl, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { MeasurementType, SessionSet, WeightUnit } from '../../domain/types';

export type SetRowPatch = Partial<
  Pick<
    SessionSet,
    'reps' | 'weight' | 'weightUnit' | 'isWarmup' | 'completed' | 'durationSeconds' | 'distance' | 'distanceUnit'
  >
>;

export type SetRowProps = {
  set: SessionSet;
  // Resolved from the item's measurementTypeSnapshot; decides which inputs render.
  measurementType: MeasurementType;
  // Unit shown for a distance set that has none stored yet.
  preferenceDistanceUnit: 'mi' | 'km';
  onChange(patch: SetRowPatch): void;
  onRemove(): void;
  // SetRowTimer (per-set stopwatch → durationSeconds). For the timed types it
  // renders next to the duration field it writes.
  timerSlot?: ReactNode;
};

// One editable set. Inputs follow the measurement type: the measured quantity
// leads the first row (reps, duration, or distance), weight stays available for
// every type but is demoted to its own row outside weight_reps/reps. Compact
// stacked rows so nothing overflows at 320px.
export function SetRow({
  set,
  measurementType,
  preferenceDistanceUnit,
  onChange,
  onRemove,
  timerSlot,
}: SetRowProps) {
  const showReps = measurementType === 'weight_reps' || measurementType === 'reps';
  const showDuration = measurementType === 'duration' || measurementType === 'distance_duration';
  const showDistance = measurementType === 'distance_duration';
  const gutter = <Box style={{ width: 14, flexShrink: 0 }} />;

  const weightInputs = (
    <>
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
    </>
  );

  // Typed entry for a set finished away from the app (or a correction); the
  // stopwatch next to it writes the same field live.
  const durationInputs = (
    <>
      <NumberInput
        size="xs"
        aria-label={`Set ${set.setNumber} duration in seconds`}
        placeholder="Seconds"
        value={set.durationSeconds}
        onChange={(value) => onChange({ durationSeconds: typeof value === 'number' ? value : undefined })}
        min={0}
        step={5}
        allowDecimal={false}
        style={{ flex: 1, minWidth: 0 }}
      />
      {timerSlot}
    </>
  );

  return (
    <Box>
      <Group gap="xs" wrap="nowrap" align="flex-end">
        <Text size="xs" c="dimmed" fw={700} style={{ width: 14, flexShrink: 0 }}>
          {set.setNumber}
        </Text>
        {showReps ? (
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
        ) : null}
        {showDistance ? (
          <>
            <NumberInput
              size="xs"
              aria-label={`Set ${set.setNumber} distance`}
              placeholder="Distance"
              value={set.distance}
              onChange={(value) => onChange({ distance: typeof value === 'number' ? value : undefined })}
              min={0}
              step={0.1}
              decimalScale={2}
              style={{ flex: 1, minWidth: 0 }}
            />
            <SegmentedControl
              size="xs"
              data={['mi', 'km']}
              value={set.distanceUnit ?? preferenceDistanceUnit}
              onChange={(value) => onChange({ distanceUnit: value as 'mi' | 'km' })}
            />
          </>
        ) : null}
        {measurementType === 'duration' ? durationInputs : null}
        {showReps ? weightInputs : null}
      </Group>

      {showDistance ? (
        <Group gap="xs" wrap="nowrap" align="flex-end" mt={4}>
          {gutter}
          {durationInputs}
        </Group>
      ) : null}

      {showDuration ? (
        <Group gap="xs" wrap="nowrap" align="flex-end" mt={4}>
          {gutter}
          {weightInputs}
        </Group>
      ) : null}

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
          {showDuration ? null : timerSlot}
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
