import { useState } from 'react';
import type { WeightUnit } from '../../domain/types';
import { Stepper } from '../common/Stepper';

export type RoutineItemRowValue = {
  exerciseName: string;
  defaultSets?: number;
  defaultReps?: number;
  defaultWeight?: number;
  defaultWeightUnit?: WeightUnit;
};

export type RoutineItemRowProps = {
  item: RoutineItemRowValue;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  weightUnit: WeightUnit;
  onChange(patch: Partial<RoutineItemRowValue>): void;
  onMoveUp(): void;
  onMoveDown(): void;
  onRemove(): void;
};

function summarize(item: RoutineItemRowValue, weightUnit: WeightUnit): string {
  const parts: string[] = [];
  if (item.defaultSets !== undefined && item.defaultReps !== undefined) {
    parts.push(`${item.defaultSets}×${item.defaultReps}`);
  } else if (item.defaultSets !== undefined) {
    parts.push(`${item.defaultSets} sets`);
  } else if (item.defaultReps !== undefined) {
    parts.push(`${item.defaultReps} reps`);
  }
  if (item.defaultWeight !== undefined) {
    parts.push(`${item.defaultWeight} ${item.defaultWeightUnit ?? weightUnit}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'defaults';
}

export function RoutineItemRow({
  item,
  position,
  isFirst,
  isLast,
  weightUnit,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: RoutineItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  return (
    <li className="routine-item-row">
      <div className="routine-item-row__header">
        <button
          type="button"
          className="routine-item-row__toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          <span className="routine-item-row__position">{position}</span>
          <span className="routine-item-row__main">
            <span className="routine-item-row__name">{item.exerciseName}</span>
            <span className="routine-item-row__summary">{summarize(item, weightUnit)}</span>
          </span>
        </button>

        <div className="routine-item-row__actions">
          <button
            type="button"
            className="routine-item-row__reorder-btn"
            aria-label={`Move ${item.exerciseName} up`}
            disabled={isFirst}
            onClick={onMoveUp}
          >
            &#9650;
          </button>
          <button
            type="button"
            className="routine-item-row__reorder-btn"
            aria-label={`Move ${item.exerciseName} down`}
            disabled={isLast}
            onClick={onMoveDown}
          >
            &#9660;
          </button>
          {confirmingRemove ? (
            <span className="routine-item-row__confirm">
              <button
                type="button"
                className="routine-item-row__confirm-btn"
                onClick={onRemove}
              >
                Remove
              </button>
              <button
                type="button"
                className="routine-item-row__cancel-btn"
                onClick={() => setConfirmingRemove(false)}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="routine-item-row__remove-btn"
              aria-label={`Remove ${item.exerciseName}`}
              onClick={() => setConfirmingRemove(true)}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {expanded ? (
        <div className="routine-item-row__panel">
          <Stepper
            label="Sets"
            value={item.defaultSets}
            onChange={(v) => onChange({ defaultSets: v })}
            min={0}
          />
          <Stepper
            label="Reps"
            value={item.defaultReps}
            onChange={(v) => onChange({ defaultReps: v })}
            min={0}
          />
          <Stepper
            label={`Weight (${item.defaultWeightUnit ?? weightUnit})`}
            value={item.defaultWeight}
            onChange={(v) => onChange({ defaultWeight: v, defaultWeightUnit: v === undefined ? item.defaultWeightUnit : weightUnit })}
            step={weightUnit === 'kg' ? 1 : 5}
            min={0}
            allowDecimal
          />
        </div>
      ) : null}
    </li>
  );
}
