/**
 * ConversationActionSheet.tsx
 *
 * Long-press action sheet for a conversation row: pin toggle, mute toggle
 * (with duration sub-view), clear-for-me (destructive confirm handled by the
 * caller via koolaConfirm).
 *
 * Rendered as an in-tree absolute overlay (backdrop + centered dialog),
 * modelled on MessageContextMenu — never a native <Modal> (RN 0.76 Fabric
 * 0x0 bug). Visual additions only; the row/list/header/sub-tab are untouched.
 * The bottom tab dock is suppressed by the caller while visible (it lives
 * outside the screen tree, so an in-tree overlay can never cover it).
 *
 * Entrance: backdrop fades in, dialog fades + lifts + scales in (decelerate,
 * `koolaDurations.normal`). Exit is instant — every close path (X, backdrop,
 * Back, row action) hands straight off to a navigation or a native dialog, so
 * an exit animation would only add lag. Skipped under reduce-motion.
 */
import React, { useEffect, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import type { Conversation } from '../types';
import { KoolaText, useTheme } from '../ui';
import { koolaRadii, koolaSpacing } from '../ui/theme';
import type { SemanticTokens } from '../ui/tokens/semantic';
import {
  koolaDurations,
  koolaEasing,
  prefersReducedMotion,
} from '../ui/tokens/motion';
import { acquireBackIntercept } from '../services/nativeBack';
import { isConversationMuted } from '../screens/main/conversationListPrefs';
import { resolveConversationHeader } from './ConversationListItem';
import { useAuth } from '../contexts/AuthContext';

export type MuteDurationChoice = '1h' | '8h' | '24h' | 'forever';

const MUTE_OPTIONS: Array<{ value: MuteDurationChoice; label: string }> = [
  { value: '1h', label: 'Trong 1 giờ' },
  { value: '8h', label: 'Trong 8 giờ' },
  { value: '24h', label: 'Trong 24 giờ' },
  { value: 'forever', label: 'Cho đến khi tôi bật lại' },
];

export type ActionSheetView = 'main' | 'mute';

interface Props {
  visible: boolean;
  conversation: Conversation | null;
  initialView?: ActionSheetView;
  onClose: () => void;
  onTogglePin: () => void;
  /** Unmute immediately (called when the conversation is currently muted). */
  onUnmute: () => void;
  onPickMuteDuration: (duration: MuteDurationChoice) => void;
  onClear: () => void;
}

const ConversationActionSheet: React.FC<Props> = ({
  visible,
  conversation,
  initialView = 'main',
  onClose,
  onTogglePin,
  onUnmute,
  onPickMuteDuration,
  onClear,
}) => {
  const { tokens } = useTheme();
  const { user } = useAuth();
  const [view, setView] = useState<ActionSheetView>(initialView);

  // Reset to the requested view every time the sheet opens (or retargets).
  useEffect(() => {
    if (visible) setView(initialView);
  }, [visible, initialView, conversation?._id]);

  // Hardware Back closes the sheet without navigating (consumed).
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    const releaseIntercept = acquireBackIntercept();
    return () => {
      sub.remove();
      releaseIntercept();
    };
  }, [visible, onClose]);

  const styles = React.useMemo(
    () => makeSheetStyles(tokens.semantic),
    [tokens.semantic],
  );

  // ─── Entrance (JS driver: a few short one-shot timings, no UI-thread work) ─
  const [backdropProgress] = React.useState(() => new Animated.Value(0));
  const [sheetProgress] = React.useState(() => new Animated.Value(0));
  const convId = conversation?._id;

  useEffect(() => {
    if (!visible) return;
    if (prefersReducedMotion()) {
      backdropProgress.setValue(1);
      sheetProgress.setValue(1);
      return;
    }
    backdropProgress.setValue(0);
    sheetProgress.setValue(0);
    const easing = Easing.bezier(...koolaEasing.decelerate);
    const config = {
      toValue: 1,
      duration: koolaDurations.normal,
      easing,
      // `scale` must be animated through transform[] — a bare `scale` style
      // key is rejected by the native animated module.
      useNativeDriver: true,
    };
    Animated.parallel([
      Animated.timing(backdropProgress, config),
      Animated.timing(sheetProgress, config),
    ]).start();
  }, [visible, convId, backdropProgress, sheetProgress]);

  const sheetTransform = React.useMemo(
    () => ({
      opacity: sheetProgress,
      transform: [
        { scale: sheetProgress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        { translateY: sheetProgress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
      ],
    }),
    [sheetProgress],
  );

  if (!visible || !conversation) return null;

  const pinned = conversation.pinned === true;
  const muted = isConversationMuted(conversation);
  const title = resolveConversationHeader(conversation, user?._id).displayName;

  const handleMuteRow = () => {
    if (muted) {
      onUnmute();
    } else {
      setView('mute');
    }
  };

  return (
    <View style={styles.absoluteFill}>
      <Animated.View style={[styles.backdropLayer, { opacity: backdropProgress }]}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Đóng bảng tuỳ chọn"
        />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, sheetTransform]}
        accessibilityViewIsModal
        accessibilityLabel={`Tuỳ chọn cho ${title}`}>
        <View style={styles.titleRow}>
          <KoolaText
            variant="label"
            weight="700"
            numberOfLines={1}
            style={styles.title}>
            {view === 'main' ? title : 'Tắt thông báo'}
          </KoolaText>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Đóng"
            android_ripple={{ color: styles.rippleColor.color }}>
            <Icon name="close" size={22} color={styles.closeIcon.color} />
          </Pressable>
        </View>

        {view === 'main' ? (
          <>
            <SheetRow
              styles={styles}
              icon="push-pin"
              tint={tokens.semantic.action.primary}
              tintSoft={tokens.semantic.action.primarySoft}
              label={pinned ? 'Bỏ ghim' : 'Ghim'}
              accessibilityLabel={pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại'}
              onPress={onTogglePin}
            />
            <SheetRow
              styles={styles}
              icon={muted ? 'notifications' : 'notifications-off'}
              tint={tokens.semantic.status.warning}
              tintSoft={tokens.semantic.status.warningSoft}
              label={muted ? 'Bật thông báo' : 'Tắt thông báo'}
              accessibilityLabel={muted ? 'Bật thông báo trở lại' : 'Tắt thông báo'}
              onPress={handleMuteRow}
            />
            <SheetRow
              styles={styles}
              icon="delete-outline"
              tint={tokens.semantic.status.danger}
              tintSoft={tokens.semantic.status.dangerSoft}
              label="Xoá hội thoại"
              accessibilityLabel="Xoá hội thoại ở phía tôi"
              destructive
              last
              onPress={onClear}
            />
          </>
        ) : (
          <>
            <SheetRow
              styles={styles}
              icon="arrow-back"
              tint={tokens.semantic.text.muted}
              tintSoft={tokens.semantic.surface.level2}
              label="Quay lại"
              accessibilityLabel="Quay lại bảng tuỳ chọn"
              onPress={() => setView('main')}
            />
            {MUTE_OPTIONS.map((opt) => (
              <SheetRow
                key={opt.value}
                styles={styles}
                icon="schedule"
                tint={tokens.semantic.action.primary}
                tintSoft={tokens.semantic.action.primarySoft}
                label={opt.label}
                accessibilityLabel={`Tắt thông báo ${opt.label.toLowerCase()}`}
                last={opt.value === 'forever'}
                onPress={() => onPickMuteDuration(opt.value)}
              />
            ))}
          </>
        )}
        {/* No bottomPad: each row carries its own bottom padding so the
            sheet's edge hugs the last row. */}
      </Animated.View>
    </View>
  );
};

