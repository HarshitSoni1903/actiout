import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Anchor, Button, Stack, Title } from '@mantine/core';
import type { RoutineTemplate } from '../../domain/types';
import { addBodyweight, listBodyweight } from '../../services/bodyweight-service';
import { getPreferences } from '../../services/preference-service';
import { listRoutines, routinesForWeekday } from '../../services/routine-service';
import { dnfSession, getActiveDraft, listSessions } from '../../services/session-service';
import { useUiStore } from '../../state/ui-store';
import { todayLocalDate, weekdayOf } from '../../utils';
import { summaryLine } from '../routines/routine-summary';
import { BodyweightQuickAdd } from './BodyweightQuickAdd';
import { DraftCard } from './DraftCard';
import { RoutinePickerModal } from './RoutinePickerModal';
import { TodayRoutineList } from './TodayRoutineList';
import { useStartSession } from './useStartSession';

function formatDateHeader(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year as number, (month as number) - 1, day as number);
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(date);
}

function timeOfDayNow(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
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
  const { attemptStart, conflictModal } = useStartSession();

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

  // Clock-aware sub-label for the suggested routine's hero: "Due now" once its
  // timeOfDay has passed, "Due at HH:MM" while still ahead, nothing all-day.
  const dueLabel = useMemo(() => {
    if (!firstUnfinished?.timeOfDay) {
      return undefined;
    }
    return firstUnfinished.timeOfDay <= timeOfDayNow() ? 'Due now' : `Due at ${firstUnfinished.timeOfDay}`;
  }, [firstUnfinished]);

  // The active draft's own overview line: summaryLine() of whichever linked
  // routine templates still exist (a quick session, or one whose routine was
  // since deleted, yields no summary — same "Quick session" fallback as the title).
  const draftSummary = useMemo(() => {
    if (!draft) {
      return undefined;
    }
    const matched = draft.routineLinks
      .map((link) => (allRoutines ?? []).find((routine) => routine.id === link.routineTemplateId))
      .filter((routine): routine is RoutineTemplate => routine !== undefined && routine.items.length > 0);
    return matched.length > 0 ? matched.map((routine) => summaryLine(routine)).join(' · ') : undefined;
  }, [draft, allRoutines]);

  // True when at least one routine exists that is not scheduled today — the
  // quiet "All routines" entry point exists so those can still be started.
  const hasUnscheduledRoutines = useMemo(() => {
    const todayIds = new Set((todaysRoutines ?? []).map((routine) => routine.id));
    return (allRoutines ?? []).some((routine) => !todayIds.has(routine.id));
  }, [allRoutines, todaysRoutines]);

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

  function handleStartNewFromDraft() {
    if (firstUnfinished) {
      void attemptStart([firstUnfinished.id], { intent: 'new' });
    } else {
      setPickerOpen(true);
    }
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
    // Picking a routine from the picker while a draft is active is the same
    // explicit "start something new" intent as the draft hero's secondary
    // button — never let a 'resume' preference silently swallow it.
    await attemptStart(routineTemplateIds, draft ? { intent: 'new' } : undefined);
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
    <Stack gap="xl">
      <Title order={1}>{formatDateHeader(today)}</Title>

      {draft ? (
        <DraftCard
          draft={draft}
          summary={draftSummary}
          onResume={handleResumeDraft}
          onStartNew={handleStartNewFromDraft}
          onMarkDnf={() => void handleMarkDnf()}
        />
      ) : null}

      {routinesLoaded ? (
        <TodayRoutineList
          routines={todaysRoutines ?? []}
          doneIds={doneRoutineIds}
          suggestedId={!draft ? firstUnfinished?.id : undefined}
          dueLabel={!draft ? dueLabel : undefined}
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
        <Button size="xl" fullWidth onClick={handleStartAWorkout}>
          Start a workout
        </Button>
      ) : null}

      {hasUnscheduledRoutines && (todaysRoutines ?? []).length > 0 && !multiSelect ? (
        <Button variant="subtle" onClick={() => setPickerOpen(true)}>
          All routines
        </Button>
      ) : null}

      <Anchor component="button" type="button" c="dimmed" onClick={() => void attemptStart([])}>
        Quick session
      </Anchor>

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

      {conflictModal}
    </Stack>
  );
}
