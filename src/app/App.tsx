import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPreferences } from '../services/preference-service';
import { Toast } from '../components/common/Toast';
import { TabBar } from './layout/TabBar';
import { isTabRoute } from './layout/tab-routes';
import { applyTheme } from './theme';

// Keeps <html data-theme> in sync with the stored preference. main.tsx
// already applies the theme once before the first paint (no flash); this
// hook re-applies it whenever the preference changes afterward (e.g. the
// user flips the theme in Settings).
function useThemeSync() {
  const preferences = useLiveQuery(() => getPreferences());

  useEffect(() => {
    if (preferences) {
      applyTheme(preferences.theme);
    }
  }, [preferences]);
}

export default function App() {
  useThemeSync();
  const location = useLocation();
  const withTabBar = isTabRoute(location.pathname);

  return (
    <div className="app-shell">
      <main className={`app-content${withTabBar ? ' app-content--with-tabbar' : ''}`}>
        <Outlet />
      </main>
      <TabBar />
      <Toast />
    </div>
  );
}
