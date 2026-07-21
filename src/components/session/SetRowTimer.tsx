import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button } from '@mantine/core';
import { IconStopwatch } from '@tabler/icons-react';
import type { SessionSet } from '../../domain/types';
import { updateSet } from '../../services/session-set-service';

export type SetRowTimerProps = {
  set: SessionSet;
  disabled?: boolean;
};

// m:ss with zero-padded seconds, e.g. 45 -> "0:45", 605 -> "10:05".
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Per-set stopwatch for timed exercises (plank use-case). Tap to start a
// local count-up, tap again to stop and persist durationSeconds via
// updateSet. Persisted state comes from the set prop, not local state, so it
// survives remounts/reloads once written.
export function SetRowTimer({ set, disabled }: SetRowTimerProps) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!running) {
      return;
    }
    const id = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  function start() {
    startedAtRef.current = Date.now();
    setElapsed(0);
    setRunning(true);
  }

  function stop() {
    setRunning(false);
    const durationSeconds = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
    void updateSet(set.id, { durationSeconds });
  }

  if (running) {
    return (
      <Button
        variant="subtle"
        size="compact-xs"
        aria-label={`Stop timing set ${set.setNumber}`}
        onClick={stop}
        disabled={disabled}
      >
        {formatDuration(elapsed)}
      </Button>
    );
  }

  if (set.durationSeconds !== undefined) {
    const badge = formatDuration(set.durationSeconds);
    return (
      <Button
        variant="subtle"
        size="compact-xs"
        color="gray"
        aria-label={`Re-time set ${set.setNumber} (recorded ${badge})`}
        onClick={start}
        disabled={disabled}
      >
        {badge}
      </Button>
    );
  }

  return (
    <ActionIcon
      variant="subtle"
      size="sm"
      aria-label={`Time set ${set.setNumber}`}
      onClick={start}
      disabled={disabled}
    >
      <IconStopwatch size={16} />
    </ActionIcon>
  );
}
