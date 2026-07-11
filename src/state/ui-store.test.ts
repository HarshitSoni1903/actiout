import { it, expect } from 'vitest';
import { useUiStore } from './ui-store';

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
