import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Box, Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { SessionItem, SessionSet } from '../../domain/types';
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
import {
  activateSessionItem,
  activationNumbers,
  dnfSessionItem,
  itemPhase,
  orderSessionItems,
} from '../../services/session-flow';
import { isItemComplete, listSetsForSession } from '../../services/session-set-service';
import { useUiStore } from '../../state/ui-store';
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

function groupCompletion(items: SessionItem[], sets: SessionSet[]): Map<string, boolean> {
  const byItem = new Map<string, SessionSet[]>();
  for (const set of sets) {
    const list = byItem.get(set.sessionItemId) ?? [];
    list.push(set);
    byItem.set(set.sessionItemId, list);
  }
  const complete = new Map<string, boolean>();
  for (const item of items) {
    complete.set(item.id, isItemComplete(byItem.get(item.id) ?? []));
  }
  return complete;
}

export function SessionScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const showToast = useUiStore((state) => state.showToast);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dnfConfirmOpen, setDnfConfirmOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Wrapped in an object so the hook always resolves to a defined value once
  // settled — distinguishes "still loading" (hook result undefined) from a
  // genuinely missing session (result.session undefined).
  const result = useLiveQuery(async () => {
    const session = id ? await getSession(id) : undefined;
    return { session };
  }, [id]);

  const allSets =
    useLiveQuery(() => (id ? listSetsForSession(id) : Promise.resolve<SessionSet[]>([])), [id]) ?? [];

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
            <Button onClick={() => navigate('/')}>Back to Home</Button>
          }
        />
      </div>
    );
  }

  const completeById = groupCompletion(session.items, allSets);
  const doneCount = [...completeById.values()].filter(Boolean).length;
  const orderedItems = orderSessionItems(session.items, completeById);
  const numbers = activationNumbers(session.items);

  const isDraft = session.status === 'draft';
  // Item-level controls (sets, notes, reorder, remove) are editable for a
  // draft, or for a completed/dnf session once "Edit" has unlocked it.
  const itemsEditable = isDraft || editing;
  // The Add-exercise + Finish footer only ever applies to the active draft
  // workflow — unlocking a finished session for edits does not resume it.
  const isReadOnly = !isDraft;

  const handleBack = () => {
    if (isDraft) {
      showToast('Saved as draft');
    }
    navigate('/');
  };

  const handleToggle = (item: SessionItem) => {
    const phase = itemPhase(item, completeById.get(item.id) ?? false);
    // Tapping a queued row in a live draft stamps its activation order, then
    // opens it. Every other tap (or any tap in a read-only session) merely
    // toggles the single expanded row.
    if (isDraft && phase === 'queued') {
      void withErrorToast(
        () => activateSessionItem(item.id),
        (message) => showToast(message, 'error'),
        'Could not start exercise.'
      );
      setExpandedId(item.id);
      return;
    }
    setExpandedId((prev) => (prev === item.id ? null : item.id));
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

  const handleDnfItem = (itemId: string) => {
    void withErrorToast(
      () => dnfSessionItem(itemId),
      (message) => showToast(message, 'error'),
      'Could not update exercise.'
    );
    setExpandedId((prev) => (prev === itemId ? null : prev));
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

  return (
    <div className={`session-screen${isReadOnly ? ' session-screen--readonly' : ''}`}>
      <SessionHeader session={session} onBack={handleBack} onRequestDnf={() => setDnfConfirmOpen(true)} />

      <Group justify="flex-end" gap="sm">
        {!isDraft && !editing ? (
          <Button variant="subtle" size="sm" onClick={handleEdit}>
            Edit
          </Button>
        ) : null}
        {confirmingDelete ? (
          <Group gap="xs">
            <Button color="red" size="sm" onClick={() => void handleDelete()}>
              Confirm delete
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
          </Group>
        ) : (
          <Button color="red" variant="light" size="sm" onClick={() => setConfirmingDelete(true)}>
            Delete session
          </Button>
        )}
      </Group>

      {session.items.length === 0 ? (
        <EmptyState
          title={isReadOnly ? 'No exercises logged' : 'No exercises yet'}
          description={isReadOnly ? undefined : 'Add one below to get started.'}
        />
      ) : (
        <Stack gap="sm">
          {orderedItems.map((item, index) => {
            const complete = completeById.get(item.id) ?? false;
            const rawPhase = itemPhase(item, complete);
            // A finished (completed/dnf) session logged before the tap-to-
            // activate feature has no activatedAt, so a done item would read as
            // "queued" — surface it as finished in the read-only history view.
            const phase = !isDraft && rawPhase === 'queued' && complete ? 'finished' : rawPhase;
            return (
            <SessionItemCard
              key={item.id}
              item={item}
              phase={phase}
              activationNumber={numbers.get(item.id)}
              expanded={expandedId === item.id}
              editable={itemsEditable}
              isFirst={index === 0}
              isLast={index === orderedItems.length - 1}
              onToggle={() => handleToggle(item)}
              onUpdate={itemsEditable ? (patch) => handleUpdateItem(item.id, patch) : undefined}
              onMoveUp={itemsEditable ? () => handleMoveItem(item.id, 'up') : undefined}
              onMoveDown={itemsEditable ? () => handleMoveItem(item.id, 'down') : undefined}
              onRemove={itemsEditable ? () => handleRemoveItem(item.id) : undefined}
              onDnf={itemsEditable ? () => handleDnfItem(item.id) : undefined}
              onCompleted={() => setExpandedId(null)}
            />
            );
          })}
        </Stack>
      )}

      {isReadOnly ? null : (
        <Box
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 10,
            background: 'var(--mantine-color-body)',
            paddingTop: 'var(--space-3)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--space-3))',
          }}
        >
          <Stack gap="sm">
            <AddExerciseRow onPick={handleAddItem} />
            <FinishBar doneCount={doneCount} total={session.items.length} onFinish={() => void handleFinish()} />
          </Stack>
        </Box>
      )}

      <Modal opened={dnfConfirmOpen} onClose={() => setDnfConfirmOpen(false)} title="Did not finish?">
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            Mark as Did Not Finish? Stays in history, excluded from PRs.
          </Text>
          <Group grow>
            <Button variant="default" onClick={() => setDnfConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                setDnfConfirmOpen(false);
                void handleDnf();
              }}
            >
              Mark DNF
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
