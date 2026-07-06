import { NavLink, useLocation } from 'react-router-dom';
import { isTabRoute } from './tab-routes';

const TABS = [
  { to: '/', label: 'Home' },
  { to: '/routines', label: 'Routines' },
  { to: '/progress', label: 'Progress' },
  { to: '/settings', label: 'Settings' },
] as const;

export function TabBar() {
  const location = useLocation();

  if (!isTabRoute(location.pathname)) {
    return null;
  }

  return (
    <nav className="tab-bar safe-bottom" aria-label="Primary">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `tab-bar__item${isActive ? ' tab-bar__item--active' : ''}`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
