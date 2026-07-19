import { useEffect } from 'react';
import { createTheme, useMantineColorScheme, type MantineColorsTuple } from '@mantine/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPreferences } from '../services/preference-service';

// Green ramp built around the reference accent #2b8a57 (index 6 = primary shade).
const actiGreen: MantineColorsTuple = [
  '#e8f6ed', '#d3ecdc', '#a8d8ba', '#7ac496', '#54b378',
  '#3ca865', '#2b8a57', '#1f7a4d', '#166b42', '#0a5c37',
];

export const mantineTheme = createTheme({
  primaryColor: 'actiGreen',
  primaryShade: { light: 6, dark: 5 },
  colors: { actiGreen },
  fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
  defaultRadius: 'lg',
  radius: { lg: '16px', xl: '20px' },
  headings: { fontFamily: "'Inter', -apple-system, system-ui, sans-serif", fontWeight: '700' },
});

// Keeps Mantine's color scheme in sync with the stored Preference.theme
// ('system' maps to Mantine's 'auto', which follows the OS scheme).
export function useColorSchemeSync(): void {
  const preferences = useLiveQuery(() => getPreferences());
  const { setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    if (preferences) {
      const { theme } = preferences;
      setColorScheme(theme === 'system' ? 'auto' : theme);

      // Bridge: legacy screen CSS keys off data-theme until all screens migrate (removed in cleanup)
      if (theme === 'system') {
        delete document.documentElement.dataset.theme;
      } else {
        document.documentElement.dataset.theme = theme;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences?.theme]);
}
