import { useEffect, useState } from 'react';
import type { WeightUnit } from '../../domain/types';
import { convertWeight, formatWeight } from '../../domain/units';
import { formatShortDate } from '../../utils/dates';
import { Button } from '../common/Button';
import { Stepper } from '../common/Stepper';

export type BodyweightQuickAddProps = {
  latestValue?: number;
  latestUnit?: WeightUnit;
  latestDate?: string;
  preferredUnit: WeightUnit;
  onSave(value: number): Promise<void> | void;
};

export function BodyweightQuickAdd({
  latestValue,
  latestUnit,
  latestDate,
  preferredUnit,
  onSave,
}: BodyweightQuickAddProps) {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const displayValue =
    latestValue !== undefined && latestUnit !== undefined
      ? latestUnit === preferredUnit
        ? latestValue
        : convertWeight(latestValue, latestUnit, preferredUnit)
      : undefined;

  useEffect(() => {
    if (expanded) {
      setValue(displayValue ?? 0);
    }
    // Only re-seed when the row is (re-)expanded, not on every latest-value change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const summary =
    displayValue !== undefined && latestDate
      ? `Bodyweight — ${formatWeight(displayValue, preferredUnit)}, ${formatShortDate(latestDate)}`
      : 'Bodyweight — log today';

  const handleSave = async () => {
    if (value === undefined || !(value > 0)) {
      return;
    }
    setSaving(true);
    try {
      await onSave(value);
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bodyweight-quick-add">
      <button type="button" className="bodyweight-quick-add__row" onClick={() => setExpanded((prev) => !prev)}>
        {summary}
      </button>

      {expanded ? (
        <div className="bodyweight-quick-add__form">
          <Stepper label="Bodyweight" value={value} onChange={setValue} step={0.5} min={1} allowDecimal />
          <Button variant="primary" onClick={handleSave} disabled={saving || value === undefined}>
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}
