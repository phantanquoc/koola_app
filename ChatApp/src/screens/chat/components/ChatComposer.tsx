import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from '@sbaiahmed1/react-native-blur';
import {
  KoolaIconButton,
  koolaDarkShadows,
  koolaDurations,
  koolaEasing,
  koolaOpacity,
  koolaShadows,
  koolaSpacing,
  koolaZIndex,
  prefersReducedMotion,
  useTheme,
} from '../../../ui';

// Glass dock — BlurView (same glass as MainNavigator TabDockBackground).
// blurAmount 18, blurType dark/light, overlayColor light rgba(255,255,255,0.62)
// / dark rgba(28,32,38,0.52), reducedTransparencyFallbackColor, innerEdge
// 55%/10%, bottomHairline 12%, border 0.5 rgba(255,255,255,0.18), shadow xl
// stripped bg. Keeps the two floating docks (tab bar + composer) as one family.
const DOCK_RADIUS = 26;

export const CHAT_COMPOSER_DOCK_HEIGHT = 46;
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
    const { tokens, resolvedScheme } = useTheme();

    const isDark = resolvedScheme === 'dark';
    // Shadow — strip backgroundColor so BlurView glass shows through.
    // Mirrors MainNavigator dockElevation (dark: hairline via border; light: shadow).
    const dockElevation = useMemo(() => {
      if (isDark) {
        const { backgroundColor: _bg, borderTopWidth: _btw, borderTopColor: _btc, ...rest } =
          koolaDarkShadows.xl as unknown as Record<string, unknown>;
        return rest;
      }
      const { backgroundColor: _bg, ...rest } = koolaShadows.xl as unknown as Record<string, unknown>;
      return rest as typeof koolaShadows.xl;
    }, [isDark]);

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
              disabled ? styles.dockDisabled : null,
            ]}>
            <BlurView
              blurType={isDark ? 'dark' : 'light'}
              blurAmount={18}
              overlayColor={isDark ? 'rgba(28,32,38,0.34)' : 'rgba(255,255,255,0.42)'}
              reducedTransparencyFallbackColor={isDark ? '#1C2026' : '#FFFFFF'}
              style={styles.dockBlurFill}
            />
            <View pointerEvents="none" style={[styles.innerEdge, isDark && styles.innerEdgeDark]} />
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
    paddingHorizontal: koolaSpacing.lg,
    paddingTop: CHAT_COMPOSER_TOP_GAP,
    backgroundColor: 'transparent',
    zIndex: koolaZIndex.sticky,
  },
  // Glass shadow wrapper. Shadow lives on this View so it isn't clipped by
  // `dock`'s overflow:hidden. backgroundColor is stripped (see dockElevation)
  // so BlurView glass shows through. Mirrors MainNavigator shadowWrap.
  shadowWrap: {
    borderRadius: DOCK_RADIUS,
  },
  dock: {
    minHeight: CHAT_COMPOSER_DOCK_HEIGHT,
    borderRadius: 22,
    backgroundColor: 'transparent',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  // BlurView glass fill — mirrors MainNavigator tabDockBlurFill.
  dockBlurFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DOCK_RADIUS,
    overflow: 'hidden',
  },
  // 1px inner top edge.
  innerEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  innerEdgeDark: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  // Cool-tone bottom hairline — 12% to match TabDock (was 18% on faux-glass).
  bottomHairline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(37,99,235,0.12)',
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
    paddingTop: 8,
    paddingBottom: 8,
    maxHeight: 100,
    // Force transparent — Android TextInput inherits a white background from
    // the theme, which would re-introduce the brighter band across the dock
    // middle when the dock fill is even slightly translucent.
    backgroundColor: 'transparent',
  },
});

export default ChatComposer;
