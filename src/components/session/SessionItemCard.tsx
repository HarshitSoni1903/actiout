import { useEffect, useId, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Collapse,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconPlus,
  IconX,
} from '@tabler/icons-react';
import type { MeasurementType, SessionItem, SessionSet, WeightUnit } from '../../domain/types';
import type { ItemPhase } from '../../services/session-flow';
import { applyAggregateSets } from '../../services/session-flow';
import { getLastPerformance } from '../../services/analytics-service';
import { addSet, listSetsForItem, removeSet, updateSet } from '../../services/session-set-service';
import { getPreferences } from '../../services/preference-service';
import { useUiStore } from '../../state/ui-store';
import { computeAggregatePrefill, type AggregateDraft } from './aggregate-prefill';
import { SetRow, type SetRowPatch } from './SetRow';
import { SetRowTimer, formatDuration } from './SetRowTimer';
import { RestTimerBar } from './RestTimerBar';

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
  onToggle(): void;
  onUpdate?(patch: SessionItemUpdate): void;
  onRemove?(): void;
  onDnf?(): void;
  // Basic-mode "Completed" collapses the card; SessionScreen wires this to
  // setExpandedId(null). Float-up happens on its own via liveQuery.
  onCompleted?(): void;
  // Drag handle rendered at the left edge of the header row (queued items in
  // a live draft only); listeners/attributes live on the handle so tapping
  // the card body still toggles it.
  dragHandle?: ReactNode;
};

type LastPerformance = Awaited<ReturnType<typeof getLastPerformance>>;

// Short holds read better in plain seconds; anything a minute or longer as m:ss.
function formatHold(totalSeconds: number): string {
  return totalSeconds < 60 ? `${totalSeconds}s` : formatDuration(totalSeconds);
}

// Derived read-only pace, e.g. "8:42 min/mi". Undefined unless both inputs are
// present and positive.
function formatPace(
  durationSeconds: number | undefined,
  distance: number | undefined,
  distanceUnit: 'mi' | 'km'
): string | undefined {
  if (durationSeconds === undefined || distance === undefined || durationSeconds <= 0 || distance <= 0) {
    return undefined;
  }
  return `${formatDuration(Math.round(durationSeconds / distance))} min/${distanceUnit}`;
}

// Collapsed dimmed summary. Reps-based types prefer the last logged
// performance (analytics carries reps/weight only), falling back to the plan.
// Timed and distance types have no cross-session read model, so they summarise
// the item's own sets.
function buildSummary(
  item: SessionItem,
  last: LastPerformance,
  sets: SessionSet[],
  measurementType: MeasurementType
): string | undefined {
  if (measurementType === 'duration') {
    const timed = sets.filter((set) => set.durationSeconds !== undefined);
    const first = timed[0];
    if (first) {
      return `${timed.length} ${timed.length === 1 ? 'set' : 'sets'} · ${formatHold(first.durationSeconds!)}`;
    }
    return item.setsPlanned !== undefined ? `${item.setsPlanned} sets` : undefined;
  }

  if (measurementType === 'distance_duration') {
    const logged = sets.filter((set) => set.distance !== undefined || set.durationSeconds !== undefined);
    const first = logged[0];
    if (first) {
      const parts: string[] = [];
      if (first.distance !== undefined) {
        parts.push(`${first.distance} ${first.distanceUnit ?? 'mi'}`);
      }
      if (first.durationSeconds !== undefined) {
        parts.push(formatDuration(first.durationSeconds));
      }
      const head = parts.join(' · ');
      return logged.length > 1 ? `${logged.length} × ${head}` : head;
    }
    return item.setsPlanned !== undefined ? `${item.setsPlanned} sets` : undefined;
  }

  if (last && last.sets.length > 0) {
    const first = last.sets[0]!;
    const setCount = last.sets.length;
    if (measurementType === 'weight_reps' && first.weight !== undefined) {
      return `${first.weight} ${first.weightUnit} × ${first.reps ?? '–'} × ${setCount}`;
    }
    if (first.reps !== undefined) {
      return `${first.reps} × ${setCount}`;
    }
  }
  if (item.repsPlanned !== undefined || item.setsPlanned !== undefined) {
    return `${item.repsPlanned ?? '–'} × ${item.setsPlanned ?? '–'}`;
  }
  return undefined;
}

