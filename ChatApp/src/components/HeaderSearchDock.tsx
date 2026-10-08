import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaRadii, useTheme } from '../ui';

// Pill cố định 36 — geometry khớp ChatHomeScreen (DOCK_H), chỉ fill xám animate.
const DOCK_PILL_H = 36;

const dockStyles = StyleSheet.create({
  host: {
    flexDirection: 'row',
    alignItems: 'center',
    height: DOCK_PILL_H,
    paddingHorizontal: 4,
    borderRadius: koolaRadii.pill,
    overflow: 'hidden',
    backgroundColor: 'transparent',
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
});

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
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: sem.border.subtle }, fillFadeStyle]}
      />
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
