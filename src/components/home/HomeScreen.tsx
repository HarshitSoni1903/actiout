import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { addBodyweight, listBodyweight } from '../../services/bodyweight-service';
import { getPreferences } from '../../services/preference-service';
import { listRoutines, routinesForWeekday } from '../../services/routine-service';
import {
  DraftExistsError,
  dnfSession,
  getActiveDraft,
  listSessions,
  startQuickSession,
  startSession,
} from '../../services/session-service';
import { useUiStore } from '../../state/ui-store';
import { todayLocalDate, weekdayOf } from '../../utils/dates';
import { Button } from '../common/Button';
import { BodyweightQuickAdd } from './BodyweightQuickAdd';
import { DraftCard } from './DraftCard';
import { RoutinePickerModal } from './RoutinePickerModal';
import { StartConflictModal } from './StartConflictModal';
import { TodayRoutineList } from './TodayRoutineList';
import './home.css';

type PendingStart = { routineTemplateIds: string[] };

function formatDateHeader(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year as number, (month as number) - 1, day as number);
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(date);
}

export function HomeScreen() {
  const navigate = useNavigate();
  const showToast = useUiStore((state) => state.showToast);

  const today = todayLocalDate();
  const weekday = weekdayOf(today);

  const draft = useLiveQuery(() => getActiveDraft(), []);
  const todaysRoutines = useLiveQuery(() => routinesForWeekday(weekday), [weekday]);
  const allRoutines = useLiveQuery(() => listRoutines(), []);
  const completedSessions = useLiveQuery(() => listSessions({ statuses: ['completed'] }), []);
  const preferences = useLiveQuery(() => getPreferences(), []);
  const bodyweightEntries = useLiveQuery(() => listBodyweight(), []);

  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const doneRoutineIds = useMemo(() => {
    const ids = new Set<string>();
    (completedSessions ?? []).forEach((session) => {
      if (session.sessionDate === today) {
        session.routineLinks.forEach((link) => ids.add(link.routineTemplateId));
      }
    });
    return ids;
  }, [completedSessions, today]);

  const firstUnfinished = useMemo(
    () => (todaysRoutines ?? []).find((routine) => !doneRoutineIds.has(routine.id)),
    [todaysRoutines, doneRoutineIds]
  );

  // True when at least one routine exists that is not scheduled today — the
  // quiet "All routines" entry point exists so those can still be started.
  const hasUnscheduledRoutines = useMemo(() => {
    const todayIds = new Set((todaysRoutines ?? []).map((routine) => routine.id));
    return (allRoutines ?? []).some((routine) => !todayIds.has(routine.id));
  }, [allRoutines, todaysRoutines]);

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

  async function attemptStart(routineTemplateIds: string[]) {
    const activeDraft = await getActiveDraft();
    if (!activeDraft) {
      await launch(routineTemplateIds);
      return;
    }

    const preference = await getPreferences();
    const action = preference.defaultDraftConflictAction;

    if (action === 'ask') {
      setPendingStart({ routineTemplateIds });
      setConflictOpen(true);
      return;
    }
    if (action === 'resume') {
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

  function handleResumeDraft() {
    if (draft) {
      navigate(`/session/${draft.id}`);
    }
  }

  async function handleMarkDnf() {
    if (!draft) {
      return;
    }
    try {
      await dnfSession(draft.id);
    } catch {
      showToast('Could not close the session.', 'error');
      return;
    }
    showToast('Session marked as not finished');
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

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleMultiSelect() {
    setMultiSelect((prev) => !prev);
    setSelectedIds(new Set());
  }

  function handleStartAWorkout() {
    setPickerOpen(true);
  }

  async function handlePickerStart(routineTemplateIds: string[]) {
    setPickerOpen(false);
    await attemptStart(routineTemplateIds);
  }

  async function handleStartSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    setMultiSelect(false);
    setSelectedIds(new Set());
    await attemptStart(ids);
  }

  async function handleBodyweightSave(value: number) {
    const preference = preferences ?? (await getPreferences());
    await addBodyweight(value, preference.weightUnit);
    showToast('Bodyweight saved');
  }

  const latest = (bodyweightEntries ?? [])[0];
  const routinesLoaded = todaysRoutines !== undefined;
  const showAllDoneWorkoutButton =
    !draft && !multiSelect && routinesLoaded && (todaysRoutines ?? []).length > 0 && !firstUnfinished;

  return (
    <div className="home-screen">
      <h1 className="home-screen__date">{formatDateHeader(today)}</h1>

      {draft ? <DraftCard draft={draft} onResume={handleResumeDraft} onMarkDnf={() => void handleMarkDnf()} /> : null}

      {routinesLoaded ? (
        <TodayRoutineList
          routines={todaysRoutines ?? []}
          doneIds={doneRoutineIds}
          suggestedId={!draft ? firstUnfinished?.id : undefined}
          multiSelect={multiSelect}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelected}
          onStart={(id) => void attemptStart([id])}
          onToggleMultiSelect={toggleMultiSelect}
          onStartSelected={() => void handleStartSelected()}
          onStartAWorkout={handleStartAWorkout}
        />
      ) : null}

      {showAllDoneWorkoutButton ? (
        <Button variant="primary" className="home-screen__start-a-workout" onClick={handleStartAWorkout}>
          Start a workout
        </Button>
      ) : null}

      {hasUnscheduledRoutines && (todaysRoutines ?? []).length > 0 && !multiSelect ? (
        <Button variant="ghost" className="home-screen__all-routines" onClick={() => setPickerOpen(true)}>
          All routines
        </Button>
      ) : null}

      <button type="button" className="home-screen__quick-link" onClick={() => void attemptStart([])}>
        Quick session
      </button>

      <BodyweightQuickAdd
        latestValue={latest?.weightValue}
        latestUnit={latest?.weightUnit}
        latestDate={latest?.entryDate}
        preferredUnit={preferences?.weightUnit ?? 'lb'}
        onSave={handleBodyweightSave}
      />

      <RoutinePickerModal
        open={pickerOpen}
        routines={allRoutines ?? []}
        onStart={(ids) => void handlePickerStart(ids)}
        onClose={() => setPickerOpen(false)}
      />

      {draft ? (
        <StartConflictModal
          open={conflictOpen}
          draft={draft}
          onResume={handleConflictResume}
          onReplace={() => void handleConflictReplace()}
          onCancel={handleConflictCancel}
        />
      ) : null}
    </div>
  );
}
