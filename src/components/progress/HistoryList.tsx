import { formatWeight } from '../../domain/units';
import type { HistoryEntry } from '../../services/analytics-service';
import { formatShortDate } from '../../utils';
import { EmptyState } from '../common/EmptyState';

export type HistoryListProps = {
  entries: HistoryEntry[];
};

function formatSetLine(entry: HistoryEntry): string {
  if (entry.setCount === 0) {
    return 'No sets logged';
  }
  const top = entry.topSet !== undefined ? formatWeight(entry.topSet, entry.weightUnit) : '—';
  return `${entry.setCount} sets · ${entry.totalReps ?? 0} reps · top ${top} · vol ${Math.round(entry.totalVolume ?? 0)}`;
}

export function HistoryList({ entries }: HistoryListProps) {
  if (entries.length === 0) {
    return <EmptyState title="No history yet" description="Logged sets for this exercise will show up here." />;
  }

  return (
    <ul className="history-list">
      {entries.map((entry, index) => (
        <li key={`${entry.sessionId}-${entry.position}-${index}`} className="history-list__row">
          <div className="history-list__main">
            <span className="history-list__date">{formatShortDate(entry.date)}</span>
            <span className="history-list__position">#{entry.position}</span>
            <span className="history-list__sets">{formatSetLine(entry)}</span>
          </div>
          {entry.status === 'dnf' ? <span className="history-list__dnf-badge">DNF</span> : null}
        </li>
      ))}
    </ul>
  );
}
