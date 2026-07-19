import { useEffect, useState } from 'react';
import { Anchor, Button, Group, Stack, Text, Title } from '@mantine/core';
import type { Session } from '../../domain/types';

export type SessionHeaderProps = {
  session: Session;
  onBack(): void;
  // Whole-session DNF — only offered while the session is a live draft.
  onRequestDnf?(): void;
};

function elapsedMinutes(totalSeconds: number): number {
  return Math.max(0, Math.floor(totalSeconds / 60));
}

function routineTitle(session: Session): string {
  if (session.routineLinks.length > 0) {
    return session.routineLinks.map((link) => link.routineNameSnapshot).join(' + ');
  }
  return 'Quick workout';
}

function statusWord(session: Session): string {
  if (session.status === 'completed') {
    return 'Completed';
  }
  if (session.status === 'dnf') {
    return 'Did not finish';
  }
  return 'Draft';
}

export function SessionHeader({ session, onBack, onRequestDnf }: SessionHeaderProps) {
  // Only a draft with a known start time ticks — completed/dnf sessions show
  // a frozen duration, and a missing startedAt has nothing to tick from.
  const ticking = session.status === 'draft' && session.startedAt !== undefined;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  let minutes: number | undefined;
  if (session.status === 'draft') {
    if (session.startedAt) {
      minutes = elapsedMinutes((now - Date.parse(session.startedAt)) / 1000);
    }
  } else if (session.durationSeconds !== undefined) {
    minutes = elapsedMinutes(session.durationSeconds);
  } else if (session.startedAt && session.endedAt) {
    minutes = elapsedMinutes((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000);
  }

  const isDraft = session.status === 'draft';
  const meta = minutes === undefined ? statusWord(session) : `${statusWord(session)} • ${minutes} min elapsed`;

  return (
    <Stack gap={4}>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Anchor component="button" type="button" size="sm" c="dimmed" onClick={onBack}>
          &lsaquo; Home
        </Anchor>
        {isDraft && onRequestDnf ? (
          <Button size="xs" variant="outline" color="red" onClick={onRequestDnf}>
            DNF
          </Button>
        ) : null}
      </Group>
      <Title order={1}>{routineTitle(session)}</Title>
      <Text c="dimmed" size="sm">
        {meta}
      </Text>
    </Stack>
  );
}
