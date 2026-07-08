import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  addSessionItem,
  completeSession,
  dnfSession,
  getSession,
  moveSessionItem,
  removeSessionItem,
  updateSessionItem,
} from '../../services/session-service';
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

  // Wrapped in an object so the hook always resolves to a defined value once
  // settled — distinguishes "still loading" (hook result undefined) from a
  // genuinely missing session (result.session undefined).
  const result = useLiveQuery(async () => {
    const session = id ? await getSession(id) : undefined;
    return { session };
  }, [id]);

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

  const doneCount = session.items.filter((item) => item.completed).length;
  // A completed/dnf session is history — session-service has no status guard
  // against further mutation, so the screen itself must stop offering any
  // editing controls once the workout is no longer a draft.
  const isReadOnly = session.status !== 'draft';

  return (
    <div className={`session-screen${isReadOnly ? ' session-screen--readonly' : ''}`}>
      <SessionHeader session={session} onBack={handleBack} />

      {session.items.length === 0 ? (
        <EmptyState
          title={isReadOnly ? 'No exercises logged' : 'No exercises yet'}
          description={isReadOnly ? undefined : 'Add one below to get started.'}
        />
      ) : (
        <ul className="session-screen__items">
          {session.items.map((item, index) =>
            isReadOnly ? (
              <SessionItemCard
                key={item.id}
                item={item}
                position={index + 1}
                isFirst={index === 0}
                isLast={index === session.items.length - 1}
                readOnly
              />
            ) : (
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
