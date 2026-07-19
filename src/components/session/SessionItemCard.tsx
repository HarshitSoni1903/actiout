import { useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Box, Button, Card, Collapse, Group, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconCheck, IconClock, IconX } from '@tabler/icons-react';
import type { SessionItem, SessionSet } from '../../domain/types';
import type { ItemPhase } from '../../services/session-flow';
import { getLastPerformance } from '../../services/analytics-service';
import { addSet, listSetsForItem, removeSet, updateSet } from '../../services/session-set-service';
import { useUiStore } from '../../state/ui-store';

export type SessionItemUpdate = Partial<Pick<SessionItem, 'notes'>>;

export type SessionItemCardProps = {
  item: SessionItem;
  phase: ItemPhase;
  // 1-based tap-order rank; undefined renders an empty (unactivated) circle.
  activationNumber?: number;
  expanded: boolean;
  // Per-set editing, reorder, notes and the per-exercise DNF button only show
  // when the session is a live draft (or a finished session unlocked for edits).
  editable: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle(): void;
  onUpdate?(patch: SessionItemUpdate): void;
  onMoveUp?(): void;
  onMoveDown?(): void;
  onRemove?(): void;
  onDnf?(): void;
};

type SetPatch = Partial<Pick<SessionSet, 'reps' | 'weight' | 'isWarmup' | 'completed'>>;

type LastPerformance = Awaited<ReturnType<typeof getLastPerformance>>;

// Collapsed dimmed summary — prefers the last logged performance, falling back
// to the item's planned reps × sets.
function buildSummary(item: SessionItem, last: LastPerformance): string | undefined {
  if (last && last.sets.length > 0) {
    const first = last.sets[0]!;
    const sets = last.sets.length;
    if (first.weight !== undefined) {
      return `${first.weight} ${first.weightUnit} × ${first.reps ?? '–'} × ${sets}`;
    }
    if (first.reps !== undefined) {
      return `${first.reps} × ${sets}`;
    }
  }
  if (item.repsPlanned !== undefined || item.setsPlanned !== undefined) {
    return `${item.repsPlanned ?? '–'} × ${item.setsPlanned ?? '–'}`;
  }
  return undefined;
}

function StatusIcon({ phase, isDnf }: { phase: ItemPhase; isDnf: boolean }) {
  if (isDnf) {
    return (
      <ThemeIcon color="red" variant="light" radius="xl" size={28}>
        <IconX size={16} />
      </ThemeIcon>
    );
  }
  if (phase === 'finished') {
    return (
      <ThemeIcon color="actiGreen" variant="light" radius="xl" size={28}>
        <IconCheck size={16} />
      </ThemeIcon>
    );
  }
  if (phase === 'active') {
    return (
      <ThemeIcon color="yellow" variant="light" radius="xl" size={28}>
        <IconClock size={16} />
      </ThemeIcon>
    );
  }
  return <ThemeIcon color="gray" variant="default" radius="xl" size={28} aria-hidden />;
}

