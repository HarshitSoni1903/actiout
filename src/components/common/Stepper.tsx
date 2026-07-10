import { useEffect, useId, useRef, useState } from 'react';
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

  // Leads the `value` prop so consecutive rapid taps compound instead of
  // each recomputing from a still-stale prop (the prop only catches up after
  // onChange -> IndexedDB write -> liveQuery round-trips back down, which
  // routinely outlasts inter-tap intervals on mobile). Re-synced whenever the
  // parent's committed value actually changes.
  const latestRef = useRef<number | undefined>(value);
  useEffect(() => {
    latestRef.current = value;
  }, [value]);

  const clamp = (n: number): number => (min !== undefined && n < min ? min : n);

  const applyDelta = (dir: 1 | -1) => {
    const base = latestRef.current ?? 0;
    const next = clamp(round(base + dir * step, allowDecimal));
    latestRef.current = next; // lead the prop; the next tap builds on this
    onChange(next);
    if (draft !== null) {
      setDraft(String(next));
    }
  };

  const handleDecrement = () => applyDelta(-1);
  const handleIncrement = () => applyDelta(1);

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
      latestRef.current = undefined;
      onChange(undefined);
      return;
    }

    const parsed = allowDecimal ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      return;
    }

    const clamped = clamp(parsed);
    latestRef.current = clamped;
    onChange(clamped);
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
