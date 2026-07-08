import type { WeightUnit } from '../../domain/types';
import { formatWeight } from '../../domain/units';
import type { PRSummary } from '../../services/analytics-service';

export type PRBlockProps = {
  prs: PRSummary;
  unit: WeightUnit;
  includeDnf: boolean;
  onIncludeDnfChange(value: boolean): void;
};

function formatShortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year as number, (month as number) - 1, day as number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function PRBlock({ prs, unit, includeDnf, onIncludeDnfChange }: PRBlockProps) {
  return (
    <div className="pr-block">
      <div className="pr-block__stats">
        <div className="pr-block__stat">
          <span className="pr-block__stat-label">Best weight</span>
          <span className="pr-block__stat-value">{prs.weight ? formatWeight(prs.weight.value, unit) : '—'}</span>
          {prs.weight ? <span className="pr-block__stat-date">{formatShortDate(prs.weight.date)}</span> : null}
        </div>
        <div className="pr-block__stat">
          <span className="pr-block__stat-label">Best volume</span>
          <span className="pr-block__stat-value">{prs.volume ? formatWeight(prs.volume.value, unit) : '—'}</span>
          {prs.volume ? <span className="pr-block__stat-date">{formatShortDate(prs.volume.date)}</span> : null}
        </div>
      </div>
      <label className="pr-block__dnf-toggle">
        <input
          type="checkbox"
          className="pr-block__dnf-checkbox"
          checked={includeDnf}
          onChange={(event) => onIncludeDnfChange(event.target.checked)}
        />
        Include DNF sessions
      </label>
    </div>
  );
}
