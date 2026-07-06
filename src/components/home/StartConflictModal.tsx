import type { Session } from '../../domain/types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

export type StartConflictModalProps = {
  open: boolean;
  draft: Session;
  onResume(): void;
  onReplace(): void;
  onCancel(): void;
};

export function StartConflictModal({ open, draft, onResume, onReplace, onCancel }: StartConflictModalProps) {
  const routineNames =
    draft.routineLinks.length > 0
      ? draft.routineLinks.map((link) => link.routineNameSnapshot).join(', ')
      : 'Quick session';

  return (
    <Modal open={open} title="Draft in progress" onClose={onCancel}>
      <p className="start-conflict__body">
        You have an unfinished session ({routineNames}). Resume it, or close it and start a new one.
      </p>
      <div className="start-conflict__actions">
        <Button variant="primary" onClick={onResume}>
          Resume draft
        </Button>
        <Button variant="danger" onClick={onReplace}>
          Close and start new
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
