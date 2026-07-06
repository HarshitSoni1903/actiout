// The TabBar shows on every route EXCEPT active session screens — an
// in-progress workout is the one full-screen, distraction-free flow.
export function isTabRoute(pathname: string): boolean {
  return !pathname.startsWith('/session/');
}
