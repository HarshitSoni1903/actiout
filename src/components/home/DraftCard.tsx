import { useState } from 'react';
import { Anchor, Button, Group, Stack, Text, Title } from '@mantine/core';
import type { Session } from '../../domain/types';

export type DraftCardProps = {
  draft: Session;
  summary?: string;
  onResume(): void;
  onStartNew(): void;
  onMarkDnf(): void;
};

function formatStartedTime(iso?: string): string {
  if (!iso) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function DraftCard({ draft, summary, onResume, onStartNew, onMarkDnf }: DraftCardProps) {
  const [confirmingDnf, setConfirmingDnf] = useState(false);

  const routineNames =
    draft.routineLinks.length > 0
      ? draft.routineLinks.map((link) => link.routineNameSnapshot).join(', ')
      : 'Quick session';
  const total = draft.items.length;

  return (
    <Stack gap={4}>
      <Text size="sm" c="dimmed" fw={600}>
        Continue
      </Text>
      <Title order={2}>{routineNames}</Title>
      {summary ? (
        <Text c="dimmed" size="sm">
          {summary}
        </Text>
      ) : null}
      <Text size="xs" c="dimmed">
        Started {formatStartedTime(draft.startedAt)}
        {total > 0 ? ` · ${total} exercises` : ''}
      </Text>

      <Button size="xl" fullWidth mt="sm" onClick={onResume}>
        Continue
      </Button>
      <Button size="lg" fullWidth variant="outline" onClick={onStartNew}>
        Start new workout
      </Button>

      {confirmingDnf ? (
        <Group gap="sm" mt="xs" wrap="wrap" align="center">
          <Text size="sm" c="dimmed">
            Mark this session as not finished?
          </Text>
          <Button size="sm" color="red" onClick={onMarkDnf}>
            Confirm
          </Button>
          <Button size="sm" variant="subtle" onClick={() => setConfirmingDnf(false)}>
            Cancel
          </Button>
        </Group>
      ) : (
        <Anchor component="button" type="button" size="sm" c="dimmed" mt="xs" onClick={() => setConfirmingDnf(true)}>
          Mark as not finished
        </Anchor>
      )}
    </Stack>
  );
}
