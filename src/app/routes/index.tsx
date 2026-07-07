import { createBrowserRouter } from 'react-router-dom';
import App from '../App';
import { HomeScreen } from '../../components/home/HomeScreen';
import { RoutineListScreen } from '../../components/routines/RoutineListScreen';
import { RoutineEditorScreen } from '../../components/routines/RoutineEditorScreen';

// Placeholder screens — replaced by Tasks 11-13. Each renders only its title
// so navigation and the app shell can be verified end to end.
function Screen({ title }: { title: string }) {
  return (
    <div className="screen">
      <h1>{title}</h1>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'routines', element: <RoutineListScreen /> },
      { path: 'routines/new', element: <RoutineEditorScreen /> },
      { path: 'routines/:id', element: <RoutineEditorScreen /> },
      { path: 'session/:id', element: <Screen title="Session" /> },
      { path: 'progress', element: <Screen title="Progress" /> },
      { path: 'settings', element: <Screen title="Settings" /> },
    ],
  },
]);
