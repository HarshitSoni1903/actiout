import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { initializeDb } from './db/seed';
import * as bodyweightService from './services/bodyweight-service';
import * as preferenceService from './services/preference-service';
import { getPreferences } from './services/preference-service';
import * as routineService from './services/routine-service';
import * as sessionService from './services/session-service';
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

// Dev-only escape hatch: expose the service layer on window so it can be
// driven from the browser console during manual verification (seeding
// routines/sessions without a UI for the feature that produces them yet).
// Never included in production builds — import.meta.env.DEV is stripped by
// Vite's build-time replacement, so this whole block dead-code-eliminates.
if (import.meta.env.DEV) {
  (window as unknown as { __actiout: unknown }).__actiout = {
    routineService,
    sessionService,
    bodyweightService,
    preferenceService,
  };
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
