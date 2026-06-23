import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { KoolaIconButton, koolaColors, koolaSpacing } from '../../../ui';

// ─── Liquid-glass dock for the chat composer ────────────────────────────────
// Static recreation of Apple's iOS 26 "Liquid Glass" material. We can't use
// BlurView (lives inside the chat screen — would flash during pop-back, see
// [[chat_popback_flicker]]), so the illusion is built from layered Views:
//
//   1. Outer wrapper      — owns the drop shadow (no overflow:hidden so the
//                           shadow isn't clipped); transparent fill.
//   2. Surface            — owns the opaque fill + crisp inner border + clip.
//   3. Top specular sheen — a 3dp SVG linear gradient pinned to the top edge,
//                           white 0.72 → transparent. Strongest "glass" cue
//                           once blur is off the table.
//   4. Inner highlight    — a 1px white-on-top inset stroke giving the
//                           cut-glass thickness illusion.
//
// Token values lifted from the WWDC 2025 Liquid Glass spec adapted for KOOLA:
//   fill        rgba(247,249,252,0.96)   ← keeps text legibility (NNG warning)
//   border      rgba(255,255,255,0.48)   ← visible main rim
//   topSheen    rgba(255,255,255,0.72) → 0    ← specular highlight
//   innerEdge   rgba(255,255,255,0.55)   ← cut-glass top edge (1px, top only)
//   shadow      koolaColors.primary @ 0.18  ← soft blue-tinted lift
//
// Brand: KOOLA primary #2563EB used for the shadow tint so the dock reads as
// "ours" rather than a generic Apple clone.
const DOCK_RADIUS = 26;

export const CHAT_COMPOSER_DOCK_HEIGHT = 54;
export const CHAT_COMPOSER_TOP_GAP = koolaSpacing.sm;
export const CHAT_COMPOSER_SCROLL_GAP = koolaSpacing.md;

export interface ChatComposerHandle {
  /** Clears the input — call after a successful send. */
  clear: () => void;
}

interface ChatComposerProps {
  /** Called with the trimmed text when the send button is pressed. */
  onSend: (text: string) => void;
  /** Called on every keystroke (raw text) — used for the typing indicator. */
  onChangeText?: (text: string) => void;
  onPressEmoji?: () => void;
  onPressVoice?: () => void;
  onPressImage?: () => void;
  onPressAttach?: () => void;
  /** Disables input + send while a media upload is in flight. */
  disabled?: boolean;
  /** Offline → send still allowed (queued), but the bar reflects the state. */
  offline?: boolean;
  /** Starts a quick exit motion during native pop so the tab dock can return sooner. */
  exiting?: boolean;
}

