import { useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { SessionItem, SessionSet } from '../../domain/types';
import { getLastPerformance } from '../../services/analytics-service';
import { addSet, isItemComplete, listSetsForItem, removeSet, updateSet } from '../../services/session-set-service';
import { useUiStore } from '../../state/ui-store';

export type SessionItemUpdate = Partial<Pick<SessionItem, 'notes'>>;

export type SessionItemCardProps = {
  item: SessionItem;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  // Omitted entirely (never invoked) when `readOnly` is set — completed/dnf
  // sessions render a read-only summary with no editing controls, unless the
  // session has been unlocked for editing (SessionScreen flips readOnly off).
  onUpdate?(patch: SessionItemUpdate): void;
  onMoveUp?(): void;
  onMoveDown?(): void;
  onRemove?(): void;
  readOnly?: boolean;
};

type SetPatch = Partial<Pick<SessionSet, 'reps' | 'weight' | 'isWarmup' | 'completed'>>;

type LastPerformance = Awaited<ReturnType<typeof getLastPerformance>>;

function formatLastPerformance(last: LastPerformance): string | undefined {
  if (!last || last.sets.length === 0) {
    return undefined;
  }
  const parts = last.sets.map((s) => {
    if (s.reps !== undefined && s.weight !== undefined) {
      return `${s.reps}×${s.weight}`;
    }
    if (s.reps !== undefined) {
      return `${s.reps} reps`;
    }
    if (s.weight !== undefined) {
      return `${s.weight}`;
    }
    return '-';
  });
  return `Last: ${parts.join(', ')} on ${last.date}`;
}

export function SessionItemCard({
  item,
  position,
  isFirst,
  isLast,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onRemove,
  readOnly = false,
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

  const done = isItemComplete(sets);
  const lastHint = formatLastPerformance(lastPerformance);

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
    <li
      className={`session-item-card${done ? ' session-item-card--done' : ''}${
        readOnly ? ' session-item-card--readonly' : ''
      }`}
    >
      <div className="session-item-card__header">
        <span className="session-item-card__position">{position}</span>
        <div className="session-item-card__main">
          <span className="session-item-card__name">{item.exerciseNameSnapshot}</span>
          {lastHint ? <p className="session-item-card__last">{lastHint}</p> : null}
        </div>
      </div>

      <div className="session-item-card__sets">
        {sets.map((set) =>
          readOnly ? (
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

      {readOnly ? null : (
        <button type="button" className="session-item-card__add-set-btn" onClick={handleAddSet}>
          Add set
        </button>
      )}

      {readOnly ? null : (
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
      )}

      {readOnly && item.notes ? <p className="session-item-card__notes-readonly">{item.notes}</p> : null}

      {readOnly ? null : (
        <div className="session-item-card__actions">
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
        </div>
      )}
    </li>
  );
}
