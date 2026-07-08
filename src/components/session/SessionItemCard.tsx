import { useId, useState } from 'react';
import type { SessionItem } from '../../domain/types';
import { formatWeight } from '../../domain/units';
import { Stepper } from '../common/Stepper';

export type SessionItemUpdate = Partial<
  Pick<SessionItem, 'setsActual' | 'repsActual' | 'weightActual' | 'notes' | 'completed'>
>;

export type SessionItemCardProps = {
  item: SessionItem;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  // Omitted entirely (never invoked) when `readOnly` is set — completed/dnf
  // sessions render a read-only summary with no editing controls.
  onUpdate?(patch: SessionItemUpdate): void;
  onMoveUp?(): void;
  onMoveDown?(): void;
  onRemove?(): void;
  readOnly?: boolean;
};

// Display-only rounding — the stored value keeps full precision until the
// user actually edits it via the stepper, at which point the edit naturally
// replaces it with a rounded value.
function roundWeight(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 10) / 10;
}

function summarize(item: SessionItem): string {
  const parts: string[] = [];
  if (item.setsActual !== undefined && item.repsActual !== undefined) {
    parts.push(`${item.setsActual}×${item.repsActual}`);
  } else if (item.setsActual !== undefined) {
    parts.push(`${item.setsActual} sets`);
  } else if (item.repsActual !== undefined) {
    parts.push(`${item.repsActual} reps`);
  }
  if (item.weightActual !== undefined) {
    parts.push(formatWeight(item.weightActual, item.weightUnit));
  }
  return parts.length > 0 ? parts.join(' · ') : 'No data';
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

  function expandNotes() {
    setNotesDraft(item.notes ?? '');
    setNotesExpanded(true);
  }

  function commitNotes() {
    const trimmed = notesDraft.trim();
    onUpdate?.({ notes: trimmed === '' ? undefined : trimmed });
    setNotesExpanded(false);
  }

  return (
    <li
      className={`session-item-card${item.completed ? ' session-item-card--done' : ''}${
        readOnly ? ' session-item-card--readonly' : ''
      }`}
    >
      <div className="session-item-card__header">
        <span className="session-item-card__position">{position}</span>
        <div className="session-item-card__main">
          <span className="session-item-card__name">{item.exerciseNameSnapshot}</span>
          {readOnly || item.completed ? (
            <span className="session-item-card__summary">{summarize(item)}</span>
          ) : null}
        </div>
        {readOnly ? null : (
          <button
            type="button"
            className="session-item-card__done-toggle"
            aria-pressed={item.completed}
            aria-label={item.completed ? `Mark ${item.exerciseNameSnapshot} not done` : `Mark ${item.exerciseNameSnapshot} done`}
            onClick={() => onUpdate?.({ completed: !item.completed })}
          >
            {item.completed ? '✓' : ''}
          </button>
        )}
      </div>

      {!readOnly && !item.completed ? (
        <>
          <div className="session-item-card__steppers">
            <Stepper
              label="Sets"
              value={item.setsActual}
              onChange={(v) => onUpdate?.({ setsActual: v })}
              min={0}
            />
            <Stepper
              label="Reps"
              value={item.repsActual}
              onChange={(v) => onUpdate?.({ repsActual: v })}
              min={0}
            />
            <Stepper
              label={`Weight (${item.weightUnit})`}
              value={roundWeight(item.weightActual)}
              onChange={(v) => onUpdate?.({ weightActual: v })}
              step={item.weightUnit === 'kg' ? 1 : 5}
              min={0}
              allowDecimal
            />
          </div>

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
        </>
      ) : null}

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
