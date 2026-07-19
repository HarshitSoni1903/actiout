import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPreferences } from '../../services/preference-service';
import {
  DraftExistsError,
  dnfSession,
  getActiveDraft,
  startQuickSession,
  startSession,
} from '../../services/session-service';
import { useUiStore } from '../../state/ui-store';
import { StartConflictModal } from './StartConflictModal';

type PendingStart = { routineTemplateIds: string[] };
export type AttemptStartOptions = { intent?: 'new' };

export type UseStartSessionResult = {
  attemptStart(routineTemplateIds: string[], opts?: AttemptStartOptions): Promise<void>;
  conflictModal: ReactNode;
};

// Shared start-session flow: launches a routine (or quick session) unless a
// draft is already in progress, in which case it defers to the user's
// defaultDraftConflictAction preference (asking via StartConflictModal,
// resuming, or closing the draft and starting fresh). Owns the conflict
// modal's state so callers just call attemptStart and render conflictModal.
export function useStartSession(): UseStartSessionResult {
  const navigate = useNavigate();
  const showToast = useUiStore((state) => state.showToast);
  const draft = useLiveQuery(() => getActiveDraft(), []);

  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);

  async function launch(routineTemplateIds: string[]) {
    try {
      const session =
        routineTemplateIds.length > 0 ? await startSession(routineTemplateIds) : await startQuickSession();
      navigate(`/session/${session.id}`);
    } catch (error) {
      showToast(
        error instanceof DraftExistsError ? 'A workout is already in progress.' : 'Could not start the session.',
        'error'
      );
    }
  }

  async function attemptStart(routineTemplateIds: string[], opts?: AttemptStartOptions) {
    const activeDraft = await getActiveDraft();
    if (!activeDraft) {
      await launch(routineTemplateIds);
      return;
    }

    const preference = await getPreferences();
    const action = preference.defaultDraftConflictAction;
    // An explicit "start a new workout" press (as opposed to a plain re-tap of
    // the default start action) must never be silently turned into a resume —
    // fall through to the ask/conflict-modal path instead so the user sees
    // what's happening to their in-progress draft.
    const effectiveAction = opts?.intent === 'new' && action === 'resume' ? 'ask' : action;

    if (effectiveAction === 'ask') {
      setPendingStart({ routineTemplateIds });
      setConflictOpen(true);
      return;
    }
    if (effectiveAction === 'resume') {
      navigate(`/session/${activeDraft.id}`);
      return;
    }
    // 'close-and-start-new'
    try {
      await dnfSession(activeDraft.id);
    } catch {
      showToast('Could not close the current session.', 'error');
      return;
    }
    await launch(routineTemplateIds);
  }

  function handleConflictResume() {
    setConflictOpen(false);
    setPendingStart(null);
    if (draft) {
      navigate(`/session/${draft.id}`);
    }
  }

  async function handleConflictReplace() {
    setConflictOpen(false);
    const toReplace = draft;
    const start = pendingStart;
    setPendingStart(null);
    if (toReplace && start) {
      try {
        await dnfSession(toReplace.id);
      } catch {
        showToast('Could not close the current session.', 'error');
        return;
      }
      await launch(start.routineTemplateIds);
    }
  }

  function handleConflictCancel() {
    setConflictOpen(false);
    setPendingStart(null);
  }

  const conflictModal = draft ? (
    <StartConflictModal
      open={conflictOpen}
      draft={draft}
      onResume={handleConflictResume}
      onReplace={() => void handleConflictReplace()}
      onCancel={handleConflictCancel}
    />
  ) : null;

  return { attemptStart, conflictModal };
}
