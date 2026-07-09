import { createBrowserRouter } from 'react-router-dom';
import App from '../App';
import { HomeScreen } from '../../components/home/HomeScreen';
import { ProgressScreen } from '../../components/progress/ProgressScreen';
import { RoutineListScreen } from '../../components/routines/RoutineListScreen';
import { RoutineEditorScreen } from '../../components/routines/RoutineEditorScreen';
import { SessionScreen } from '../../components/session/SessionScreen';
import { SettingsScreen } from '../../components/settings/SettingsScreen';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'routines', element: <RoutineListScreen /> },
      { path: 'routines/new', element: <RoutineEditorScreen /> },
      { path: 'routines/:id', element: <RoutineEditorScreen /> },
      { path: 'session/:id', element: <SessionScreen /> },
      { path: 'progress', element: <ProgressScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
    ],
  },
]);
