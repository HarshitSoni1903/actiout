import { useState } from 'react';
import type { Session } from '../../domain/types';
import { Button } from '../common/Button';

export type DraftCardProps = {
  draft: Session;
  onResume(): void;
  onMarkDnf(): void;
};

function formatStartedTime(iso?: string): string {
  if (!iso) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function DraftCard({ draft, onResume, onMarkDnf }: DraftCardProps) {
  const [confirmingDnf, setConfirmingDnf] = useState(false);

  const routineNames =
    draft.routineLinks.length > 0
      ? draft.routineLinks.map((link) => link.routineNameSnapshot).join(', ')
      : 'Quick session';
  const total = draft.items.length;

  return (
    <div className="draft-card">
      <p className="draft-card__title">{routineNames}</p>
      <p className="draft-card__meta">
        Started {formatStartedTime(draft.startedAt)}
        {total > 0 ? ` · ${total} exercises` : ''}
      </p>

      {confirmingDnf ? (
        <div className="draft-card__confirm">
          <span className="draft-card__confirm-text">Mark this session as not finished?</span>
          <Button variant="danger" onClick={onMarkDnf}>
            Confirm
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingDnf(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="draft-card__actions">
          <Button variant="primary" onClick={onResume}>
            Resume
          </Button>
          <Button variant="danger" onClick={() => setConfirmingDnf(true)}>
            Mark DNF
          </Button>
        </div>
      )}
    </div>
  );
}
