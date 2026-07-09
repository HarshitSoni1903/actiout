import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

export type ImportConfirmModalProps = {
  open: boolean;
  summary: string;
  onConfirm(): void;
  onCancel(): void;
};

export function ImportConfirmModal({ open, summary, onConfirm, onCancel }: ImportConfirmModalProps) {
  return (
    <Modal open={open} title="Import backup" onClose={onCancel}>
      <p className="import-confirm__body">
        {summary}. This replaces all current data.
      </p>
      <div className="import-confirm__actions">
        <Button variant="danger" onClick={onConfirm}>
          Confirm import
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
