import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated as NativeAnimated, View, Pressable, InteractionManager, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator, MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { ChatSubTabParamList, ChatTabStackParamList } from '../../navigation/types';
import { onChatHomeReset } from '../../navigation/chatTabReset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatSubTabVisibilityContext } from './ChatSubTabVisibilityContext';
import ConversationListScreen from './ConversationListScreen';
import ContactsScreen from './ContactsScreen';
import MomentsScreen from './MomentsScreen';
import ShortsScreen from './ShortsScreen';
import QrScannerModal from './QrScannerModal';
import GroupCreateModal from '../../components/GroupCreateModal';
import { KoolaText, KoolaSkeleton, koolaRadii, koolaShadows, koolaDarkShadows, useTheme } from '../../ui';
import { NOTCH_WING_INSET, NOTCH_HEADER_CONTENT_H } from '../../components/NotchHeader';
import type { SemanticTokens } from '../../ui/tokens/semantic';

const ConnectionsPlaceholder: React.FC = () => {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.semantic.bg.canvas, padding: 24 }}>
      <MaterialIcons name="handshake" size={48} color={tokens.semantic.text.muted} />
      <KoolaText variant="title" weight="600" align="center" style={{ marginTop: 12, color: tokens.semantic.text.primary }}>
        Kết nối
      </KoolaText>
      <KoolaText variant="body" align="center" style={{ marginTop: 8, color: tokens.semantic.text.muted }}>
        Khám phá và kết nối với cộng đồng Koola.
      </KoolaText>
    </View>
  );
};

const TopTab = createMaterialTopTabNavigator<ChatSubTabParamList>();
const CHAT_SUB_TAB_BAR_HEIGHT = 40;

// ─── Sub-tab metadata ─────────────────────────────────────────────────────────
// Each tab provides a paired (outline ↔ filled) icon. Active state crossfades
// from outline to filled to read as a deliberate state shift, not a colour swap.
type TabMeta = {
  iconIdle: string;
  iconActive: string;
  label: string;
};

const SUB_TAB_META: Record<keyof ChatSubTabParamList, TabMeta> = {
  Messages: { iconIdle: 'chat', iconActive: 'forum', label: 'Tin nhắn' },
  Contacts: { iconIdle: 'people-outline', iconActive: 'people', label: 'Danh bạ' },
  Moments: { iconIdle: 'star-outline', iconActive: 'star', label: 'Khoảnh khắc' },
  Shorts: { iconIdle: 'play-circle-outline', iconActive: 'play-circle-filled', label: 'Xem trước' },
  Connections: { iconIdle: 'handshake', iconActive: 'handshake', label: 'Kết nối' },
};

// Hook for unread counts. Returns 0 for now — wire to store/api when available.
function useUnreadCount(_routeName: keyof ChatSubTabParamList): number {
  return 0;
}

// ─── Tab item ────────────────────────────────────────────────────────────────
interface TabItemProps {
  meta: TabMeta;
  isFocused: boolean;
  position: MaterialTopTabBarProps['position'];
  tabIndex: number;
  routesLength: number;
  unread: number;
  onPress: () => void;
  semantic: SemanticTokens;
}

