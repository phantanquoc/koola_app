import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KoolaIconButton,
  koolaDurations,
  koolaEasing,
  koolaOpacity,
  koolaRadii,
  koolaSpacing,
  koolaZIndex,
  prefersReducedMotion,
  useTheme,
} from '../../../ui';

// Faux-glass is reserved for composer chrome and sourced entirely from the
// component token contract. The message content itself remains flat.
const DOCK_RADIUS = koolaRadii.xl;

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
    const bottomPad = Math.max(insets.bottom, koolaSpacing.sm);
    const exitProgress = useSharedValue(exiting ? 1 : 0);
    const { tokens } = useTheme();
    const glass = tokens.component.composer.surface;

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
        <View
          accessibilityState={{ disabled: !!disabled, busy: !!disabled }}
          style={[
            styles.dock,
            {
              backgroundColor: glass.fill,
              borderColor: offline
                ? tokens.semantic.status.warning
                : glass.hairline,
            },
            disabled ? styles.dockDisabled : null,
          ]}>
            <View
              pointerEvents="none"
              style={[styles.dockTint, { backgroundColor: glass.tint }]}
            />
            <View
              pointerEvents="none"
              style={[styles.topSheen, { backgroundColor: glass.sheen }]}
            />
            <View
              pointerEvents="none"
              style={[styles.bottomHairline, { backgroundColor: glass.bottomLine }]}
            />
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
  dock: {
    minHeight: CHAT_COMPOSER_DOCK_HEIGHT,
    borderRadius: DOCK_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  dockTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DOCK_RADIUS,
    opacity: 0.12,
  },
  topSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderTopLeftRadius: DOCK_RADIUS,
    borderTopRightRadius: DOCK_RADIUS,
    overflow: 'hidden',
    opacity: 0.65,
  },
  bottomHairline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
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
