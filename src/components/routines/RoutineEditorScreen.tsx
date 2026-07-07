import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { RoutineInput, RoutineItemInput } from '../../services/routine-service';
import { createRoutine, deleteRoutine, getRoutine, updateRoutine } from '../../services/routine-service';
import { getPreferences } from '../../services/preference-service';
import { useUiStore } from '../../state/ui-store';
import { newId } from '../../utils/ids';
import { Button } from '../common/Button';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';
import { Stepper } from '../common/Stepper';
import { ExerciseTypeahead } from './ExerciseTypeahead';
import { RoutineItemRow } from './RoutineItemRow';
import './routines.css';

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
  const [defaultSets, setDefaultSets] = useState<number | undefined>(undefined);
  const [defaultReps, setDefaultReps] = useState<number | undefined>(undefined);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [items, setItems] = useState<EditorItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const notesRef = useRef<string | undefined>(undefined);
  const initializedRef = useRef(false);

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

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  function addItem(exerciseName: string) {
    setItems((prev) => [...prev, { clientId: newId(), exerciseName }]);
  }

  function updateItem(clientId: string, patch: Partial<EditorItem>) {
    setItems((prev) => prev.map((item) => (item.clientId === clientId ? { ...item, ...patch } : item)));
  }

  function removeItem(clientId: string) {
    setItems((prev) => prev.filter((item) => item.clientId !== clientId));
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const next = prev.slice();
      const temp = next[index] as EditorItem;
      next[index] = next[targetIndex] as EditorItem;
      next[targetIndex] = temp;
      return next;
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
      <div className="routine-editor">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="routine-editor">
      <div className="routine-editor__header">
        <button type="button" className="routine-editor__back" onClick={() => navigate('/routines')}>
          &lsaquo; Routines
        </button>
        <h1 className="routine-editor__title">{isEditingExisting ? 'Edit routine' : 'New routine'}</h1>
      </div>

      <Field label="Name" htmlFor="routine-name" error={nameError}>
        <input
          id="routine-name"
          type="text"
          className="routine-editor__input"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) {
              setNameError(undefined);
            }
          }}
        />
      </Field>

      <Field label="Category" htmlFor="routine-category">
        <select
          id="routine-category"
          className="routine-editor__select"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">None</option>
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
      </Field>

      <div className="routine-editor__weekdays">
        <span className="routine-editor__weekdays-label">Days</span>
        <div className="weekday-toggle">
          {WEEKDAY_LABELS.map((label, day) => {
            const isActive = daysOfWeek.includes(day);
            return (
              <button
                key={day}
                type="button"
                className={`weekday-toggle__day${isActive ? ' weekday-toggle__day--active' : ''}`}
                aria-pressed={isActive}
                aria-label={
                  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]
                }
                onClick={() => toggleDay(day)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="routine-editor__defaults">
        <Stepper label="Default sets" value={defaultSets} onChange={setDefaultSets} min={0} />
        <Stepper label="Default reps" value={defaultReps} onChange={setDefaultReps} min={0} />
      </div>

      <div className="routine-editor__items">
        <span className="routine-editor__items-label">Exercises</span>
        {items.length === 0 ? (
          <p className="routine-editor__items-empty">No exercises yet — add one below.</p>
        ) : (
          <ul className="routine-item-rows">
            {items.map((item, index) => (
              <RoutineItemRow
                key={item.clientId}
                item={item}
                position={index + 1}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                weightUnit={weightUnit}
                onChange={(patch) => updateItem(item.clientId, patch)}
                onMoveUp={() => moveItem(index, -1)}
                onMoveDown={() => moveItem(index, 1)}
                onRemove={() => removeItem(item.clientId)}
              />
            ))}
          </ul>
        )}

        <ExerciseTypeahead onPick={addItem} placeholder="Add exercise" />
      </div>

      <div className="routine-editor__actions">
        <Button variant="primary" size="lg" onClick={() => void handleSave()} disabled={saving}>
          Save
        </Button>
      </div>

      {isEditingExisting ? (
        <div className="routine-editor__danger-zone">
          <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
            Delete routine
          </Button>
        </div>
      ) : null}

      <Modal open={deleteModalOpen} title="Delete routine?" onClose={() => setDeleteModalOpen(false)}>
        <p className="routine-editor__delete-body">
          Delete routine? Workout history is not affected.
        </p>
        <div className="routine-editor__delete-actions">
          <Button variant="danger" onClick={() => void handleDelete()}>
            Delete
          </Button>
          <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
