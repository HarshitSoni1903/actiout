import { Outlet, useLocation } from 'react-router-dom';
import { TabBar } from './layout/TabBar';
import { isTabRoute } from './layout/tab-routes';
import { useColorSchemeSync } from './mantine-theme';

export default function App() {
  useColorSchemeSync();
  const location = useLocation();
  const withTabBar = isTabRoute(location.pathname);

  return (
    <div className="app-shell">
      <main className={`app-content${withTabBar ? ' app-content--with-tabbar' : ''}`}>
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
