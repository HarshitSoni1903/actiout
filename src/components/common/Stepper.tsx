import { useId } from 'react';
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

  const clamp = (n: number): number => (min !== undefined && n < min ? min : n);

  const handleDecrement = () => {
    const base = value ?? 0;
    onChange(clamp(round(base - step, allowDecimal)));
  };

  const handleIncrement = () => {
    const base = value ?? 0;
    onChange(clamp(round(base + step, allowDecimal)));
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
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
          value={value === undefined ? '' : String(value)}
          onChange={handleInputChange}
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
