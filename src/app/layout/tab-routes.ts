// The exact set of routes the TabBar shows itself on. Any route not in this
// list (routine detail/new, an in-progress session, etc.) hides the TabBar.
export const TAB_PATHS = ['/', '/routines', '/progress', '/settings'] as const;

export function isTabRoute(pathname: string): boolean {
  return (TAB_PATHS as readonly string[]).includes(pathname);
}
