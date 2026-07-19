import { useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';

export type FinishBarProps = {
  doneCount: number;
  total: number;
  onFinish(): void;
};

export function FinishBar({ doneCount, total, onFinish }: FinishBarProps) {
  const [finishOpen, setFinishOpen] = useState(false);

  return (
    <>
      <Button size="lg" fullWidth onClick={() => setFinishOpen(true)}>
        Finish workout
      </Button>

      <Modal opened={finishOpen} onClose={() => setFinishOpen(false)} title="Finish workout?">
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            {doneCount} of {total} done — finish?
          </Text>
          <Group grow>
            <Button variant="default" onClick={() => setFinishOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setFinishOpen(false);
                onFinish();
              }}
            >
              Finish
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
