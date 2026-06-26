import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { asyncStorage } from '../services/storage/asyncStorage';
import {
  koolaColors,
  koolaDarkColors,
  resolveMode,
  type Palette,
  type ThemeMode,
} from './theme';

// ─── Context shape ───────────────────────────────────────────────────────────

interface ThemeContextValue {
  palette: Palette;
  mode: ThemeMode;
  resolvedScheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette: koolaColors,
  mode: 'system',
  resolvedScheme: 'light',
  setMode: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Hydrate persisted mode on mount
  useEffect(() => {
    let cancelled = false;
    asyncStorage.getThemeMode().then((persisted) => {
      if (!cancelled) {
        setModeState(persisted);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    asyncStorage.setThemeMode(newMode).catch((err) => {
      console.warn('[ThemeProvider] Failed to persist theme mode:', err);
    });
  }, []);

  const resolved = resolveMode(mode, systemScheme);
  const palette = resolved === 'dark' ? koolaDarkColors : koolaColors;

  const value = useMemo<ThemeContextValue>(
    () => ({ palette, mode, resolvedScheme: resolved, setMode }),
    [palette, mode, resolved, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
