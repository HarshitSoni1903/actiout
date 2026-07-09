import { formatWeight } from '../../domain/units';
import type { HistoryEntry } from '../../services/analytics-service';
import { formatShortDate } from '../../utils/dates';
import { EmptyState } from '../common/EmptyState';

export type HistoryListProps = {
  entries: HistoryEntry[];
};

function formatSetLine(entry: HistoryEntry): string {
  const parts: string[] = [];
  if (entry.sets !== undefined && entry.reps !== undefined) {
    parts.push(`${entry.sets}×${entry.reps}`);
  } else if (entry.sets !== undefined) {
    parts.push(`${entry.sets} sets`);
  } else if (entry.reps !== undefined) {
    parts.push(`${entry.reps} reps`);
  }
  if (entry.weight !== undefined) {
    parts.push(`@ ${formatWeight(entry.weight, entry.weightUnit)}`);
  }
  return parts.length > 0 ? parts.join(' ') : 'No data logged';
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
