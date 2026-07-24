import type { ReactNode } from 'react';
import { ActionIcon, Card, Group, NumberInput, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { MeasurementType, WeightUnit } from '../../domain/types';

export type RoutineItemRowValue = {
  exerciseName: string;
  measurementType?: MeasurementType;
  defaultSets?: number;
  defaultReps?: number;
  defaultWeight?: number;
  defaultWeightUnit?: WeightUnit;
  defaultDurationSeconds?: number;
  restSeconds?: number;
  notes?: string;
};

export type RoutineItemRowProps = {
  item: RoutineItemRowValue;
  position: number;
  weightUnit: WeightUnit;
  onChange(patch: Partial<RoutineItemRowValue>): void;
  onRemove(): void;
  // Drag handle rendered at the left of the header, before the position
  // number; listeners/attributes live on the handle so the row's inputs
  // (and the drag itself) don't fight each other.
  dragHandle?: ReactNode;
};

export function RoutineItemRow({
  item,
  position,
  weightUnit,
  onChange,
  onRemove,
  dragHandle,
}: RoutineItemRowProps) {
  const effectiveWeightUnit = item.defaultWeightUnit ?? weightUnit;
  // Catalog-decided type: which default fields make sense for this exercise.
  // No per-item toggle — the editor only reflects the resolved type.
  const measurementType = item.measurementType ?? 'weight_reps';
  const showReps = measurementType === 'weight_reps' || measurementType === 'reps';
  const showDuration = measurementType === 'duration';
  const showWeight = measurementType !== 'distance_duration';

  return (
    <Card withBorder radius="lg" padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            {dragHandle}
            <Text size="xs" c="dimmed" fw={700}>
              {position}
            </Text>
            <Text fw={600} truncate>
              {item.exerciseName}
            </Text>
          </Group>

          <Group gap={4} wrap="nowrap">
            <ActionIcon
              color="red"
              variant="subtle"
              aria-label={`Remove ${item.exerciseName}`}
              onClick={onRemove}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        </Group>

        <Group grow gap="sm">
          <NumberInput
            label="Sets"
            value={item.defaultSets}
            onChange={(value) => onChange({ defaultSets: typeof value === 'number' ? value : undefined })}
            min={0}
            step={1}
            allowDecimal={false}
          />
          {showReps ? (
            <NumberInput
              label="Reps"
              value={item.defaultReps}
              onChange={(value) => onChange({ defaultReps: typeof value === 'number' ? value : undefined })}
              min={0}
              step={1}
              allowDecimal={false}
            />
          ) : null}
          {showDuration ? (
            <NumberInput
              label="Duration (s)"
              value={item.defaultDurationSeconds}
              onChange={(value) =>
                onChange({ defaultDurationSeconds: typeof value === 'number' ? value : undefined })
              }
              min={0}
              step={5}
              allowDecimal={false}
            />
          ) : null}
        </Group>

        {showWeight ? (
          <Group align="flex-end" gap="sm" wrap="nowrap">
            <NumberInput
              label={`Weight (${effectiveWeightUnit})`}
              value={item.defaultWeight}
              onChange={(value) =>
                onChange({
                  defaultWeight: typeof value === 'number' ? value : undefined,
                  defaultWeightUnit: typeof value === 'number' ? effectiveWeightUnit : undefined,
                })
              }
              min={0}
              step={effectiveWeightUnit === 'kg' ? 1 : 5}
              style={{ flex: 1 }}
            />
            <SegmentedControl
              data={['lb', 'kg']}
              value={effectiveWeightUnit}
              onChange={(value) => onChange({ defaultWeightUnit: value as WeightUnit })}
            />
          </Group>
        ) : null}

        <NumberInput
          label="Rest (s)"
          value={item.restSeconds}
          onChange={(value) => onChange({ restSeconds: typeof value === 'number' ? value : undefined })}
          min={0}
          step={15}
          allowDecimal={false}
        />

        <Textarea
          label="Notes"
          autosize
          minRows={2}
          value={item.notes ?? ''}
          onChange={(event) => onChange({ notes: event.currentTarget.value === '' ? undefined : event.currentTarget.value })}
        />
      </Stack>
    </Card>
  );
}
