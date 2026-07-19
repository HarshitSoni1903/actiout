import { Link, useLocation } from 'react-router-dom';
import { Text, UnstyledButton } from '@mantine/core';
import { IconBarbell, IconChartLine, IconHome, IconSettings } from '@tabler/icons-react';
import { isTabRoute } from './tab-routes';

type TabIcon = typeof IconHome;

const TABS: { to: string; label: string; Icon: TabIcon }[] = [
  { to: '/', label: 'Home', Icon: IconHome },
  { to: '/routines', label: 'Routines', Icon: IconBarbell },
  { to: '/progress', label: 'Progress', Icon: IconChartLine },
  { to: '/settings', label: 'Settings', Icon: IconSettings },
];

// Mirrors NavLink's default matching: exact for '/', prefix for everything
// else, so nested routes (e.g. /routines/new) still highlight their tab.
function isTabActive(to: string, pathname: string): boolean {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
}

export function TabBar() {
  const location = useLocation();

  if (!isTabRoute(location.pathname)) {
    return null;
  }

  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        display: 'flex',
        background: 'var(--mantine-color-body)',
        borderTop: '1px solid var(--mantine-color-default-border)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {TABS.map(({ to, label, Icon }) => {
        const active = isTabActive(to, location.pathname);
        const color = active ? 'var(--mantine-color-actiGreen-filled)' : 'var(--mantine-color-dimmed)';

        return (
          <UnstyledButton
            key={to}
            component={Link}
            to={to}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              minHeight: 'var(--tab-bar-height)',
            }}
          >
            <Icon size={22} stroke={1.75} color={color} />
            <Text size="xs" fw={active ? 700 : 500} style={{ color }}>
              {label}
            </Text>
          </UnstyledButton>
        );
      })}
    </nav>
  );
}
