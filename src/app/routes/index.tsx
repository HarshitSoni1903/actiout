import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Container } from '@mantine/core';
import App from '../App';
import { HomeScreen } from '../../components/home/HomeScreen';
import { ProgressScreen } from '../../components/progress/ProgressScreen';
import { RoutineListScreen } from '../../components/routines/RoutineListScreen';
import { RoutineEditorScreen } from '../../components/routines/RoutineEditorScreen';
import { SessionScreen } from '../../components/session/SessionScreen';
import { SettingsScreen } from '../../components/settings/SettingsScreen';

// Every routed screen renders in a fluid column: full width with padding on
// phones, centered readable column (540px) on larger screens.
function screen(children: ReactNode) {
  return (
    <Container size="xs" px="md" w="100%">
      {children}
    </Container>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: screen(<HomeScreen />) },
      { path: 'routines', element: screen(<RoutineListScreen />) },
      { path: 'routines/new', element: screen(<RoutineEditorScreen />) },
      { path: 'routines/:id', element: screen(<RoutineEditorScreen />) },
      { path: 'session/:id', element: screen(<SessionScreen />) },
      { path: 'progress', element: screen(<ProgressScreen />) },
      { path: 'settings', element: screen(<SettingsScreen />) },
    ],
  },
]);
