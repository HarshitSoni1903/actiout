import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

export type ImportConfirmModalProps = {
  open: boolean;
  summary: string;
  onConfirm(): void;
  onCancel(): void;
  title?: string;
  confirmLabel?: string;
};

export function ImportConfirmModal({
  open,
  summary,
  onConfirm,
  onCancel,
  title = 'Import backup',
  confirmLabel = 'Confirm import',
}: ImportConfirmModalProps) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="import-confirm__body">
        {summary}. This replaces all current data.
      </p>
      <div className="import-confirm__actions">
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
