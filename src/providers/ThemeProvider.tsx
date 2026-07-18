import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  getColors,
  getSemantic,
  type Colors,
  type ThemeScheme,
} from '@/theme/colors';

/**
 * App theme (light / dark).
 *
 * `preference` is what the user chose: 'light', 'dark', or 'system' (follow the
 * OS). `scheme` is the RESOLVED value actually in effect. The choice persists
 * in SecureStore so it survives relaunches; on first launch we default to
 * 'system' so the app matches the phone out of the box, and Settings exposes a
 * manual Light/Dark toggle on top of that.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeValue {
  scheme: ThemeScheme; // resolved
  preference: ThemePreference; // user choice
  colors: Colors;
  semantic: ReturnType<typeof getSemantic>;
  isDark: boolean;
  setPreference: (p: ThemePreference) => void;
  /** Flip between light and dark (sets an explicit preference, leaving 'system'). */
  toggle: () => void;
}

const STORE_KEY = 'fancypot.theme.preference';

// Fallback used when useTheme() is called outside a mounted ThemeProvider —
// e.g. the root ErrorBoundary's ErrorScreen, which must render even if
// ThemeProvider itself is what crashed. Defaults to light so a component
// never throws just because it renders (however briefly, or in a crash path)
// outside the provider tree.
const FALLBACK_THEME: ThemeValue = {
  scheme: 'light',
  preference: 'system',
  colors: getColors('light'),
  semantic: getSemantic(getColors('light')),
  isDark: false,
  setPreference: () => {},
  toggle: () => {},
};

const ThemeContext = createContext<ThemeValue>(FALLBACK_THEME);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme(); // 'light' | 'dark' | null
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // Load the stored preference once on mount.
  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(STORE_KEY)
      .then((v) => {
        if (alive && (v === 'light' || v === 'dark' || v === 'system')) {
          setPreferenceState(v);
        }
      })
      .catch(() => {
        /* first launch / no value — stay on 'system' */
      });
    return () => {
      alive = false;
    };
  }, []);

  const setPreference = useMemo(
    () => (p: ThemePreference) => {
      setPreferenceState(p);
      SecureStore.setItemAsync(STORE_KEY, p).catch(() => {});
    },
    [],
  );

  const scheme: ThemeScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeValue>(() => {
    const colors = getColors(scheme);
    return {
      scheme,
      preference,
      colors,
      semantic: getSemantic(colors),
      isDark: scheme === 'dark',
      setPreference,
      toggle: () => setPreference(scheme === 'dark' ? 'light' : 'dark'),
    };
  }, [scheme, preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  // No provider-presence check by design — see FALLBACK_THEME above.
  return useContext(ThemeContext);
}

/** Convenience: just the resolved color palette. */
export function useThemeColors(): Colors {
  return useTheme().colors;
}
