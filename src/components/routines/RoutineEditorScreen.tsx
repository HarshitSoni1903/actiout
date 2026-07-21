import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Anchor,
  Button,
  Chip,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { RoutineInput, RoutineItemInput } from '../../services/routine-service';
import { createRoutine, deleteRoutine, getRoutine, updateRoutine } from '../../services/routine-service';
import { getPreferences } from '../../services/preference-service';
import { useUiStore } from '../../state/ui-store';
import { newId } from '../../utils/ids';
import { ExerciseTypeahead } from './ExerciseTypeahead';
import { SortableRoutineRow } from './SortableRoutineRow';

const CATEGORY_OPTIONS = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'push',
  'pull',
  'core',
  'cardio',
  'mixed',
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type EditorItem = RoutineItemInput & { clientId: string };

export function RoutineEditorScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const showToast = useUiStore((state) => state.showToast);

  const existingRoutine = useLiveQuery(() => (id ? getRoutine(id) : undefined), [id]);
  const preferences = useLiveQuery(() => getPreferences(), []);
  const weightUnit = preferences?.weightUnit ?? 'lb';

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState('');
  // New routines start prefilled with basic defaults (3×10, 90s rest on new
  // items); editing an existing routine replaces these from the loaded row.
  const [defaultSets, setDefaultSets] = useState<number | undefined>(3);
  const [defaultReps, setDefaultReps] = useState<number | undefined>(10);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [timeOfDay, setTimeOfDay] = useState('');
  const [items, setItems] = useState<EditorItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const notesRef = useRef<string | undefined>(undefined);
  const initializedRef = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Editor state is local until Save — seed it once from the loaded routine
  // (not on every live-query refresh, which would clobber in-progress edits).
  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    if (id) {
      if (existingRoutine === undefined) {
        return;
      }
      setName(existingRoutine.name);
      setCategory(existingRoutine.category ?? '');
      setDefaultSets(existingRoutine.defaultSets);
      setDefaultReps(existingRoutine.defaultReps);
      setDaysOfWeek(existingRoutine.daysOfWeek);
      setTimeOfDay(existingRoutine.timeOfDay ?? '');
      setItems(
        existingRoutine.items.map((item) => ({
          clientId: newId(),
          exerciseName: item.exerciseNameSnapshot,
          defaultSets: item.defaultSets,
          defaultReps: item.defaultReps,
          defaultWeight: item.defaultWeight,
          defaultWeightUnit: item.defaultWeightUnit,
          restSeconds: item.restSeconds,
          notes: item.notes,
        }))
      );
      notesRef.current = existingRoutine.notes;
      initializedRef.current = true;
    } else {
      initializedRef.current = true;
    }
  }, [id, existingRoutine]);

  function toggleDays(values: string[]) {
    setDaysOfWeek(values.map((value) => Number(value)).sort((a, b) => a - b));
  }

  function addItem(exerciseName: string) {
    setItems((prev) => [...prev, { clientId: newId(), exerciseName, restSeconds: 90 }]);
  }

  function updateItem(clientId: string, patch: Partial<EditorItem>) {
    setItems((prev) => prev.map((item) => (item.clientId === clientId ? { ...item, ...patch } : item)));
  }

  function removeItem(clientId: string) {
    setItems((prev) => prev.filter((item) => item.clientId !== clientId));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    setItems((prev) => {
      const oldIndex = prev.findIndex((item) => item.clientId === active.id);
      const newIndex = prev.findIndex((item) => item.clientId === over.id);
      if (oldIndex === -1 || newIndex === -1) {
        return prev;
      }
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (trimmedName === '') {
      setNameError('Name is required');
      return;
    }
    setNameError(undefined);
    setSaving(true);

    const input: RoutineInput = {
      name: trimmedName,
      category: category === '' ? undefined : category,
      notes: notesRef.current,
      timeOfDay: timeOfDay === '' ? undefined : timeOfDay,
      defaultSets,
      defaultReps,
      daysOfWeek,
      items: items.map(({ clientId, ...rest }) => rest),
    };

    try {
      if (id) {
        await updateRoutine(id, input);
        showToast('Routine updated');
      } else {
        await createRoutine(input);
        showToast('Routine created');
      }
      navigate('/routines');
    } catch {
      showToast('Could not save the routine.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) {
      return;
    }
    try {
      await deleteRoutine(id);
      showToast('Routine deleted');
      navigate('/routines');
    } catch {
      showToast('Could not delete the routine.', 'error');
    } finally {
      setDeleteModalOpen(false);
    }
  }

  const isEditingExisting = Boolean(id);
  if (isEditingExisting && existingRoutine === undefined) {
    return (
      <Stack gap="lg">
        <Text c="dimmed">Loading…</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="lg" pb="xl">
      <Stack gap={4}>
        <Anchor component="button" type="button" size="sm" c="dimmed" onClick={() => navigate('/routines')}>
          &lsaquo; Routines
        </Anchor>
        <Title order={1}>{isEditingExisting ? 'Edit routine' : 'New routine'}</Title>
      </Stack>

      <TextInput
        label="Name"
        value={name}
        error={nameError}
        onChange={(event) => {
          setName(event.currentTarget.value);
          if (nameError) {
            setNameError(undefined);
          }
        }}
      />

      <Select
        label="Category"
        placeholder="None"
        clearable
        data={CATEGORY_OPTIONS.map((option) => ({
          value: option,
          label: option.charAt(0).toUpperCase() + option.slice(1),
        }))}
        value={category === '' ? null : category}
        onChange={(value) => setCategory(value ?? '')}
      />

      <Stack gap={6}>
        <Text size="sm" fw={500}>
          Days
        </Text>
        <Chip.Group multiple value={daysOfWeek.map(String)} onChange={toggleDays}>
          <Group gap="xs">
            {WEEKDAY_LABELS.map((label, day) => (
              <Chip key={day} value={String(day)} aria-label={WEEKDAY_FULL_NAMES[day]}>
                {label}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </Stack>

      <TextInput
        type="time"
        label="Time of day"
        description="Leave empty for an all-day routine"
        value={timeOfDay}
        onChange={(event) => setTimeOfDay(event.currentTarget.value)}
      />

      <Group grow gap="sm">
        <NumberInput
          label="Default sets"
          value={defaultSets}
          onChange={(value) => setDefaultSets(typeof value === 'number' ? value : undefined)}
          min={0}
          step={1}
          allowDecimal={false}
        />
        <NumberInput
          label="Default reps"
          value={defaultReps}
          onChange={(value) => setDefaultReps(typeof value === 'number' ? value : undefined)}
          min={0}
          step={1}
          allowDecimal={false}
        />
      </Group>

      <Stack gap="sm">
        <Text size="sm" fw={700} c="dimmed" tt="uppercase">
          Exercises
        </Text>

        {items.length === 0 ? (
          <Text c="dimmed" size="sm">
            No exercises yet — add one below.
          </Text>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((item) => item.clientId)} strategy={verticalListSortingStrategy}>
              <Stack gap="sm">
                {items.map((item, index) => (
                  <SortableRoutineRow
                    key={item.clientId}
                    clientId={item.clientId}
                    item={item}
                    position={index + 1}
                    weightUnit={weightUnit}
                    onChange={(patch) => updateItem(item.clientId, patch)}
                    onRemove={() => removeItem(item.clientId)}
                  />
                ))}
              </Stack>
            </SortableContext>
          </DndContext>
        )}

        <ExerciseTypeahead onPick={addItem} placeholder="Add exercise" />
      </Stack>

      <div
        style={{
          position: 'sticky',
          bottom: 'calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0px) + var(--space-3))',
          zIndex: 10,
          background: 'var(--mantine-color-body)',
          paddingTop: 'var(--space-3)',
          paddingBottom: 'var(--space-3)',
        }}
      >
        <Button size="lg" fullWidth onClick={() => void handleSave()} loading={saving}>
          Save
        </Button>
      </div>

      {isEditingExisting ? (
        <Button color="red" variant="light" onClick={() => setDeleteModalOpen(true)}>
          Delete routine
        </Button>
      ) : null}

      <Modal opened={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete routine?">
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            Delete routine? Workout history is not affected.
          </Text>
          <Group grow>
            <Button variant="default" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void handleDelete()}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
