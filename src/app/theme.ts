import type { Preference } from '../domain/types';

// 'system' removes the attribute so the `@media (prefers-color-scheme)`
// block in tokens.css decides; explicit 'light'/'dark' pins the theme.
export function applyTheme(theme: Preference['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}
