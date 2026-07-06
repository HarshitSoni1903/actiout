import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { initializeDb } from './db/seed';
import { getPreferences } from './services/preference-service';
import { router } from './app/routes';
import { applyTheme } from './app/theme';
import './app/styles/global.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

await initializeDb();
const preferences = await getPreferences();
applyTheme(preferences.theme);

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
