import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import {
  KoolaIconButton,
  koolaDarkShadows,
  koolaDurations,
  koolaEasing,
  koolaGlassGradient,
  koolaGlassSheen,
  koolaOpacity,
  koolaShadows,
  koolaSpacing,
  koolaZIndex,
  prefersReducedMotion,
  useTheme,
} from '../../../ui';

// Faux-glass is reserved for composer chrome. The glass layer stack, rim width
// and radius below are matched to the bottom tab dock in `MainNavigator` so the
// two floating docks read as one family; gradient stops come from the shared
// `koolaGlassGradient` primitive. The message content itself remains flat.
const DOCK_RADIUS = 26;

// Rim is 3px on every side, so the border alone adds 6px to the box height that
// the old hairline border did not. Bumping 54 -> 58 keeps this constant truthful
// for `ChatScreen`'s clearance math — under-reporting it would let the last
// message sit beneath the translucent dock.
export const CHAT_COMPOSER_DOCK_HEIGHT = 58;
// Headroom for the xl drop shadow, which spreads upward from the dock. Mirrors
// `tabBarHost.paddingTop` in MainNavigator. The host is anchored to bottom:0, so
// this grows the top edge only — the dock itself does not move.
export const CHAT_COMPOSER_TOP_GAP = koolaSpacing.lg;
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
    const bottomPad = Math.max(insets.bottom, koolaSpacing.sm);
    const exitProgress = useSharedValue(exiting ? 1 : 0);
    const { tokens, palette, resolvedScheme } = useTheme();

    const gradientStops = koolaGlassGradient[resolvedScheme];
    const sheenColor = koolaGlassSheen[resolvedScheme];

    // Opaque base under the glass layers, plus the float shadow. Dark mode gets a
    // lighter elevated surface + top hairline instead of a shadow, since black
    // shadows are invisible on dark backgrounds. Mirrors MainNavigator tab dock.
    const dockElevation = useMemo(
      () =>
        resolvedScheme === 'dark'
          ? koolaDarkShadows.xl
          : { backgroundColor: tokens.semantic.surface.level1, ...koolaShadows.xl },
      [resolvedScheme, tokens.semantic.surface.level1],
    );

    useEffect(() => {
      exitProgress.value = withTiming(exiting ? 1 : 0, {
        duration: prefersReducedMotion() ? 0 : koolaDurations.fast,
        easing: Easing.bezier(...koolaEasing.decelerate),
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
        <View style={[styles.shadowWrap, dockElevation]}>
          <View
            accessibilityState={{ disabled: !!disabled, busy: !!disabled }}
            style={[
              styles.dock,
              { borderColor: offline ? tokens.semantic.status.warning : palette.primary },
              disabled ? styles.dockDisabled : null,
            ]}>
            <View pointerEvents="none" style={styles.dockStaticFill}>
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <SvgLinearGradient id="composerFill" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={gradientStops.top.color} stopOpacity={String(gradientStops.top.opacity)} />
                    <Stop offset="0.55" stopColor={gradientStops.mid.color} stopOpacity={String(gradientStops.mid.opacity)} />
                    <Stop offset="1" stopColor={gradientStops.bottom.color} stopOpacity={String(gradientStops.bottom.opacity)} />
                  </SvgLinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#composerFill)" />
              </Svg>
            </View>
            <View pointerEvents="none" style={styles.dockTint} />
            <View pointerEvents="none" style={styles.topSheen}>
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <SvgLinearGradient id="composerSheen" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={sheenColor} stopOpacity="0.85" />
                    <Stop offset="1" stopColor={sheenColor} stopOpacity="0" />
                  </SvgLinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#composerSheen)" />
              </Svg>
            </View>
            <View pointerEvents="none" style={[styles.edgeShineLeft, resolvedScheme === 'dark' && styles.edgeShineDark]} />
            <View pointerEvents="none" style={[styles.edgeShineRight, resolvedScheme === 'dark' && styles.edgeShineDark]} />
            <View pointerEvents="none" style={[styles.innerEdge, resolvedScheme === 'dark' && styles.innerEdgeDark]} />
            <View pointerEvents="none" style={styles.bottomHairline} />

            <View style={styles.row}>
              {onPressEmoji && (
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
              )}
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: tokens.semantic.text.primary }]}
                placeholder="Tin nhắn"
                placeholderTextColor={tokens.semantic.text.faint}
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
                  {onPressVoice && (
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
                  )}
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
    paddingHorizontal: koolaSpacing.xxl,
    paddingTop: CHAT_COMPOSER_TOP_GAP,
    backgroundColor: 'transparent',
    zIndex: koolaZIndex.sticky,
  },
  // Liquid-glass shadow wrapper. Drop shadow lives here so it isn't clipped by
  // `dock`'s overflow:hidden. The opaque backgroundColor is load-bearing: Android
  // renders no shadow for a transparent view, and it stops list rows from bleeding
  // through the translucent glass fill. Color + shadow come from the theme via
  // inline style (dockElevation useMemo). Mirrors MainNavigator shadowWrap.
  shadowWrap: {
    borderRadius: DOCK_RADIUS,
  },
  dock: {
    minHeight: CHAT_COMPOSER_DOCK_HEIGHT,
    borderRadius: DOCK_RADIUS,
    backgroundColor: 'transparent',
    borderWidth: 3,
    // Glass rim — borderColor applied via inline style (primary or warning).
    borderColor: 'transparent',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  // Liquid glass layer 1 — translucent SVG gradient fill (faux blur host).
  dockStaticFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DOCK_RADIUS,
    overflow: 'hidden',
  },
  // Liquid glass layer 1b — primary-blue cast.
  dockTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DOCK_RADIUS,
    backgroundColor: 'rgba(37,99,235,0.04)',
  },
  // Layer 2 — top specular sheen (~40% of dock height).
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
  // Layer 3 — side-edge shines.
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
  // Dark-mode overrides for glass layers
  edgeShineDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  innerEdgeDark: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  // Layer 5 — cool-tone bottom hairline.
  bottomHairline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(37,99,235,0.18)',
  },
  dockDisabled: {
    opacity: koolaOpacity.disabled,
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
    // Force transparent — Android TextInput inherits a white background from
    // the theme, which would re-introduce the brighter band across the dock
    // middle when the dock fill is even slightly translucent.
    backgroundColor: 'transparent',
  },
});

export default ChatComposer;
