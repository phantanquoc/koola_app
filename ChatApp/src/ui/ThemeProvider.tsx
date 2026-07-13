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
  koolaLightSurfaces,
  koolaDarkSurfaces,
  resolveMode,
  type Palette,
  type ThemeMode,
} from './theme';
import { makeSemanticTokens, type SemanticTokens } from './tokens/semantic';
import {
  makeComponentTokens,
  type ComponentTokens,
} from './tokens/components';

// ─── Context shape ───────────────────────────────────────────────────────────

interface ThemeContextValue {
  palette: Palette;
  mode: ThemeMode;
  resolvedScheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  tokens: { semantic: SemanticTokens; component: ComponentTokens };
}

const ThemeContext = createContext<ThemeContextValue>({
  palette: koolaColors,
  mode: 'system',
  resolvedScheme: 'light',
  setMode: () => {},
  tokens: (() => {
    const semantic = makeSemanticTokens(koolaColors, koolaLightSurfaces);
    return { semantic, component: makeComponentTokens(semantic) };
  })(),
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
  const surfaces =
    resolved === 'dark' ? koolaDarkSurfaces : koolaLightSurfaces;

  const tokens = useMemo(() => {
    const semantic = makeSemanticTokens(palette, surfaces);
    const component = makeComponentTokens(semantic);
    return { semantic, component };
  }, [palette, surfaces]);

  const value = useMemo<ThemeContextValue>(
    () => ({ palette, mode, resolvedScheme: resolved, setMode, tokens }),
    [palette, mode, resolved, setMode, tokens],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
