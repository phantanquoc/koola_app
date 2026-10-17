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
 */
import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import type { Conversation } from '../types';
import { KoolaText, useTheme } from '../ui';
import { koolaRadii, koolaSpacing } from '../ui/theme';
import type { SemanticTokens } from '../ui/tokens/semantic';
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
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Đóng bảng tuỳ chọn"
      />
      <View
        style={styles.sheet}
        accessibilityViewIsModal
        accessibilityLabel={`Tuỳ chọn cho ${title}`}>
        <View style={styles.titleRow}>
          <KoolaText
            variant="label"
            weight="700"
            numberOfLines={1}
            style={styles.title}>
            {title}
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
              label={pinned ? 'Bỏ ghim' : 'Ghim'}
              accessibilityLabel={pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại'}
              onPress={onTogglePin}
            />
            <SheetRow
              styles={styles}
              icon={muted ? 'notifications' : 'notifications-off'}
              label={muted ? 'Bật thông báo' : 'Tắt thông báo'}
              accessibilityLabel={muted ? 'Bật thông báo trở lại' : 'Tắt thông báo'}
              onPress={handleMuteRow}
            />
            <SheetRow
              styles={styles}
              icon="delete-outline"
              label="Xoá hội thoại"
              accessibilityLabel="Xoá hội thoại ở phía tôi"
              destructive
              onPress={onClear}
            />
          </>
        ) : (
          <>
            <SheetRow
              styles={styles}
              icon="arrow-back"
              label="Quay lại"
              accessibilityLabel="Quay lại bảng tuỳ chọn"
              onPress={() => setView('main')}
            />
            {MUTE_OPTIONS.map((opt) => (
              <SheetRow
                key={opt.value}
                styles={styles}
                icon="schedule"
                label={opt.label}
                accessibilityLabel={`Tắt thông báo ${opt.label.toLowerCase()}`}
                onPress={() => onPickMuteDuration(opt.value)}
              />
            ))}
          </>
        )}
        <View style={styles.bottomPad} />
      </View>
    </View>
  );
};

function SheetRow({
  styles,
  icon,
  label,
  accessibilityLabel,
  destructive = false,
  onPress,
}: {
  styles: ReturnType<typeof makeSheetStyles>;
  icon: string;
  label: string;
  accessibilityLabel: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.actionRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: styles.rippleColor.color }}>
      <Icon
        name={icon}
        size={22}
        color={destructive ? styles.destructiveText.color : styles.rowIcon.color}
        style={styles.rowIcon}
      />
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
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: semantic.surface.overlay,
    },
    sheet: {
      backgroundColor: semantic.surface.level2,
      borderRadius: koolaRadii.lg,
      width: '100%',
      maxWidth: 340,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    closeButton: {
      padding: koolaSpacing.sm,
      marginRight: koolaSpacing.sm,
    },
    closeIcon: {
      color: semantic.text.muted,
    },
    title: {
      flex: 1,
      paddingHorizontal: koolaSpacing.lg,
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
    rowIcon: {
      color: semantic.text.muted,
      marginRight: 14,
    },
    rowText: {
      color: semantic.text.primary,
    },
    destructiveText: {
      color: semantic.status.danger,
    },
    rippleColor: {
      color: semantic.surface.level0,
    },
    bottomPad: {
      height: 24,
    },
  });
}

export default ConversationActionSheet;
