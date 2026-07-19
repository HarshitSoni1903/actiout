import { it, expect, vi } from 'vitest';
import { notifications } from '@mantine/notifications';
import { useUiStore } from './ui-store';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

it('showToast shows a notification with the message', () => {
  useUiStore.getState().showToast('Backup exported.');
  expect(notifications.show).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Backup exported.', color: 'actiGreen' })
  );
});

it('showToast shows a red notification for error kind', () => {
  useUiStore.getState().showToast('Could not export backup.', 'error');
  expect(notifications.show).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Could not export backup.', color: 'red' })
  );
});

it('startRestTimer sets restTimer with the itemId and a future endsAt', () => {
  const before = Date.now();
  useUiStore.getState().startRestTimer('item-1', 90);
  const timer = useUiStore.getState().restTimer;
  expect(timer?.itemId).toBe('item-1');
  expect(timer?.endsAt).toBeGreaterThan(before);
});

it('clearRestTimer clears restTimer', () => {
  useUiStore.getState().startRestTimer('item-1', 90);
  useUiStore.getState().clearRestTimer();
  expect(useUiStore.getState().restTimer).toBeUndefined();
});
