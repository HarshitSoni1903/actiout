import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { initializeDb } from './db/seed';
import * as bodyweightService from './services/bodyweight-service';
import * as preferenceService from './services/preference-service';
import * as routineService from './services/routine-service';
import * as sessionService from './services/session-service';
import { requestPersistentStorage } from './utils';
import { router } from './app/routes';
import { mantineTheme } from './app/mantine-theme';
import './app/styles/global.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// Never let a seeding failure produce a blank screen: a partially-seeded app
// beats no app at all. initializeDb is concurrency-safe against its own
// races (see db/seed.ts), but this is defense against any other unexpected
// rejection.
try {
  await initializeDb();
} catch (error) {
  console.error('initializeDb failed; continuing with render anyway', error);
}

// Request persistent storage durability (fire-and-forget; guarded against SSR).
if (typeof navigator !== 'undefined') {
  requestPersistentStorage().then((granted) => {
    console.info(
      `Persistent storage ${granted ? 'granted' : 'denied'}; IndexedDB may be evicted when storage quota is exceeded.`
    );
  });
}

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
    <MantineProvider theme={mantineTheme} defaultColorScheme="auto">
      <Notifications position="top-center" />
      <RouterProvider router={router} />
    </MantineProvider>
  </StrictMode>
);
