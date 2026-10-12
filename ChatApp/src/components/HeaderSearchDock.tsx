import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaIconWell, koolaOpacity, koolaRadii, useTheme } from '../ui';

// Pill cố định 36 — geometry khớp ChatHomeScreen (DOCK_H), chỉ fill xám animate.
const DOCK_PILL_H = 36;

const dockStyles = StyleSheet.create({
  host: {
    flexDirection: 'row',
    alignItems: 'center',
    height: DOCK_PILL_H,
    paddingHorizontal: 4,
    borderRadius: koolaRadii.pill,
    backgroundColor: 'transparent',
  },
  // Only the animated fill is clipped to the pill; the host itself must not clip
  // or the dock actions' count badges (top -4 / right -8) get cut in half.
  fillClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: koolaRadii.pill,
    overflow: 'hidden',
  },
  searchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: '100%',
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: koolaRadii.pill,
    overflow: 'hidden',
  },
  iconBtn: {
    width: 48,
    height: '100%',
    borderRadius: koolaRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconBtnHost: {
    width: 48,
    height: '100%',
  },
  ghostHost: {
    width: 48,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: koolaRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export type HeaderDockActionProps = {
  /** MaterialIcons glyph name, rendered at size 22 in the primary action color. */
  icon: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Optional count badge; hidden when 0 or undefined. */
  badgeCount?: number;
  /** Appended to the accessibility label when a badge is shown. */
  badgeAccessibilityText?: string;
};

/**
 * Dock icon action — the shared geometry for every right-side action in a
 * `HeaderSearchDock` pill: 48dp wide, full height, pill radius, glyph 22 scaled
 * 0.82. Chat renders QR + add through it, Connect renders QR + filter.
 *
 * The Pressable clips its own ripple (`overflow: 'hidden'`); the badge therefore
 * lives on the unclipped host View beside it, positioned `top -4 / right -8`.
 */
// Shared constants for the two icon families so header ghost and dock pill never drift.
export const HEADER_GHOST_SIZE = 36;
export const HEADER_GHOST_ICON = 20;
export const DOCK_PILL_ICON = 22;

export const HeaderDockGhostAction: React.FC<HeaderDockActionProps> = ({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  badgeCount = 0,
  badgeAccessibilityText,
}) => {
  const { tokens, resolvedScheme } = useTheme();
  const sem = tokens.semantic;
  const [pressed, setPressed] = React.useState(false);
  const showBadge = badgeCount > 0;
  const resolvedLabel = showBadge && badgeAccessibilityText ? `${accessibilityLabel}, ${badgeAccessibilityText}` : accessibilityLabel;
  return (
    <View style={dockStyles.ghostHost}>
      <Pressable
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={resolvedLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[
          dockStyles.ghostBtn,
          pressed && { backgroundColor: koolaIconWell[resolvedScheme], opacity: koolaOpacity.pressed },
        ]}>
        <MaterialIcons name={icon} size={HEADER_GHOST_ICON} color={sem.text.muted} />
      </Pressable>
      {showBadge ? (
        <View pointerEvents="none" style={[dockStyles.badge, { backgroundColor: sem.status.danger }]}>
          <KoolaText variant="caption" weight="700" style={{ color: sem.text.onAction, fontSize: 10, lineHeight: 12 }} numberOfLines={1}>
            {badgeCount > 99 ? '99+' : String(badgeCount)}
          </KoolaText>
        </View>
      ) : null}
    </View>
  );
};

export const HeaderDockAction: React.FC<HeaderDockActionProps> = ({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  badgeCount = 0,
  badgeAccessibilityText,
}) => {
  const { tokens } = useTheme();
  const sem = tokens.semantic;
  const [pressed, setPressed] = useState(false);
  const showBadge = badgeCount > 0;
  const resolvedLabel = showBadge && badgeAccessibilityText
    ? `${accessibilityLabel}, ${badgeAccessibilityText}`
    : accessibilityLabel;

  return (
    <View style={dockStyles.iconBtnHost}>
      <Pressable
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={resolvedLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        android_ripple={{ color: sem.action.primarySoft, borderless: false, radius: 24 }}
        style={[dockStyles.iconBtn, pressed ? { backgroundColor: sem.action.primarySoft, opacity: 0.82 } : null]}>
        <View style={{ transform: [{ scale: 0.82 }] }}>
          <MaterialIcons name={icon} size={22} color={sem.action.primary} />
        </View>
      </Pressable>
      {showBadge ? (
        <View pointerEvents="none" style={[dockStyles.badge, { backgroundColor: sem.status.danger }]}>
          <KoolaText variant="caption" weight="700" style={{ color: sem.text.onAction, fontSize: 10, lineHeight: 12 }} numberOfLines={1}>
            {badgeCount > 99 ? '99+' : String(badgeCount)}
          </KoolaText>
        </View>
      ) : null}
    </View>
  );
};

/**
 * Dock Tìm kiếm | QR | Tạo nhóm — dùng chung ChatHome + PersonalHome.
 * hiddenProgress điều khiển fill xám mờ 1→0 khi sub-tab bar ẩn (UI thread).
 * Truyền hiddenProgress = undefined ở màn không có sub-tab (Personal) → fill luôn đặc.
 */
export const HeaderSearchDock: React.FC<{
  hiddenProgress?: SharedValue<number>;
  onSearchPress: () => void;
  rightActions?: React.ReactNode;
  /** @deprecated use rightActions */
  onQrPress?: () => void;
  /** @deprecated use rightActions */
  onAddPress?: () => void;
}> = ({ hiddenProgress, onSearchPress, rightActions, onQrPress, onAddPress }) => {
  const { tokens } = useTheme();
  const sem = tokens.semantic;
  const [searchPressed, setSearchPressed] = useState(false);
  const [qrPressed, setQrPressed] = useState(false);
  const [addPressed, setAddPressed] = useState(false);
  const pressedStyle = { backgroundColor: sem.action.primarySoft, opacity: 0.82 as const };
  const fillFadeStyle = useAnimatedStyle(() => {
    if (!hiddenProgress) return { opacity: 1 };
    const t = Math.min(1, Math.max(0, hiddenProgress.value));
    const h = t * t * (3 - 2 * t);
    return { opacity: 1 - h };
  }, [hiddenProgress]);

  let effectiveRightActions: React.ReactNode = rightActions;
  if (!effectiveRightActions && (onQrPress || onAddPress)) {
    effectiveRightActions = (
      <>
        {onQrPress ? (
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Quét mã QR"
            accessibilityHint="Mở quét mã QR"
            onPress={onQrPress}
            onPressIn={() => setQrPressed(true)}
            onPressOut={() => setQrPressed(false)}
            android_ripple={{ color: sem.action.primarySoft, borderless: false, radius: 24 }}
            style={[dockStyles.iconBtn, qrPressed ? pressedStyle : null]}>
            <View style={{ transform: [{ scale: 0.82 }] }}>
              <MaterialIcons name="qr-code-scanner" size={22} color={sem.action.primary} />
            </View>
          </Pressable>
        ) : null}
        {onAddPress ? (
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Tạo nhóm"
            accessibilityHint="Tạo nhóm mới"
            onPress={onAddPress}
            onPressIn={() => setAddPressed(true)}
            onPressOut={() => setAddPressed(false)}
            android_ripple={{ color: sem.action.primarySoft, borderless: false, radius: 24 }}
            style={[dockStyles.iconBtn, addPressed ? pressedStyle : null]}>
            <View style={{ transform: [{ scale: 0.82 }] }}>
              <MaterialIcons name="add" size={22} color={sem.action.primary} />
            </View>
          </Pressable>
        ) : null}
      </>
    );
  }

  return (
    <View style={dockStyles.host}>
      <View pointerEvents="none" style={dockStyles.fillClip}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: sem.border.subtle }, fillFadeStyle]}
        />
      </View>
      <View style={{ flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Tìm kiếm"
          accessibilityHint="Mở tìm kiếm hội thoại"
          onPress={onSearchPress}
          onPressIn={() => setSearchPressed(true)}
          onPressOut={() => setSearchPressed(false)}
          android_ripple={{ color: sem.action.primarySoft, borderless: false, radius: 24 }}
          style={[dockStyles.searchBtn, searchPressed ? pressedStyle : null]}>
          <MaterialIcons name="search" size={20} color={sem.action.primary} />
          <KoolaText variant="body" numberOfLines={1} style={{ color: sem.text.muted, lineHeight: 18, flex: 1, fontSize: 11.5 }}>
            Tìm kiếm
          </KoolaText>
        </Pressable>
        {effectiveRightActions}
      </View>
    </View>
  );
};

export const HEADER_SEARCH_DOCK_H = DOCK_PILL_H;
