import { useState } from 'react';
import { Button, Card, Group, NumberInput, Text } from '@mantine/core';
import type { WeightUnit } from '../../domain/types';
import { convertWeight, formatWeight } from '../../domain/units';
import { formatShortDate } from '../../utils';

export type BodyweightQuickAddProps = {
  latestValue?: number;
  latestUnit?: WeightUnit;
  latestDate?: string;
  preferredUnit: WeightUnit;
  onSave(value: number): Promise<void> | void;
};

export function BodyweightQuickAdd({
  latestValue,
  latestUnit,
  latestDate,
  preferredUnit,
  onSave,
}: BodyweightQuickAddProps) {
  const [value, setValue] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const displayValue =
    latestValue !== undefined && latestUnit !== undefined
      ? latestUnit === preferredUnit
        ? latestValue
        : convertWeight(latestValue, latestUnit, preferredUnit)
      : undefined;

  const summary =
    displayValue !== undefined && latestDate
      ? `Latest: ${formatWeight(displayValue, preferredUnit)} · ${formatShortDate(latestDate)}`
      : 'No entries yet';

  const handleSave = async () => {
    if (value === undefined || !(value > 0)) {
      return;
    }
    setSaving(true);
    try {
      await onSave(value);
      setValue(undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card withBorder radius="lg" padding="md">
      <Text size="sm" fw={600}>
        Bodyweight
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        {summary}
      </Text>
      <Group align="flex-end" gap="sm" wrap="nowrap">
        <NumberInput
          label={`Weight (${preferredUnit})`}
          value={value}
          onChange={(next) => setValue(typeof next === 'number' ? next : undefined)}
          min={1}
          step={0.5}
          style={{ flex: 1 }}
        />
        <Button onClick={() => void handleSave()} disabled={saving || value === undefined}>
          Save
        </Button>
      </Group>
    </Card>
  );
}