export function SessionItemCard({
  item,
  phase,
  activationNumber,
  expanded,
  editable,
  isFirst,
  isLast,
  onToggle,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDnf,
}: SessionItemCardProps) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState(item.notes ?? '');
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const notesId = useId();
  const startRestTimer = useUiStore((state) => state.startRestTimer);

  const sets = useLiveQuery(() => listSetsForItem(item.id), [item.id]) ?? [];
  const lastPerformance = useLiveQuery(
    () => getLastPerformance(item.exerciseNameSnapshot),
    [item.exerciseNameSnapshot]
  );

  const summary = buildSummary(item, lastPerformance);
  const isDnf = item.dnfAt !== undefined;

  function expandNotes() {
    setNotesDraft(item.notes ?? '');
    setNotesExpanded(true);
  }

  function commitNotes() {
    const trimmed = notesDraft.trim();
    onUpdate?.({ notes: trimmed === '' ? undefined : trimmed });
    setNotesExpanded(false);
  }

  function handleAddSet() {
    void addSet(item.id);
  }

  function handleRemoveSet(setId: string) {
    void removeSet(setId);
  }

  function handleSetChange(set: SessionSet, patch: SetPatch) {
    void updateSet(set.id, patch);
    if (patch.completed === true && item.restSeconds) {
      startRestTimer(item.id, item.restSeconds);
    }
  }

  return (
    <Card withBorder radius="lg" padding="xs" style={phase === 'finished' ? { opacity: 0.72 } : undefined}>
      <UnstyledButton
        onClick={onToggle}
        aria-expanded={expanded}
        style={{ width: '100%', padding: 'var(--space-2)' }}
      >
        <Group wrap="nowrap" gap="sm" align="center">
          <ThemeIcon variant="default" radius="xl" size={30} c="var(--mantine-color-text)">
            {activationNumber !== undefined ? (
              <Text size="xs" fw={700}>
                {activationNumber}
              </Text>
            ) : null}
          </ThemeIcon>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} truncate>
              {item.exerciseNameSnapshot}
            </Text>
            {summary ? (
              <Text size="sm" c="dimmed" truncate>
                {summary}
              </Text>
            ) : null}
          </div>
          <StatusIcon phase={phase} isDnf={isDnf} />
        </Group>
      </UnstyledButton>

      <Collapse in={expanded}>
        <Box px="xs" pb="xs" pt="sm">
          <div className="session-item-card__sets">
            {sets.map((set) =>
              !editable ? (
                <p key={set.id} className="session-item-card__set-row-readonly">
                  Set {set.setNumber}: {set.reps ?? '-'} reps &times; {set.weight ?? '-'} {set.weightUnit}
                  {set.isWarmup ? ' (warmup)' : ''}
                  {set.completed ? ' ✓' : ''}
                </p>
              ) : (
                <div key={set.id} className="session-item-card__set-row">
                  <span className="session-item-card__set-number">{set.setNumber}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label={`Set ${set.setNumber} reps`}
                    value={set.reps ?? ''}
                    onChange={(event) =>
                      handleSetChange(set, { reps: event.target.value === '' ? undefined : Number(event.target.value) })
                    }
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label={`Set ${set.setNumber} weight`}
                    value={set.weight ?? ''}
                    onChange={(event) =>
                      handleSetChange(set, {
                        weight: event.target.value === '' ? undefined : Number(event.target.value),
                      })
                    }
                  />
                  <span className="session-item-card__set-unit">{set.weightUnit}</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={set.isWarmup}
                      onChange={(event) => handleSetChange(set, { isWarmup: event.target.checked })}
                    />
                    Warmup
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={set.completed}
                      onChange={(event) => handleSetChange(set, { completed: event.target.checked })}
                    />
                    Done
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove set ${set.setNumber}`}
                    onClick={() => handleRemoveSet(set.id)}
                  >
                    &times;
                  </button>
                </div>
              )
            )}
          </div>

          {editable ? (
            <button type="button" className="session-item-card__add-set-btn" onClick={handleAddSet}>
              Add set
            </button>
          ) : null}

          {editable ? (
            <div className="session-item-card__notes">
              {notesExpanded ? (
                <textarea
                  id={notesId}
                  name={notesId}
                  className="session-item-card__notes-input"
                  autoFocus
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  onBlur={commitNotes}
                  placeholder="Notes"
                  aria-label={`Notes for ${item.exerciseNameSnapshot}`}
                />
              ) : (
                <button type="button" className="session-item-card__notes-toggle" onClick={expandNotes}>
                  {item.notes ? item.notes : 'Add note'}
                </button>
              )}
            </div>
          ) : null}

          {!editable && item.notes ? <p className="session-item-card__notes-readonly">{item.notes}</p> : null}

          {editable ? (
            <Group justify="space-between" align="center" mt="sm" wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <button
                  type="button"
                  className="session-item-card__reorder-btn"
                  aria-label={`Move ${item.exerciseNameSnapshot} up`}
                  disabled={isFirst}
                  onClick={onMoveUp}
                >
                  &#9650;
                </button>
                <button
                  type="button"
                  className="session-item-card__reorder-btn"
                  aria-label={`Move ${item.exerciseNameSnapshot} down`}
                  disabled={isLast}
                  onClick={onMoveDown}
                >
                  &#9660;
                </button>
                {confirmingRemove ? (
                  <span className="session-item-card__confirm">
                    <button type="button" className="session-item-card__confirm-btn" onClick={onRemove}>
                      Remove
                    </button>
                    <button
                      type="button"
                      className="session-item-card__cancel-btn"
                      onClick={() => setConfirmingRemove(false)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="session-item-card__remove-btn"
                    aria-label={`Remove ${item.exerciseNameSnapshot}`}
                    onClick={() => setConfirmingRemove(true)}
                  >
                    &times;
                  </button>
                )}
              </Group>
              {onDnf ? (
                <Button variant="light" color="red" size="xs" onClick={onDnf}>
                  {isDnf ? 'Undo DNF' : "Didn't finish"}
                </Button>
              ) : null}
            </Group>
          ) : null}
        </Box>
      </Collapse>
    </Card>
  );
}
