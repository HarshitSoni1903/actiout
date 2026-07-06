import { create } from 'zustand';

// Ephemeral UI state only — no domain data lives here. Domain data flows
// through Dexie via useLiveQuery + the service layer.

export type ToastKind = 'info' | 'error';

export type UiState = {
  toast?: { message: string; kind: ToastKind };
  showToast(message: string, kind?: ToastKind): void;
  dismissToast(): void;
};

export const useUiStore = create<UiState>((set) => ({
  toast: undefined,
  showToast: (message, kind = 'info') => set({ toast: { message, kind } }),
  dismissToast: () => set({ toast: undefined }),
}));
