import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { KoolaText, koolaRadii, koolaZIndex, useTheme } from '../ui';
import type { Palette } from '../ui/theme';

/**
 * Lightweight inline "coming soon" toast for mock/placeholder surfaces.
 *
 * Discovery surfaces (Shopping/Services) render rich UI over mock data while
 * their backends are pending. Rather than leaving tap targets dead (a DNA
 * anti-pattern), inert controls call `notify()` to acknowledge the tap with an
 * honest message. Theme-aware: uses `palette.ink` fill + `surface` text so it
 * stays legible in both light and dark schemes.
 *
 * Usage:
 *   const { notify, toast } = useComingSoonToast();
 *   ...
 *   <Pressable onPress={() => notify()} />
 *   return <View style={{ flex: 1 }}>{list}{toast}</View>;
 */
export function useComingSoonToast() {
  const { palette } = useTheme();
  const [msg, setMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((text = 'Tính năng đang được phát triển') => {
    setMsg(text);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setMsg(''), 2200);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const styles = useMemo(() => makeStyles(palette), [palette]);

  const toast = msg ? (
    <View
      style={styles.toast}
      pointerEvents="none"
      accessibilityLiveRegion="polite">
      <KoolaText tone="surface" variant="label" weight="700" align="center" numberOfLines={2}>
        {msg}
      </KoolaText>
    </View>
  ) : null;

  return { notify, toast };
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    toast: {
      position: 'absolute',
      bottom: 24,
      left: 32,
      right: 32,
      backgroundColor: p.ink,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 18,
      paddingVertical: 12,
      alignItems: 'center',
      zIndex: koolaZIndex.toast,
    },
  });
