import React, { useCallback, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KoolaIconButton, koolaColors, koolaSpacing } from '../../../ui';

// Matches the floating tab dock in MainNavigator (borderRadius 26) so the
// composer reads as the same dock family when navigating between the
// conversation list (tab dock) and a chat (this composer dock).
const DOCK_RADIUS = 26;

export const CHAT_COMPOSER_DOCK_HEIGHT = 54;
export const CHAT_COMPOSER_TOP_GAP = koolaSpacing.sm;
export const CHAT_COMPOSER_SCROLL_GAP = koolaSpacing.md;

// Top sheen faked as stacked, fading bands. No gradient lib exists in the
// project, so the glass highlight is built from a few low-alpha white strips
// whose alpha decays to ~0 at the bottom. A single half-height block (the
// previous approach) ended on a hard alpha edge that read as a white seam
// across the dock middle — the bands remove that step. See [[chat_dock_sheen_seam]].
const SHEEN_BAND_ALPHAS = [0.16, 0.12, 0.09, 0.06, 0.035, 0.013];
const SHEEN_BAND_HEIGHT = 7; // 1px overlap between bands hides sub-pixel gaps
const sheenBands = SHEEN_BAND_ALPHAS.map((alpha, i) => ({
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: i * (SHEEN_BAND_HEIGHT - 1),
  height: SHEEN_BAND_HEIGHT,
  backgroundColor: `rgba(255,255,255,${alpha})`,
}));

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
}

/**
 * Chat input bar styled as a floating dock — same visual format as the bottom
 * tab dock (rounded 26, tinted border + shadow), floated with side margins and
 * lifted above the safe-area inset.
 *
 * Intentionally NO real backdrop-blur (BlurView): a live BlurView re-captures
 * its backdrop every frame, and because this dock lives INSIDE the Chat screen,
 * during the slide-pop it captures the conversation list sliding in behind it
 * → stale-frame flash over the list. (The MainNavigator tab dock CAN use
 * BlurView because it sits OUTSIDE the popped screen.) Proven by isolating
 * static-blur-on vs animations-off — blur alone still flashed. Instead we fake
 * frosted glass with a translucent fill, which never flashes and keeps the
 * slide animation. Do NOT reintroduce BlurView here. See [[chat_popback_flicker]].
 *
 * IME-safety: the TextInput is **uncontrolled** (no `value` prop). Vietnamese
 * IME composition resets on every re-render under Fabric when a controlled
 * value is used, so text lives in a ref and `hasText` is the only state that
 * drives the UI. Keep it this way.
 */
const ChatComposer = React.forwardRef<ChatComposerHandle, ChatComposerProps>(
  ({ onSend, onChangeText, onPressEmoji, onPressVoice, onPressImage, onPressAttach, disabled, offline }, ref) => {
    const textRef = useRef('');
    const inputRef = useRef<TextInput>(null);
    const [hasText, setHasText] = useState(false);
    const insets = useSafeAreaInsets();
    const bottomPad = Math.max(insets.bottom, 8);

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
      <View pointerEvents="box-none" style={[styles.host, { paddingBottom: bottomPad }]}>
        <View
          style={[
            styles.dock,
            offline ? styles.dockOffline : null,
            disabled ? styles.dockDisabled : null,
          ]}>
          {/* Static glass layering (no BlurView/animation) — see component doc.
              Top sheen = stacked fading bands so there's no hard alpha seam. */}
          {sheenBands.map((band, i) => (
            <View key={i} pointerEvents="none" style={band} />
          ))}
          {!offline && <View pointerEvents="none" style={styles.dockRing} />}
          <View style={styles.row}>
            <KoolaIconButton
              icon="sentiment-satisfied-alt"
              tone="muted"
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
              // Android draws a default bottom underline on TextInput — it shows
              // through the glass dock as a faint line under the input. Kill it.
              underlineColorAndroid="transparent"
              multiline
              editable={!disabled}
              onChangeText={handleChange}
              accessibilityLabel="Nhập tin nhắn"
            />
            {hasText ? (
              // Typing → the send arrow replaces the attach/mic/image cluster,
              // matching Zalo / Telegram behaviour.
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
              />
            ) : (
              <>
                <KoolaIconButton
                  icon="add-circle-outline"
                  tone="muted"
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
                  tone="muted"
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
                  tone="muted"
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
    elevation: 20,
  },
  dock: {
    minHeight: CHAT_COMPOSER_DOCK_HEIGHT,
    borderRadius: DOCK_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.32)',
    // Faux frosted glass, lighter & more transparent than before (canvas @ 74%
    // alpha, was 94%) so the conversation shows through. Layered statically
    // (sheen + highlight + primary-tint ring below) — NO BlurView/animation,
    // which flash during the slide-pop (see component doc).
    backgroundColor: 'rgba(247,249,252,0.74)',
    overflow: 'hidden',
    shadowColor: koolaColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.09,
    shadowRadius: 18,
    elevation: 8,
  },
  // Static glass layers (all pointerEvents="none", below the row at zIndex 0).
  // The top sheen is rendered from `sheenBands` (module scope), not a style here.
  dockRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DOCK_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.14)',
  },
  dockOffline: {
    borderColor: koolaColors.warning,
  },
  dockDisabled: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: CHAT_COMPOSER_DOCK_HEIGHT,
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
  },
});

export default ChatComposer;
