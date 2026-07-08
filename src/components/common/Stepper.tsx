import { useId, useState } from 'react';
import type { ChangeEvent } from 'react';

export type StepperProps = {
  value?: number;
  onChange(v: number | undefined): void;
  step?: number;
  min?: number;
  label: string;
  allowDecimal?: boolean;
};

function round(n: number, allowDecimal: boolean): number {
  return allowDecimal ? Math.round(n * 100) / 100 : Math.round(n);
}

export function Stepper({ value, onChange, step = 1, min, label, allowDecimal = false }: StepperProps) {
  const inputId = useId();
  // Buffers raw keystrokes while the input is focused (non-null = focused)
  // so the fully-controlled `value` prop round-tripping through the parent
  // (e.g. Dexie/liveQuery) can't snap typed text — like a trailing decimal
  // point — back to a rounded echo mid-entry. Reverts to the prop on blur.
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number): number => (min !== undefined && n < min ? min : n);

  const handleDecrement = () => {
    const base = value ?? 0;
    const next = clamp(round(base - step, allowDecimal));
    onChange(next);
    if (draft !== null) {
      setDraft(String(next));
    }
  };

  const handleIncrement = () => {
    const base = value ?? 0;
    const next = clamp(round(base + step, allowDecimal));
    onChange(next);
    if (draft !== null) {
      setDraft(String(next));
    }
  };

  const handleFocus = () => {
    setDraft(value === undefined ? '' : String(value));
  };

  const handleBlur = () => {
    setDraft(null);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setDraft(raw);

    if (raw.trim() === '') {
      onChange(undefined);
      return;
    }

    const parsed = allowDecimal ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      return;
    }

    onChange(clamp(parsed));
  };

  const displayValue = draft ?? (value === undefined ? '' : String(value));

  return (
    <div className="stepper">
      <label className="stepper__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="stepper__controls">
        <button
          type="button"
          className="stepper__btn"
          aria-label={`Decrease ${label}`}
          onClick={handleDecrement}
        >
          &minus;
        </button>
        <input
          id={inputId}
          className="stepper__input"
          type="text"
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          placeholder="—"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        <button
          type="button"
          className="stepper__btn"
          aria-label={`Increase ${label}`}
          onClick={handleIncrement}
        >
          +
        </button>
      </div>
    </div>
  );
}
