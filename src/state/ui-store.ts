import { create } from 'zustand';
import { notifications } from '@mantine/notifications';

// Ephemeral UI state only — no domain data lives here. Domain data flows
// through Dexie via useLiveQuery + the service layer.

export type ToastKind = 'info' | 'error';

// Rest-timer countdown after a set is marked completed — transient, never
// persisted (§7c): a reload simply drops it.
export type RestTimer = { itemId: string; endsAt: number };

export type UiState = {
  showToast(message: string, kind?: ToastKind): void;
  restTimer?: RestTimer;
  startRestTimer(itemId: string, seconds: number): void;
  clearRestTimer(): void;
};

export const useUiStore = create<UiState>((set) => ({
  showToast: (message, kind = 'info') =>
    notifications.show({ message, color: kind === 'error' ? 'red' : 'actiGreen', autoClose: 3500 }),
  restTimer: undefined,
  startRestTimer: (itemId, seconds) => set({ restTimer: { itemId, endsAt: Date.now() + seconds * 1000 } }),
  clearRestTimer: () => set({ restTimer: undefined }),
}));