const TabItem: React.FC<TabItemProps> = ({
  meta,
  isFocused,
  position,
  tabIndex,
  routesLength,
  unread,
  onPress,
  semantic,
}) => {
  const press = useSharedValue(0);
  const inputRange = useMemo(() => Array.from({ length: routesLength }, (_, index) => index), [routesLength]);
  const activeProgress = useMemo(() => position.interpolate({
    inputRange,
    outputRange: inputRange.map((index) => (index === tabIndex ? 1 : 0)),
    extrapolate: 'clamp',
  }), [inputRange, position, tabIndex]);
  const inactiveProgress = useMemo(() => position.interpolate({
    inputRange,
    outputRange: inputRange.map((index) => (index === tabIndex ? 0 : 1)),
    extrapolate: 'clamp',
  }), [inputRange, position, tabIndex]);
  const focusTransformStyle = useMemo(() => ({
    transform: [
      {
        translateY: activeProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -1.5],
        }),
      },
      {
        scale: activeProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.08],
        }),
      },
    ],
  }), [activeProgress]);

  const handlePressIn = useCallback(() => {
    press.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
  }, [press]);

  const handlePressOut = useCallback(() => {
    press.value = withSpring(0, { damping: 12, stiffness: 260, mass: 0.4 });
  }, [press]);

  const pressStyle = useAnimatedStyle(() => {
    const p = press.value;
    return {
      transform: [{ scale: 1 - 0.09 * p }],
      opacity: 1 - 0.16 * p,
    };
  });

  return (
    <Pressable
      style={tabItemStyles.host}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={{ color: semantic.action.primarySoft, borderless: true, radius: 32 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={meta.label}>
      <Animated.View style={pressStyle}>
        <NativeAnimated.View style={[tabItemStyles.inner, focusTransformStyle]}>
          <View style={tabItemStyles.iconSlot}>
            <NativeAnimated.View style={[tabItemStyles.iconLayer, { opacity: inactiveProgress }]}>
              <MaterialIcons
                name={meta.iconIdle}
                size={24}
                color={semantic.text.muted}
              />
            </NativeAnimated.View>
            <NativeAnimated.View style={{ opacity: activeProgress }}>
              <MaterialIcons
                name={meta.iconActive}
                size={24}
                color={semantic.action.primary}
              />
            </NativeAnimated.View>
            {unread > 0 ? (
              <View style={[tabItemStyles.badge, { backgroundColor: semantic.signal.unread }]}>
                <KoolaText variant="caption" weight="700" style={[tabItemStyles.badgeText, { color: semantic.text.onAction }]}>
                  {unread > 99 ? '99+' : String(unread)}
                </KoolaText>
              </View>
            ) : null}
          </View>
          <NativeAnimated.View
            style={[
              tabItemStyles.activeUnderline,
              {
                backgroundColor: semantic.action.primary,
                opacity: activeProgress,
                transform: [{
                  scaleX: activeProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.45, 1],
                  }),
                }],
              },
            ]}
          />
        </NativeAnimated.View>
      </Animated.View>
    </Pressable>
  );
};

const tabItemStyles = {
  host: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 40,
    paddingHorizontal: 1,
  },
  inner: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconSlot: {
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconLayer: {
    position: 'absolute' as const,
  },
  activeUnderline: {
    position: 'absolute' as const,
    left: 4,
    bottom: -5,
    width: 20,
    height: 2,
    borderRadius: 2,
  },
  badge: {
    position: 'absolute' as const,
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: koolaRadii.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
};

// ─── Tab bar ─────────────────────────────────────────────────────────────────
const CustomTabBar: React.FC<MaterialTopTabBarProps> = ({ state, navigation, position }) => {
  const { tokens } = useTheme();
  const semantic = tokens.semantic;
  const visibilityContext = React.useContext(ChatSubTabVisibilityContext);
  const messagesUnread = useUnreadCount('Messages');
  const contactsUnread = useUnreadCount('Contacts');
  const momentsUnread = useUnreadCount('Moments');
  const shortsUnread = useUnreadCount('Shorts');
  const connectionsUnread = useUnreadCount('Connections');

  const unreadByRoute: Record<string, number> = {
    Messages: messagesUnread,
    Contacts: contactsUnread,
    Moments: momentsUnread,
    Shorts: shortsUnread,
    Connections: connectionsUnread,
  };

  const barStyles = useMemo(() => ({
    container: {
      backgroundColor: semantic.surface.level1,
      paddingHorizontal: 4,
      paddingTop: 0,
      overflow: 'hidden' as const,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'stretch' as const,
      justifyContent: 'space-between' as const,
      position: 'relative' as const,
    },
  }), [semantic]);

  const visibilityStyle = useAnimatedStyle(() => {
    const hidden = visibilityContext?.hiddenProgress.value ?? 0;
    return {
      height: CHAT_SUB_TAB_BAR_HEIGHT * (1 - hidden),
      opacity: 1 - hidden,
      transform: [{ translateY: -CHAT_SUB_TAB_BAR_HEIGHT * hidden }],
    };
  }, [visibilityContext]);

  useEffect(() => {
    if (state.index !== 0 && visibilityContext) {
      visibilityContext.hiddenProgress.value = withTiming(0, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [state.index, visibilityContext]);

  return (
    <Animated.View style={[barStyles.container, visibilityStyle]} accessibilityRole="tablist">
      <View style={barStyles.row}>
        {state.routes.map((route, index) => {
          const meta = SUB_TAB_META[route.name as keyof ChatSubTabParamList];
          if (!meta) return null;
          const isFocused = state.index === index;
          return (
            <TabItem
              key={route.key}
              meta={meta}
              isFocused={isFocused}
              position={position}
              tabIndex={index}
              routesLength={state.routes.length}
              unread={unreadByRoute[route.name] ?? 0}
              semantic={semantic}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name as never);
                }
              }}
            />
          );
        })}
      </View>
    </Animated.View>
  );
};

