import { useState } from 'react';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

export type FinishBarProps = {
  doneCount: number;
  total: number;
  onFinish(): void;
  onDnf(): void;
};

export function FinishBar({ doneCount, total, onFinish, onDnf }: FinishBarProps) {
  const [finishOpen, setFinishOpen] = useState(false);
  const [dnfOpen, setDnfOpen] = useState(false);

  return (
    <div className="finish-bar">
      <Button variant="primary" size="lg" className="finish-bar__finish" onClick={() => setFinishOpen(true)}>
        Finish workout
      </Button>
      <Button variant="danger" className="finish-bar__dnf" onClick={() => setDnfOpen(true)}>
        DNF
      </Button>

      <Modal open={finishOpen} title="Finish workout?" onClose={() => setFinishOpen(false)}>
        <p className="finish-bar__modal-body">
          {doneCount} of {total} done &mdash; finish?
        </p>
        <div className="finish-bar__modal-actions">
          <Button
            variant="primary"
            onClick={() => {
              setFinishOpen(false);
              onFinish();
            }}
          >
            Finish
          </Button>
          <Button variant="ghost" onClick={() => setFinishOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      <Modal open={dnfOpen} title="Did not finish?" onClose={() => setDnfOpen(false)}>
        <p className="finish-bar__modal-body">
          Mark as Did Not Finish? Stays in history, excluded from PRs.
        </p>
        <div className="finish-bar__modal-actions">
          <Button
            variant="danger"
            onClick={() => {
              setDnfOpen(false);
              onDnf();
            }}
          >
            Mark DNF
          </Button>
          <Button variant="ghost" onClick={() => setDnfOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
