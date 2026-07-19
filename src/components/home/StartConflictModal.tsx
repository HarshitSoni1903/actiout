import { Button, Modal, Stack, Text } from '@mantine/core';
import type { Session } from '../../domain/types';

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
    <Modal opened={open} onClose={onCancel} title="Draft in progress">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          You have an unfinished session ({routineNames}). Resume it, or close it and start a new one.
        </Text>
        <Stack gap="sm">
          <Button size="lg" fullWidth onClick={onResume}>
            Resume draft
          </Button>
          <Button size="lg" fullWidth color="red" onClick={onReplace}>
            Close and start new
          </Button>
          <Button size="lg" fullWidth variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
}
