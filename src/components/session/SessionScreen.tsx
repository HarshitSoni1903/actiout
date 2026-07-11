import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  addSessionItem,
  completeSession,
  deleteSession,
  dnfSession,
  getSession,
  moveSessionItem,
  removeSessionItem,
  unlockSession,
  updateSessionItem,
} from '../../services/session-service';
import { isItemComplete, listSetsForItem } from '../../services/session-set-service';
import { useUiStore } from '../../state/ui-store';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { AddExerciseRow } from './AddExerciseRow';
import { FinishBar } from './FinishBar';
import { SessionHeader } from './SessionHeader';
import { SessionItemCard, type SessionItemUpdate } from './SessionItemCard';
import './session.css';

// Wraps a mutation for the toast-on-failure convention used across screens —
// UI never shows local spinners; liveQuery re-renders on success.
async function withErrorToast(action: () => Promise<unknown>, onError: (message: string) => void, message: string) {
  try {
    await action();
  } catch {
    onError(message);
  }
}

export function SessionScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const showToast = useUiStore((state) => state.showToast);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Wrapped in an object so the hook always resolves to a defined value once
  // settled — distinguishes "still loading" (hook result undefined) from a
  // genuinely missing session (result.session undefined).
  const result = useLiveQuery(async () => {
    const session = id ? await getSession(id) : undefined;
    return { session };
  }, [id]);

  const itemIds = result?.session ? result.session.items.map((item) => item.id) : [];
  const doneCount =
    useLiveQuery(async () => {
      if (itemIds.length === 0) {
        return 0;
      }
      const setsPerItem = await Promise.all(itemIds.map((itemId) => listSetsForItem(itemId)));
      return setsPerItem.filter((sets) => isItemComplete(sets)).length;
    }, [itemIds.join(',')]) ?? 0;

  if (result === undefined) {
    return <div className="session-screen session-screen--loading" />;
  }

  const { session } = result;

  if (!session) {
    return (
      <div className="session-screen">
        <EmptyState
          title="Session not found"
          description="This workout may have been removed."
          action={
            <Button variant="primary" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          }
        />
      </div>
    );
  }

  const handleBack = () => {
    if (session.status === 'draft') {
      showToast('Saved as draft');
    }
    navigate('/');
  };

  const handleUpdateItem = (itemId: string, patch: SessionItemUpdate) => {
    void withErrorToast(
      () => updateSessionItem(itemId, patch),
      (message) => showToast(message, 'error'),
      'Could not save changes.'
    );
  };

  const handleMoveItem = (itemId: string, direction: 'up' | 'down') => {
    void withErrorToast(
      () => moveSessionItem(itemId, direction),
      (message) => showToast(message, 'error'),
      'Could not reorder.'
    );
  };

  const handleRemoveItem = (itemId: string) => {
    void withErrorToast(
      () => removeSessionItem(itemId),
      (message) => showToast(message, 'error'),
      'Could not remove exercise.'
    );
  };

  const handleAddItem = (name: string) => {
    void withErrorToast(
      () => addSessionItem(session.id, name),
      (message) => showToast(message, 'error'),
      'Could not add exercise.'
    );
  };

  const handleFinish = async () => {
    try {
      await completeSession(session.id);
      navigate('/');
    } catch {
      showToast('Could not finish the session.', 'error');
    }
  };

  const handleDnf = async () => {
    try {
      await dnfSession(session.id);
      navigate('/');
    } catch {
      showToast('Could not close the session.', 'error');
    }
  };

  const handleEdit = () => {
    void withErrorToast(
      async () => {
        await unlockSession(session.id);
        setEditing(true);
      },
      (message) => showToast(message, 'error'),
      'Could not unlock session for editing.'
    );
  };

  const handleDelete = async () => {
    try {
      await deleteSession(session.id);
      navigate('/');
    } catch {
      showToast('Could not delete session.', 'error');
    }
  };

  const isDraft = session.status === 'draft';
  // Item-level controls (sets, notes, reorder, remove) are editable for a
  // draft, or for a completed/dnf session once "Edit" has unlocked it.
  const itemsEditable = isDraft || editing;
  // The Add-exercise + Finish/DNF footer only ever applies to the active
  // draft workflow — unlocking a finished session for edits does not resume
  // that workflow, so the footer (and its bottom padding) stays hidden.
  const isReadOnly = !isDraft;

  return (
    <div className={`session-screen${isReadOnly ? ' session-screen--readonly' : ''}`}>
      <SessionHeader session={session} onBack={handleBack} />

      <div className="session-screen__session-actions">
        {!isDraft && !editing ? (
          <Button variant="ghost" onClick={handleEdit}>
            Edit
          </Button>
        ) : null}
        {confirmingDelete ? (
          <span className="session-screen__delete-confirm">
            <Button variant="danger" onClick={() => void handleDelete()}>
              Confirm delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
            Delete session
          </Button>
        )}
      </div>

      {session.items.length === 0 ? (
        <EmptyState
          title={isReadOnly ? 'No exercises logged' : 'No exercises yet'}
          description={isReadOnly ? undefined : 'Add one below to get started.'}
        />
      ) : (
        <ul className="session-screen__items">
          {session.items.map((item, index) =>
            itemsEditable ? (
              <SessionItemCard
                key={item.id}
                item={item}
                position={index + 1}
                isFirst={index === 0}
                isLast={index === session.items.length - 1}
                onUpdate={(patch) => handleUpdateItem(item.id, patch)}
                onMoveUp={() => handleMoveItem(item.id, 'up')}
                onMoveDown={() => handleMoveItem(item.id, 'down')}
                onRemove={() => handleRemoveItem(item.id)}
              />
            ) : (
              <SessionItemCard
                key={item.id}
                item={item}
                position={index + 1}
                isFirst={index === 0}
                isLast={index === session.items.length - 1}
                readOnly
              />
            )
          )}
        </ul>
      )}

      {isReadOnly ? null : (
        <div className="session-screen__footer safe-bottom">
          <AddExerciseRow onPick={handleAddItem} />
          <FinishBar
            doneCount={doneCount}
            total={session.items.length}
            onFinish={() => void handleFinish()}
            onDnf={() => void handleDnf()}
          />
        </div>
      )}
    </div>
  );
}