// One-line read-only description of a logged set, fields per measurement type.
function describeSet(set: SessionSet, measurementType: MeasurementType): string {
  const parts: string[] = [];
  if (measurementType === 'weight_reps' || measurementType === 'reps') {
    parts.push(`${set.reps ?? '-'} reps`);
  }
  if (measurementType === 'distance_duration' && set.distance !== undefined) {
    parts.push(`${set.distance} ${set.distanceUnit ?? 'mi'}`);
  }
  if (
    (measurementType === 'duration' || measurementType === 'distance_duration') &&
    set.durationSeconds !== undefined
  ) {
    parts.push(formatDuration(set.durationSeconds));
  }
  if (measurementType === 'weight_reps') {
    parts.push(`${set.weight ?? '-'} ${set.weightUnit}`);
  } else if (set.weight !== undefined) {
    parts.push(`${set.weight} ${set.weightUnit}`);
  }
  return parts.length > 0 ? parts.join(' × ') : '-';
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
  onToggle,
  onUpdate,
  onRemove,
  onDnf,
  onCompleted,
  dragHandle,
}: SessionItemCardProps) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState(item.notes ?? '');
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [perSetOpen, setPerSetOpen] = useState(false);
  // Optional weight add-on: collapsed by default for every type but weight_reps.
  const [weightOpen, setWeightOpen] = useState(false);
  const [draft, setDraft] = useState<AggregateDraft | null>(null);
  const notesId = useId();
  const startRestTimer = useUiStore((state) => state.startRestTimer);
  const clearRestTimer = useUiStore((state) => state.clearRestTimer);
  const restTimer = useUiStore((state) => state.restTimer);
  const showToast = useUiStore((state) => state.showToast);

  const sets = useLiveQuery(() => listSetsForItem(item.id), [item.id]) ?? [];
  const lastPerformance = useLiveQuery(
    () => getLastPerformance(item.exerciseNameSnapshot),
    [item.exerciseNameSnapshot]
  );
  const preferences = useLiveQuery(() => getPreferences(), []);
  const mode = preferences?.loggingMode ?? 'basic';
  const preferenceUnit: WeightUnit = preferences?.weightUnit ?? 'lb';
  const preferenceDistanceUnit = preferences?.distanceUnit ?? 'mi';
  const measurementType = item.measurementTypeSnapshot ?? 'weight_reps';
  const showReps = measurementType === 'weight_reps' || measurementType === 'reps';
  const showDuration = measurementType === 'duration' || measurementType === 'distance_duration';
  const showDistance = measurementType === 'distance_duration';
  const weightIsPrimary = measurementType === 'weight_reps';

  const summary = buildSummary(item, lastPerformance, sets, measurementType);
  const summaryLabel = showReps ? 'Prev' : 'Logged';
  const isDnf = item.dnfAt !== undefined;

  // Prefill the basic-mode aggregate draft when the card opens; reset on close
  // so the next open recomputes. Once seeded we never clobber user edits, but
  // we still fill in if liveQuery data lands after the open (prev ?? …).
  useEffect(() => {
    if (!expanded) {
      setDraft(null);
      setWeightOpen(false);
      return;
    }
    setDraft(
      (prev) =>
        prev ?? computeAggregatePrefill(item, lastPerformance, preferenceUnit, measurementType, preferenceDistanceUnit)
    );
  }, [expanded, lastPerformance, preferenceUnit, measurementType, preferenceDistanceUnit, item.setsPlanned, item.repsPlanned]);

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

  function handleSetChange(set: SessionSet, patch: SetRowPatch) {
    void updateSet(set.id, patch);
    if (patch.completed === true && item.restSeconds) {
      startRestTimer(item.id, item.restSeconds);
    }
  }

  async function handleCompleted() {
    if (!draft) {
      return;
    }
    // Only the fields this measurement type owns are written; applyAggregateSets
    // preserves existing per-set values for anything left undefined.
    const includeWeight = weightIsPrimary || weightOpen;
    try {
      await applyAggregateSets(item.id, {
        sets: draft.sets,
        weightUnit: draft.weightUnit,
        reps: showReps ? draft.reps : undefined,
        weight: includeWeight ? draft.weight : undefined,
        durationSeconds: showDuration ? draft.durationSeconds : undefined,
        distance: showDistance ? draft.distance : undefined,
        distanceUnit: showDistance ? (draft.distanceUnit ?? preferenceDistanceUnit) : undefined,
      });
      if (item.restSeconds) {
        startRestTimer(item.id, item.restSeconds);
      }
      onCompleted?.();
    } catch {
      showToast('Could not save sets.', 'error');
    }
  }

  const draftDistanceUnit = draft?.distanceUnit ?? preferenceDistanceUnit;
  const pace = formatPace(draft?.durationSeconds, draft?.distance, draftDistanceUnit);

  const setsInput = (
    <NumberInput
      size="sm"
      label="Sets"
      aria-label={`${item.exerciseNameSnapshot} sets`}
      min={1}
      step={1}
      allowDecimal={false}
      value={draft?.sets}
      onChange={(value) => setDraft((d) => (d ? { ...d, sets: typeof value === 'number' ? value : 1 } : d))}
      style={{ flex: 1, minWidth: 0 }}
    />
  );

  const repsInput = (
    <NumberInput
      size="sm"
      label="Reps"
      aria-label={`${item.exerciseNameSnapshot} reps`}
      min={0}
      step={1}
      allowDecimal={false}
      value={draft?.reps}
      onChange={(value) =>
        setDraft((d) => (d ? { ...d, reps: typeof value === 'number' ? value : undefined } : d))
      }
      style={{ flex: 1, minWidth: 0 }}
    />
  );

  const durationInput = (
    <NumberInput
      size="sm"
      label="Duration (s)"
      aria-label={`${item.exerciseNameSnapshot} duration in seconds`}
      min={0}
      step={5}
      allowDecimal={false}
      value={draft?.durationSeconds}
      onChange={(value) =>
        setDraft((d) => (d ? { ...d, durationSeconds: typeof value === 'number' ? value : undefined } : d))
      }
      style={{ flex: 1, minWidth: 0 }}
    />
  );

  const distanceInputs = (
    <>
      <NumberInput
        size="sm"
        label="Distance"
        aria-label={`${item.exerciseNameSnapshot} distance`}
        min={0}
        step={0.1}
        decimalScale={2}
        value={draft?.distance}
        onChange={(value) =>
          setDraft((d) => (d ? { ...d, distance: typeof value === 'number' ? value : undefined } : d))
        }
        style={{ flex: 1, minWidth: 0 }}
      />
      <SegmentedControl
        size="sm"
        data={['mi', 'km']}
        value={draftDistanceUnit}
        onChange={(value) => setDraft((d) => (d ? { ...d, distanceUnit: value as 'mi' | 'km' } : d))}
      />
    </>
  );

  const weightInputs = (
    <>
      <NumberInput
        size="sm"
        label="Weight"
        aria-label={`${item.exerciseNameSnapshot} weight`}
        min={0}
        step={draft?.weightUnit === 'kg' ? 1 : 5}
        value={draft?.weight}
        onChange={(value) =>
          setDraft((d) => (d ? { ...d, weight: typeof value === 'number' ? value : undefined } : d))
        }
        style={{ flex: 1, minWidth: 0 }}
      />
      <SegmentedControl
        size="sm"
        data={['lb', 'kg']}
        value={draft?.weightUnit ?? preferenceUnit}
        onChange={(value) => setDraft((d) => (d ? { ...d, weightUnit: value as WeightUnit } : d))}
      />
    </>
  );

  const setEditor = (
    <Stack gap="xs">
      {sets.map((set) => (
        <SetRow
          key={set.id}
          set={set}
          measurementType={measurementType}
          onChange={(patch) => handleSetChange(set, patch)}
          onRemove={() => handleRemoveSet(set.id)}
          timerSlot={<SetRowTimer set={set} />}
        />
      ))}
      <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={handleAddSet}>
        Add set
      </Button>
    </Stack>
  );

  return (
    <Card withBorder radius="lg" padding="xs" style={phase === 'finished' ? { opacity: 0.72 } : undefined}>
      <Group wrap="nowrap" gap={0} align="center">
        {dragHandle}
        <UnstyledButton
          onClick={onToggle}
          aria-expanded={expanded}
          style={{ flex: 1, minWidth: 0, padding: 'var(--space-2)' }}
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
      </Group>

      <Collapse in={expanded}>
        <Box px="xs" pb="xs" pt="sm">
          {!editable ? (
            <Stack gap={4}>
              {sets.map((set) => (
                <Text key={set.id} size="sm">
                  Set {set.setNumber}: {describeSet(set, measurementType)}
                  {set.isWarmup ? ' (warmup)' : ''}
                  {set.completed ? ' ✓' : ''}
                </Text>
              ))}
              {item.notes ? (
                <Text size="sm" c="dimmed">
                  {item.notes}
                </Text>
              ) : null}
            </Stack>
          ) : mode === 'basic' ? (
            <Stack gap="sm">
              {summary ? (
                <Text size="xs" c="dimmed">
                  {summaryLabel}: {summary}
                </Text>
              ) : null}
              <Group gap="xs" wrap="nowrap" align="flex-end">
                {setsInput}
                {showReps ? repsInput : null}
                {showDistance ? distanceInputs : null}
                {showDuration && !showDistance ? durationInput : null}
                {weightIsPrimary ? weightInputs : null}
              </Group>
              {showDistance ? (
                <Group gap="xs" wrap="nowrap" align="flex-end">
                  {durationInput}
                  <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 0 }}>
                    {pace ?? '–'}
                  </Text>
                </Group>
              ) : null}
              {!weightIsPrimary ? (
                <>
                  <UnstyledButton onClick={() => setWeightOpen((open) => !open)} aria-expanded={weightOpen}>
                    <Group gap={4} align="center">
                      <Text size="xs" c="dimmed">
                        Add weight
                      </Text>
                      {weightOpen ? (
                        <IconChevronUp size={14} color="var(--mantine-color-dimmed)" />
                      ) : (
                        <IconChevronDown size={14} color="var(--mantine-color-dimmed)" />
                      )}
                    </Group>
                  </UnstyledButton>
                  <Collapse in={weightOpen}>
                    <Group gap="xs" wrap="nowrap" align="flex-end">
                      {weightInputs}
                    </Group>
                  </Collapse>
                </>
              ) : null}
              <Button color="actiGreen" fullWidth onClick={() => void handleCompleted()}>
                Completed
              </Button>

              <UnstyledButton onClick={() => setPerSetOpen((open) => !open)} aria-expanded={perSetOpen}>
                <Group gap={4} align="center">
                  <Text size="xs" c="dimmed">
                    Adjust individual sets
                  </Text>
                  {perSetOpen ? (
                    <IconChevronUp size={14} color="var(--mantine-color-dimmed)" />
                  ) : (
                    <IconChevronDown size={14} color="var(--mantine-color-dimmed)" />
                  )}
                </Group>
              </UnstyledButton>
              <Collapse in={perSetOpen}>{setEditor}</Collapse>
            </Stack>
          ) : (
            setEditor
          )}

          {editable ? (
            <Box mt="sm">
              {notesExpanded ? (
                <Textarea
                  id={notesId}
                  name={notesId}
                  autosize
                  minRows={2}
                  autoFocus
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.currentTarget.value)}
                  onBlur={commitNotes}
                  placeholder="Notes"
                  aria-label={`Notes for ${item.exerciseNameSnapshot}`}
                />
              ) : (
                <UnstyledButton onClick={expandNotes} style={{ width: '100%' }}>
                  <Text size="sm" c="dimmed" ta="left">
                    {item.notes ? item.notes : 'Add note'}
                  </Text>
                </UnstyledButton>
              )}
            </Box>
          ) : null}

          {editable ? (
            <Group justify="space-between" align="center" mt="sm" wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                {confirmingRemove ? (
                  <Group gap="xs" wrap="nowrap">
                    <Button variant="light" color="red" size="xs" onClick={onRemove}>
                      Remove
                    </Button>
                    <Button variant="subtle" color="gray" size="xs" onClick={() => setConfirmingRemove(false)}>
                      Cancel
                    </Button>
                  </Group>
                ) : (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="lg"
                    aria-label={`Remove ${item.exerciseNameSnapshot}`}
                    onClick={() => setConfirmingRemove(true)}
                  >
                    <IconX size={18} />
                  </ActionIcon>
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

      {restTimer && restTimer.itemId === item.id && restTimer.endsAt > Date.now() ? (
        <RestTimerBar
          endsAt={restTimer.endsAt}
          totalSeconds={item.restSeconds ?? 0}
          onClear={clearRestTimer}
        />
      ) : null}
    </Card>
  );
}