function SheetRow({
  styles,
  icon,
  tint,
  tintSoft,
  label,
  accessibilityLabel,
  destructive = false,
  last = false,
  onPress,
}: {
  styles: ReturnType<typeof makeSheetStyles>;
  icon: string;
  /** Icon color — a semantic token supplied by the caller. */
  tint: string;
  /** Shell fill at the same hue (palette `*Soft`), so dark mode gets its own
   *  tint instead of a light-mode alpha over a dark surface. */
  tintSoft: string;
  label: string;
  accessibilityLabel: string;
  destructive?: boolean;
  /** Last row: carries the sheet's bottom inset. */
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.actionRow,
        !last && styles.rowDivider,
        last && styles.lastRow,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: styles.rippleColor.color }}>
      {/* Colored-glyph + soft-tint shell, the app's standard way to colour a
          row icon (KoolaState, AttachmentSheet) — keeps semantic hue on the
          glyph while the shell stays quiet on both schemes. */}
      <View style={[styles.iconShell, { backgroundColor: tintSoft }]}>
        <Icon name={icon} size={18} color={tint} />
      </View>
      <KoolaText
        variant="body"
        style={destructive ? styles.destructiveText : styles.rowText}>
        {label}
      </KoolaText>
    </Pressable>
  );
}

function makeSheetStyles(semantic: SemanticTokens) {
  return StyleSheet.create({
    absoluteFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      elevation: 9999,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    backdropLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: semantic.surface.overlay,
    },
    sheet: {
      // level1 matches KoolaConfirmHost / KoolaDialog so every centered
      // dialog in the app reads as the same surface.
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.lg,
      width: '100%',
      maxWidth: 340,
      // Clips the row ripples to the rounded corners.
      overflow: 'hidden',
      elevation: 8,
      shadowColor: semantic.text.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: koolaSpacing.xs,
      paddingBottom: koolaSpacing.xs,
      paddingRight: koolaSpacing.sm,
    },
    closeButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeIcon: {
      color: semantic.text.muted,
    },
    title: {
      flex: 1,
      paddingLeft: koolaSpacing.lg,
      paddingVertical: koolaSpacing.sm,
      color: semantic.text.primary,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      paddingVertical: koolaSpacing.sm,
      paddingHorizontal: koolaSpacing.lg,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semantic.border.subtle,
    },
    lastRow: {
      paddingBottom: koolaSpacing.md,
    },
    iconShell: {
      width: 28,
      height: 28,
      borderRadius: koolaRadii.xs,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: koolaSpacing.md,
      flexShrink: 0,
    },
    rowText: {
      color: semantic.text.primary,
    },
    destructiveText: {
      color: semantic.status.danger,
    },
    rippleColor: {
      color: semantic.action.primarySoft,
    },
  });
}

export default ConversationActionSheet;
