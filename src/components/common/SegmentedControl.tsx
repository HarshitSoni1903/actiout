export type SegmentedControlOption = { value: string; label: string };

export type SegmentedControlProps = {
  options: SegmentedControlOption[];
  value: string;
  onChange(v: string): void;
};

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="segmented-control" role="tablist">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`segmented-control__item${isActive ? ' segmented-control__item--active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
