/**
 * ChatStartPopup.tsx
 *
 * "Bắt đầu mới" dialog opened by the Chat Home `+` dock action: Tạo nhóm,
 * Nhắn tin mới. (QR scanning lives in the header dock as its own icon.)
 *
 * Rendered as an in-tree absolute overlay (backdrop + panel) — never a native
 * <Modal> (RN 0.76 Fabric 0x0 bug), same rule as ConversationActionSheet. It is
 * mounted inside ChatHomeContent, a sibling of the sub-tab navigator, so the
 * scrim covers the conversation list and the sub-tab bar but stops below the
 * fixed header chrome (the header lives outside this subtree and above it in
 * z-order). The panel is anchored just under the sub-tab bar — the content
 * inset minus the bar height, plus a small gap — rather than dead-centre.
 *
 * Visual language is copied verbatim from ConversationActionSheet (panel
 * tokens, title row with a 44dp ✕, 48dp rows, 28dp `*Soft` icon shells,
 * hairline dividers). Entrance: backdrop fades, panel fades + lifts + scales
 * in (decelerate, `koolaDurations.normal`, native driver — opacity and
 * transform only, so both timings run on the UI thread). Exit is instant —
 * every row hands straight off to another overlay or a navigation, so an exit
 * animation would only add lag. Skipped under reduce-motion.
 *
 * Back is NOT handled here: the Chat Home overlay owner owns hardware Back for
 * this overlay (screens/main/useChatHomeOverlay.ts).
 */
import React, { useContext, useEffect } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, useTheme } from '../ui';
import { koolaRadii, koolaSpacing } from '../ui/theme';
import type { SemanticTokens } from '../ui/tokens/semantic';
import {
  koolaDurations,
  koolaEasing,
  prefersReducedMotion,
} from '../ui/tokens/motion';
import { ChatHomeHeaderInsetContext, CHAT_SUB_TAB_BAR_HEIGHT } from '../screens/main/ChatHomeHeaderInsetContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** "Tạo nhóm" — open the group creation form. */
  onGroupPress: () => void;
  /** "Nhắn tin mới" — go to the Contacts sub-tab. */
  onNewMessagePress: () => void;
}

const ChatStartPopup: React.FC<Props> = ({
  visible,
  onClose,
  onGroupPress,
  onNewMessagePress,
}) => {
  const { tokens } = useTheme();
  // Resting chrome inset of the Chat Home scenes = header block + sub-tab bar.
  // The overlay starts at the top of the content subtree (under the header
  // chrome), so the sub-tab bar height is removed here to keep the panel flush
  // below the bar instead of one full bar height lower.
  const contentInset = useContext(ChatHomeHeaderInsetContext);
  const panelTop = Math.max(0, contentInset - CHAT_SUB_TAB_BAR_HEIGHT);

  const styles = React.useMemo(
    () => makeStartPopupStyles(tokens.semantic, panelTop),
    [tokens.semantic, panelTop],
  );

  // ─── Entrance (native driver: opacity + transform only, one-shot timings) ──
  const [backdropProgress] = React.useState(() => new Animated.Value(0));
  const [panelProgress] = React.useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    if (prefersReducedMotion()) {
      backdropProgress.setValue(1);
      panelProgress.setValue(1);
      return;
    }
    backdropProgress.setValue(0);
    panelProgress.setValue(0);
    const easing = Easing.bezier(...koolaEasing.decelerate);
    const config = {
      toValue: 1,
      duration: koolaDurations.normal,
      easing,
      useNativeDriver: true,
    };
    Animated.parallel([
      Animated.timing(backdropProgress, config),
      Animated.timing(panelProgress, config),
    ]).start();
  }, [visible, backdropProgress, panelProgress]);

  const panelTransform = React.useMemo(
    () => ({
      opacity: panelProgress,
      transform: [
        { scale: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        { translateY: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
      ],
    }),
    [panelProgress],
  );

  if (!visible) return null;

  return (
    <View style={styles.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdropLayer, { opacity: backdropProgress }]}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Đóng bảng bắt đầu mới"
        />
      </Animated.View>
      <Animated.View
        style={[styles.panel, panelTransform]}
        accessibilityViewIsModal
        accessibilityLabel="Bắt đầu mới">
        <View style={styles.titleRow}>
          <KoolaText variant="label" weight="700" numberOfLines={1} style={styles.title}>
            Bắt đầu mới
          </KoolaText>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Đóng bảng bắt đầu mới"
            android_ripple={{ color: styles.rippleColor.color }}>
            <Icon name="close" size={22} color={styles.closeIcon.color} />
          </Pressable>
        </View>

        <StartRow
          styles={styles}
          icon="group-add"
          tint={tokens.semantic.action.primary}
          tintSoft={tokens.semantic.action.primarySoft}
          label="Tạo nhóm"
          accessibilityLabel="Tạo nhóm"
          onPress={onGroupPress}
        />
        <StartRow
          styles={styles}
          icon="chat"
          tint={tokens.semantic.action.primary}
          tintSoft={tokens.semantic.action.primarySoft}
          label="Nhắn tin mới"
          accessibilityLabel="Nhắn tin mới"
          last
          onPress={onNewMessagePress}
        />
      </Animated.View>
    </View>
  );
};

function StartRow({
  styles,
  icon,
  tint,
  tintSoft,
  label,
  accessibilityLabel,
  last = false,
  onPress,
}: {
  styles: ReturnType<typeof makeStartPopupStyles>;
  icon: string;
  /** Icon color — a semantic token supplied by the caller. */
  tint: string;
  /** Shell fill at the same hue (palette `*Soft`) so dark mode gets its own
   *  tint instead of a light-mode alpha over a dark surface. */
  tintSoft: string;
  label: string;
  accessibilityLabel: string;
  /** Last row: carries the panel's bottom inset. */
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.actionRow, !last && styles.rowDivider, last && styles.lastRow]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: styles.rippleColor.color }}>
      {/* Colored-glyph + soft-tint shell — same convention as the action sheet. */}
      <View style={[styles.iconShell, { backgroundColor: tintSoft }]}>
        <Icon name={icon} size={18} color={tint} />
      </View>
      <KoolaText variant="body" style={styles.rowText}>
        {label}
      </KoolaText>
    </Pressable>
  );
}

function makeStartPopupStyles(semantic: SemanticTokens, panelTop: number) {
  return StyleSheet.create({
    absoluteFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      // Above the sub-tab bar (zIndex 11) and the scenes; still inside
      // ChatHomeContent, so the header chrome (zIndex 20, parent subtree)
      // stays above the scrim.
      zIndex: 9999,
      elevation: 9999,
      // Anchored under the sub-tab bar instead of centred: the overlay starts
      // at the top of the content subtree, so `panelTop` already excludes the
      // bar and the small gap keeps the panel clear of it.
      justifyContent: 'flex-start',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: panelTop + koolaSpacing.sm,
    },
    backdropLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: semantic.surface.overlay,
    },
    panel: {
      // level1 matches KoolaConfirmHost / KoolaDialog / ConversationActionSheet
      // so every centered dialog in the app reads as the same surface.
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
    rippleColor: {
      color: semantic.action.primarySoft,
    },
  });
}

export default ChatStartPopup;
