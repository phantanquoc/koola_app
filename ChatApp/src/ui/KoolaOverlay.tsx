/**
 * Rendered inside the router's own container (so it is a normal sibling of the
 * current screen) instead of an Android Dialog window.
 *
 * WHY: RN's <Modal> on Android is a separate native Dialog window with its OWN
 * Fabric surface. Opening/closing it while the parent screen is also mounting or
 * unmounting causes "Cannot remove child at index N from parent ViewGroup …
 * childCount may be incorrect" (MountItemDispatcher → SurfaceMountingManager.
 * removeViewAt), and the Dialog can lay out 0×0 / freeze touches.
 *
 * API parity with the subset of <Modal> the app used:
 *   - visible / onRequestClose / transparent / animationType="fade"|"none"
 *   - mounted in-tree; hidden children are not rendered (no hidden Dialog)
 * For full-screen sheets use a navigator screen (presentation:'modal') instead.
 */
import React from 'react';
import { Animated, BackHandler, Easing, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useTheme } from './ThemeProvider';

export interface KoolaOverlayProps {
  visible: boolean;
  onRequestClose?: () => void;
  /** Tint the backdrop with the theme overlay colour. */
  dim?: boolean;
  /** Fade the overlay + content in. Off by default. */
  animate?: boolean;
  /** Style applied to the content wrapper (full-screen by default). */
  style?: ViewStyle | ViewStyle[];
  /** Style applied to the backdrop layer. */
  backdropStyle?: ViewStyle;
  children: React.ReactNode;
}

const FADE_MS = 160;

export const KoolaOverlay: React.FC<KoolaOverlayProps> = ({
  visible,
  onRequestClose,
  dim = false,
  animate = false,
  style,
  backdropStyle,
  children,
}) => {
  const { tokens } = useTheme();
  const opacity = React.useRef(new Animated.Value(visible && animate ? 0 : 1)).current;
  const [rendered, setRendered] = React.useState(visible);

  React.useEffect(() => {
    if (visible) {
      setRendered(true);
      if (animate) {
        opacity.setValue(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      } else {
        opacity.setValue(1);
      }
      return undefined;
    }
    // Unmount on the NEXT frame so a closing tap can't unmount the tree that
    // is still handling it.
    const id = requestAnimationFrame(() => setRendered(false));
    return () => cancelAnimationFrame(id);
  }, [visible, animate, opacity]);

  React.useEffect(() => {
    if (!visible || !onRequestClose) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onRequestClose]);

  if (!rendered) return null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityViewIsModal={visible}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          dim && { backgroundColor: tokens.semantic.surface.overlay },
          backdropStyle,
          animate && { opacity },
        ]}
      />
      <Animated.View style={[styles.fill, style, animate && { opacity }]}>
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export default KoolaOverlay;