// ─── Heavy content subtree (memo boundary) ────────────────────────────────────
// Why a separate React.memo component: ChatHomeScreen re-renders on every
// bottom-tab focus cycle (route.params dance, modal state toggles, header
// press feedback). Without this boundary each of those re-renders walks the
// entire nested TopTab.Navigator tree — 4 sub-tabs, each mounting its own
// screen component — even though none of that UI depends on the outer state.
// Memoizing here confines those re-renders to the chrome layer above and
// keeps the unfreeze-from-freezeOnBlur path from repainting the whole subtree
// on every tab switch. Props are deliberately narrow and all stable (refs,
// useCallback'd handlers, the shared value itself which is a stable object).
interface ChatHomeContentProps {
  styles: ReturnType<typeof makeScreenStyles>;
  hiddenProgress: SharedValue<number>;
  topTabNavRef: React.MutableRefObject<{ navigate: (name: string) => void } | null>;
  qrVisible: boolean;
  onQrClose: () => void;
  onNavigateProfile: (userId: string) => void;
  onNavigateChat: (conversationId: string) => void;
  groupModalVisible: boolean;
  setGroupModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

const ChatHomeContent: React.FC<ChatHomeContentProps> = React.memo(function ChatHomeContent({
  styles: _styles,
  hiddenProgress,
  topTabNavRef,
  qrVisible,
  onQrClose,
  onNavigateProfile,
  onNavigateChat,
  groupModalVisible,
  setGroupModalVisible,
}) {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();

  // Stable context value: `hiddenProgress` is a Reanimated shared value (stable
  // object identity across renders), so wrapping it in useMemo means the
  // Provider's `value` prop only changes when the shared value itself would —
  // which is never. Without this, every parent re-render built a fresh
  // `{ hiddenProgress }` object literal and forced every consumer subtree to
  // re-render even though the underlying shared value hadn't changed. That was
  // the dominant cost on the freezeOnBlur flush (4 state updates in rapid
  // succession each rebuilt the context value and cascaded through 4 sub-tabs).
  const visibilityValue = useMemo(() => ({ hiddenProgress }), [hiddenProgress]);

  // Deterministic Chat entry: subscribe to the emitter fired by MainNavigator's
  // ChatTab handler (both cross-tab navigation and reselect). This replaces the
  // route-params reset dance so no navigation state update happens on tab switch
  // — the emit touches nothing inside the navigation tree, keeping the switch
  // frame free of an extra render pass.
  useEffect(() => onChatHomeReset(() => {
    topTabNavRef.current?.navigate('Messages');
  }), [topTabNavRef]);

  // onCreated must be stable for GroupCreateModal AND for this memo boundary.
  // It closes over `navigation` only (a stable navigator ref), so deps are
  // correct and the callback identity survives parent re-renders.
  const handleGroupCreated = useCallback((conv: { _id: string }) => {
    setGroupModalVisible(false);
    navigation.navigate('Chat', { conversationId: conv._id });
  }, [navigation, setGroupModalVisible]);

  const handleCloseGroupModal = useCallback(() => setGroupModalVisible(false), [setGroupModalVisible]);

  return (
    <>
      <ChatSubTabVisibilityContext.Provider value={visibilityValue}>
        <TopTab.Navigator
          tabBar={(props) => {
            // Capture the top-tab navigation for reset-to-Messages
            topTabNavRef.current = props.navigation;
            return <CustomTabBar {...props} />;
          }}
          screenOptions={{
            lazy: true,
            swipeEnabled: true,
          }}>
          <TopTab.Screen name="Messages" component={ConversationListScreen} />
          <TopTab.Screen name="Contacts" component={ContactsScreen} />
          <TopTab.Screen name="Moments" component={MomentsScreen} />
          <TopTab.Screen name="Shorts" component={ShortsScreen} />
          <TopTab.Screen name="Connections" component={ConnectionsPlaceholder} />
        </TopTab.Navigator>
      </ChatSubTabVisibilityContext.Provider>
      <QrScannerModal
        visible={qrVisible}
        onClose={onQrClose}
        onNavigateProfile={onNavigateProfile}
        onNavigateChat={onNavigateChat}
      />
      <GroupCreateModal
        visible={groupModalVisible}
        onClose={handleCloseGroupModal}
        onCreated={handleGroupCreated}
      />
    </>
  );
});

// ─── Screen ──────────────────────────────────────────────────────────────────
// Unified Pill 48 — floating capsule like bottom dock: pill itself is
// elevated (level2 + hairline + shadow md), container outside stays transparent
// so side gutters + 4px header gap show list data behind like the bottom dock.
const ChatSearchDock: React.FC<{
  onSearchPress: () => void;
  onQrPress: () => void;
  onAddPress: () => void;
}> = ({ onSearchPress, onQrPress, onAddPress }) => {
  const { tokens, resolvedScheme } = useTheme();
  const sem = tokens.semantic;
  const [searchPressed, setSearchPressed] = useState(false);
  const [qrPressed, setQrPressed] = useState(false);
  const [addPressed, setAddPressed] = useState(false);
  const pressedStyle = { backgroundColor: sem.action.primarySoft, opacity: 0.82 as const };
  const dockShadow = resolvedScheme === 'dark' ? koolaDarkShadows.md : koolaShadows.md;
  return (
    <View style={[dockStyles.shadowWrap, dockShadow]}>
      <View
        style={[
          dockStyles.host,
          {
            backgroundColor: sem.surface.level2,
            borderColor: sem.border.subtle,
          },
        ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tìm kiếm"
        accessibilityHint="Mở tìm kiếm hội thoại"
        onPress={onSearchPress}
        onPressIn={() => setSearchPressed(true)}
        onPressOut={() => setSearchPressed(false)}
        android_ripple={{ color: sem.action.primarySoft, borderless: false, radius: 24 }}
        style={[dockStyles.searchBtn, searchPressed ? pressedStyle : null]}>
        <MaterialIcons name="search" size={20} color={sem.action.primary} />
        <KoolaText variant="body" numberOfLines={1} style={{ color: sem.text.muted, fontSize: 13, lineHeight: 18, flex: 1 }}>
          Tìm kiếm
        </KoolaText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quét mã QR"
        accessibilityHint="Mở quét mã QR"
        onPress={onQrPress}
        onPressIn={() => setQrPressed(true)}
        onPressOut={() => setQrPressed(false)}
        android_ripple={{ color: sem.action.primarySoft, borderless: false, radius: 24 }}
        style={[dockStyles.iconBtn, qrPressed ? pressedStyle : null]}>
        <MaterialIcons name="qr-code-scanner" size={22} color={sem.action.primary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tạo nhóm"
        accessibilityHint="Tạo nhóm mới"
        onPress={onAddPress}
        onPressIn={() => setAddPressed(true)}
        onPressOut={() => setAddPressed(false)}
        android_ripple={{ color: sem.action.primarySoft, borderless: false, radius: 24 }}
        style={[dockStyles.iconBtn, addPressed ? pressedStyle : null]}>
        <MaterialIcons name="add" size={22} color={sem.action.primary} />
      </Pressable>
      </View>
    </View>
  );
};

const dockStyles = StyleSheet.create({
  shadowWrap: {
    borderRadius: koolaRadii.pill,
  },
  host: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: koolaRadii.pill,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  searchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: koolaRadii.pill,
    overflow: 'hidden',
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: koolaRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

const ChatHomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  // Floating overlay: dock sits at header bottom; FlatList's inner top padding
  // lets rows scroll behind the transparent gutters like the bottom dock.
  const dockTop = insets.top + NOTCH_WING_INSET + NOTCH_HEADER_CONTENT_H; // = flatH
  const dockReserve = 56; // 4 top gap + 48 pill + 4 bottom gap
  const [qrVisible, setQrVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const hiddenProgress = useSharedValue(0);
  const topTabNavRef = React.useRef<{ navigate: (name: string) => void } | null>(null);

  // ─── First-mount defer: paint chrome immediately, defer heavy nested tabs ────
  // ChatHomeScreen is the only bottom tab holding a nested material-top-tabs
  // (4 sub-tabs) + a large FlatList + a Reanimated sub-tab bar. With
  // freezeOnBlur, returning to this tab unfreezes and re-renders that whole
  // subtree in one frame → jank ("đơ một nhịp"). Deferring the nested content
  // behind a shell frame spreads that cost, mirroring the proven D1 pattern on
  // Shopping/Connect. The ref guard makes this fire once per mount only, so a
  // revisit of an already-populated screen skips the skeleton (no flash).
  const [contentReady, setContentReady] = useState(false);
  const contentReadyFired = useRef(false);

  useEffect(() => {
    if (contentReadyFired.current) return;
    const task = InteractionManager.runAfterInteractions(() => {
      contentReadyFired.current = true;
      setContentReady(true);
    });
    return () => task.cancel();
  }, []);

  const screenStyles = useMemo(() => makeScreenStyles(tokens.semantic), [tokens.semantic]);

  const handleQrPress = useCallback(() => setQrVisible(true), []);
  const handleQrClose = useCallback(() => setQrVisible(false), []);
  const handleAddPress = useCallback(() => setGroupModalVisible(true), []);
  const handleSearchPress = useCallback(() => {
    navigation.navigate('UniversalSearch');
  }, [navigation]);
  const handleNavigateProfile = useCallback((userId: string) => {
    navigation.navigate('Profile', { userId });
  }, [navigation]);
  const handleNavigateChat = useCallback((conversationId: string) => {
    navigation.navigate('Chat', { conversationId });
  }, [navigation]);

  const notchPad = dockTop + dockReserve; // = flatH + 56 (=84): header + pill gap reserve

  return (
    <View style={[screenStyles.container, { paddingTop: notchPad }]}>
      {/* Floating pill: chỉ pill đục + bóng md, mọi rìa 12/4 trong suốt để
          list lướt sau lưng như dock bottom — không có mảng trắng che data. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: dockTop,
          left: 0,
          right: 0,
          zIndex: 20,
          paddingHorizontal: 12,
          paddingTop: 4,
          paddingBottom: 4,
          backgroundColor: 'transparent',
          justifyContent: 'center',
        }}>
        <ChatSearchDock onSearchPress={handleSearchPress} onQrPress={handleQrPress} onAddPress={handleAddPress} />
      </View>
      {!contentReady ? (
        // Interactive shell: KoolaHeader (command dock) stays live above; the
        // heavy nested tabs are replaced by a skeleton sub-tab bar strip + rows
        // sized to the conversation-list layout so there is no layout shift when
        // the real content swaps in. One frame only — InteractionManager fires
        // right after the shell paints.
        <ChatHomeShell styles={screenStyles} />
      ) : (
        <ChatHomeContent
          styles={screenStyles}
          hiddenProgress={hiddenProgress}
          topTabNavRef={topTabNavRef}
          qrVisible={qrVisible}
          onQrClose={handleQrClose}
          onNavigateProfile={handleNavigateProfile}
          onNavigateChat={handleNavigateChat}
          groupModalVisible={groupModalVisible}
          setGroupModalVisible={setGroupModalVisible}
        />
      )}
    </View>
  );
};

// ─── Shell (first-mount / unfreeze placeholder) ───────────────────────────
// Skeleton sub-tab bar strip (matching CustomTabBar's 4 icon slots at
// CHAT_SUB_TAB_BAR_HEIGHT) + skeleton conversation rows (matching
// ConversationListItem: 48px avatar, minHeight 72, hairline separators).
const SHELL_ROW_KEYS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
const SHELL_TAB_KEYS = ['t0', 't1', 't2', 't3', 't4'];

const ChatHomeShell: React.FC<{ styles: ReturnType<typeof makeScreenStyles> }> = ({ styles }) => (
  <View style={styles.shellBody}>
    <View style={styles.shellSubTabBar}>
      {SHELL_TAB_KEYS.map((key) => (
        <View key={key} style={styles.shellSubTabItem}>
          <KoolaSkeleton width={24} height={24} radius={koolaRadii.pill} />
        </View>
      ))}
    </View>
    {SHELL_ROW_KEYS.map((key) => (
      <View key={key} style={styles.shellRow}>
        <KoolaSkeleton width={48} height={48} radius={koolaRadii.pill} />
        <View style={styles.shellRowContent}>
          <KoolaSkeleton width="55%" height={14} />
          <KoolaSkeleton width="80%" height={12} style={styles.shellRowPreview} />
        </View>
      </View>
    ))}
  </View>
);

function makeScreenStyles(semantic: SemanticTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    shellBody: {
      flex: 1,
    },
    shellSubTabBar: {
      height: CHAT_SUB_TAB_BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: semantic.surface.level1,
      paddingHorizontal: 4,
    },
    shellSubTabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shellRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 72,
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: semantic.surface.level1,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semantic.border.subtle,
    },
    shellRowContent: {
      flex: 1,
      marginLeft: 12,
    },
    shellRowPreview: {
      marginTop: 8,
    },
  });
}

export default ChatHomeScreen;
