import { useEffect, useState } from 'react';
import { Button, Group, Progress, Text } from '@mantine/core';

export type RestTimerBarProps = {
  endsAt: number;
  totalSeconds: number;
  onClear(): void;
};

// Slim countdown pinned under the card while a rest timer is running for this
// item. Ticks locally; clears the shared store (which unmounts it) at zero.
export function RestTimerBar({ endsAt, totalSeconds, onClear }: RestTimerBarProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, endsAt - now);

  useEffect(() => {
    if (remainingMs <= 0) {
      onClear();
    }
  }, [remainingMs, onClear]);

  const remaining = Math.ceil(remainingMs / 1000);
  const value = totalSeconds > 0 ? Math.min(100, (remainingMs / (totalSeconds * 1000)) * 100) : 0;
  const label = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <div style={{ marginTop: 'var(--space-2)' }}>
      <Group justify="space-between" align="center" gap="sm" wrap="nowrap" mb={4}>
        <Text size="xs" c="dimmed">
          Rest {label}
        </Text>
        <Button variant="subtle" size="compact-xs" onClick={onClear}>
          Skip
        </Button>
      </Group>
      <Progress value={value} size="sm" color="actiGreen" radius="xl" />
    </div>
  );
}
