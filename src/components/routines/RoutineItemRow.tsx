import { ActionIcon, Card, Group, NumberInput, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconTrash } from '@tabler/icons-react';
import type { WeightUnit } from '../../domain/types';

export type RoutineItemRowValue = {
  exerciseName: string;
  defaultSets?: number;
  defaultReps?: number;
  defaultWeight?: number;
  defaultWeightUnit?: WeightUnit;
  restSeconds?: number;
  notes?: string;
};

export type RoutineItemRowProps = {
  item: RoutineItemRowValue;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  weightUnit: WeightUnit;
  onChange(patch: Partial<RoutineItemRowValue>): void;
  onMoveUp(): void;
  onMoveDown(): void;
  onRemove(): void;
};

export function RoutineItemRow({
  item,
  position,
  isFirst,
  isLast,
  weightUnit,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: RoutineItemRowProps) {
  const effectiveWeightUnit = item.defaultWeightUnit ?? weightUnit;

  return (
    <Card withBorder radius="lg" padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Text size="xs" c="dimmed" fw={700}>
              {position}
            </Text>
            <Text fw={600} truncate>
              {item.exerciseName}
            </Text>
          </Group>

          <Group gap={4} wrap="nowrap">
            <ActionIcon
              variant="subtle"
              aria-label={`Move ${item.exerciseName} up`}
              disabled={isFirst}
              onClick={onMoveUp}
            >
              <IconChevronUp size={18} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              aria-label={`Move ${item.exerciseName} down`}
              disabled={isLast}
              onClick={onMoveDown}
            >
              <IconChevronDown size={18} />
            </ActionIcon>
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
          <NumberInput
            label="Reps"
            value={item.defaultReps}
            onChange={(value) => onChange({ defaultReps: typeof value === 'number' ? value : undefined })}
            min={0}
            step={1}
            allowDecimal={false}
          />
        </Group>

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
