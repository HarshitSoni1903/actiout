import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { addBodyweight, listBodyweight } from '../../services/bodyweight-service';
import { getPreferences } from '../../services/preference-service';
import { routinesForWeekday } from '../../services/routine-service';
import { dnfSession, getActiveDraft, listSessions, startQuickSession, startSession } from '../../services/session-service';
import { useUiStore } from '../../state/ui-store';
import { todayLocalDate, weekdayOf } from '../../utils/dates';
import { Button } from '../common/Button';
import { BodyweightQuickAdd } from './BodyweightQuickAdd';
import { DraftCard } from './DraftCard';
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
  const completedSessions = useLiveQuery(() => listSessions({ statuses: ['completed'] }), []);
  const preferences = useLiveQuery(() => getPreferences(), []);
  const bodyweightEntries = useLiveQuery(() => listBodyweight(), []);

  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);
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

  async function launch(routineTemplateIds: string[]) {
    try {
      const session =
        routineTemplateIds.length > 0 ? await startSession(routineTemplateIds) : await startQuickSession();
      navigate(`/session/${session.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not start session', 'error');
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
    await dnfSession(activeDraft.id);
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
    await dnfSession(draft.id);
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
      await dnfSession(toReplace.id);
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
    if ((todaysRoutines ?? []).length === 0) {
      void attemptStart([]);
    } else {
      setMultiSelect(true);
    }
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

      {draft ? <DraftCard draft={draft} onResume={handleResumeDraft} onMarkDnf={handleMarkDnf} /> : null}

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
