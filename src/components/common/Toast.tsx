import { useEffect } from 'react';
import { useUiStore } from '../../state/ui-store';

const AUTO_DISMISS_MS = 3000;

export function Toast() {
  const toast = useUiStore((state) => state.toast);
  const dismissToast = useUiStore((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = setTimeout(() => dismissToast(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) {
    return null;
  }

  return (
    <div
      className={`toast${toast.kind === 'error' ? ' toast--error' : ''}`}
      role="status"
      aria-live="polite"
    >
      {toast.message}
    </div>
  );
}
