import { createBrowserRouter } from 'react-router-dom';
import App from '../App';

// Placeholder screens — replaced by Tasks 9-13. Each renders only its title
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
      { index: true, element: <Screen title="Home" /> },
      { path: 'routines', element: <Screen title="Routines" /> },
      { path: 'routines/new', element: <Screen title="New Routine" /> },
      { path: 'routines/:id', element: <Screen title="Routine" /> },
      { path: 'session/:id', element: <Screen title="Session" /> },
      { path: 'progress', element: <Screen title="Progress" /> },
      { path: 'settings', element: <Screen title="Settings" /> },
    ],
  },
]);