const ChatComposer = React.forwardRef<ChatComposerHandle, ChatComposerProps>(
  ({ onSend, onChangeText, onPressEmoji, onPressVoice, onPressImage, onPressAttach, disabled, offline, exiting }, ref) => {
    const textRef = useRef('');
    const inputRef = useRef<TextInput>(null);
    const [hasText, setHasText] = useState(false);
    const insets = useSafeAreaInsets();
    const bottomPad = Math.max(insets.bottom, 8);
    const exitProgress = useSharedValue(exiting ? 1 : 0);

    useEffect(() => {
      exitProgress.value = withTiming(exiting ? 1 : 0, {
        duration: exiting ? 100 : 90,
        easing: Easing.out(Easing.cubic),
      });
    }, [exiting, exitProgress]);

    const exitStyle = useAnimatedStyle(() => ({
      opacity: 1 - exitProgress.value,
      transform: [{ translateY: 24 * exitProgress.value }],
    }));

    const clear = useCallback(() => {
      textRef.current = '';
      inputRef.current?.clear();
      setHasText(false);
    }, []);

    useImperativeHandle(ref, () => ({ clear }), [clear]);

    const handleChange = useCallback(
      (text: string) => {
        textRef.current = text;
        const next = text.trim().length > 0;
        setHasText((prev) => (prev === next ? prev : next));
        onChangeText?.(text);
      },
      [onChangeText],
    );

    const handleSendPress = useCallback(() => {
      const text = textRef.current.trim();
      if (!text) return;
      clear();
      onSend(text);
    }, [clear, onSend]);

    return (
      <Animated.View pointerEvents="box-none" style={[styles.host, { paddingBottom: bottomPad }, exitStyle]}>
        {/* Outer wrapper — drop shadow only. No overflow:hidden so the shadow
            isn't squared off on Android. */}
        <View style={styles.shadowWrap}>
          <View
            accessibilityState={{ disabled: !!disabled, busy: !!disabled }}
            style={[
              styles.dock,
              offline ? styles.dockOffline : null,
              disabled ? styles.dockDisabled : null,
            ]}>
            {/* Layer 1 — base SVG gradient fill: light at top, cool tint at
                bottom. Faux-blur cue: simulates the way blurred light
                bunches up under the top edge of a glass dock. */}
            <View pointerEvents="none" style={styles.dockFill}>
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <SvgLinearGradient id="composerFill" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.78" />
                    <Stop offset="0.55" stopColor="#EEF4FF" stopOpacity="0.70" />
                    <Stop offset="1" stopColor="#DBEAFE" stopOpacity="0.62" />
                  </SvgLinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#composerFill)" />
              </Svg>
            </View>
            {/* Layer 1b — subtle primary-blue glass cast for KOOLA brand. */}
            <View pointerEvents="none" style={styles.dockTint} />
            {/* Layer 2 — top specular sheen (decays to 0 at lower edge). */}
            <View pointerEvents="none" style={styles.topSheen}>
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <SvgLinearGradient id="composerSheen" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" />
                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                  </SvgLinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#composerSheen)" />
              </Svg>
            </View>
            {/* Layer 3 — side-edge shines (left + right) for refractive feel. */}
            <View pointerEvents="none" style={styles.edgeShineLeft} />
            <View pointerEvents="none" style={styles.edgeShineRight} />
            {/* Layer 4 — 1px white inner top edge for cut-glass thickness. */}
            <View pointerEvents="none" style={styles.innerEdge} />
            {/* Layer 5 — cool-tone bottom hairline (subtle inner shadow). */}
            <View pointerEvents="none" style={styles.bottomHairline} />
            <View style={styles.row}>
              <KoolaIconButton
                icon="sentiment-satisfied-alt"
                tone="primary"
                variant="ghost"
                size={36}
                iconSize={22}
                disabled={disabled}
                hitSlop={8}
                onPress={onPressEmoji}
                accessibilityLabel="Mở bảng biểu tượng cảm xúc"
              />
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Tin nhắn"
                placeholderTextColor={koolaColors.faint}
                underlineColorAndroid="transparent"
                multiline
                editable={!disabled}
                onChangeText={handleChange}
                accessibilityLabel="Nhập tin nhắn"
              />
              {hasText ? (
                <KoolaIconButton
                  icon="send"
                  tone="primary"
                  variant="ghost"
                  size={36}
                  iconSize={24}
                  disabled={disabled}
                  hitSlop={8}
                  onPress={handleSendPress}
                  accessibilityLabel="Gửi tin nhắn"
                  accessibilityHint={offline ? 'Tin nhắn sẽ được gửi khi có kết nối mạng' : undefined}
                />
              ) : (
                <>
                  <KoolaIconButton
                    icon="add-circle-outline"
                    tone="primary"
                    variant="ghost"
                    size={36}
                    iconSize={22}
                    disabled={disabled}
                    hitSlop={8}
                    onPress={onPressAttach}
                    accessibilityLabel="Đính kèm tệp"
                  />
                  <KoolaIconButton
                    icon="mic-none"
                    tone="primary"
                    variant="ghost"
                    size={36}
                    iconSize={22}
                    disabled={disabled}
                    hitSlop={8}
                    onPress={onPressVoice}
                    accessibilityLabel="Ghi âm tin nhắn thoại"
                  />
                  <KoolaIconButton
                    icon="crop-original"
                    tone="primary"
                    variant="ghost"
                    size={36}
                    iconSize={22}
                    disabled={disabled}
                    hitSlop={8}
                    onPress={onPressImage}
                    accessibilityLabel="Gửi ảnh"
                  />
                </>
              )}
            </View>
          </View>
        </View>
      </Animated.View>
    );
  },
);

ChatComposer.displayName = 'ChatComposer';

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 32,
    paddingTop: CHAT_COMPOSER_TOP_GAP,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  // Outer wrapper carries the drop shadow only. NO overflow:hidden — that
  // would clip the shadow on Android and re-introduce the rectangular bleed.
  shadowWrap: {
    borderRadius: DOCK_RADIUS,
    backgroundColor: 'transparent',
  },
  // Surface — fill, border, clip.
  dock: {
    minHeight: CHAT_COMPOSER_DOCK_HEIGHT,
    borderRadius: DOCK_RADIUS,
    borderWidth: 2,
    borderColor: koolaColors.primary,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  // Layer 1 — base translucent fill. Acts as host for an SVG gradient.
  dockFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DOCK_RADIUS,
    overflow: 'hidden',
  },
  // Layer 1b — primary-blue glass cast.
  dockTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DOCK_RADIUS,
    backgroundColor: 'rgba(37,99,235,0.04)',
  },
  // Layer 2 — top specular sheen, ~38% of dock height.
  topSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    borderTopLeftRadius: DOCK_RADIUS,
    borderTopRightRadius: DOCK_RADIUS,
    overflow: 'hidden',
  },
  // Layer 3 — side-edge shines (faux refraction).
  edgeShineLeft: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.40)',
  },
  edgeShineRight: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    right: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.40)',
  },
  // Layer 4 — 1px inner top edge.
  innerEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  // Layer 5 — cool-tone bottom hairline (mimics blurred shadow underneath).
  bottomHairline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(37,99,235,0.18)',
  },
  dockOffline: {
    borderColor: koolaColors.warning,
  },
  dockDisabled: {
    opacity: 0.6,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: koolaSpacing.xs,
    zIndex: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: koolaSpacing.sm,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 100,
    color: koolaColors.ink,
    // Force transparent — Android TextInput inherits a white background from
    // the theme, which would re-introduce the brighter band across the dock
    // middle when the dock fill is even slightly translucent.
    backgroundColor: 'transparent',
  },
});

export default ChatComposer;
