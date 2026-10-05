import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated as NativeAnimated, View, Pressable, InteractionManager, StyleSheet, Image } from 'react-native';
import { LightFieldBackground } from './components/personal/LightFieldBackground';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { createMaterialTopTabNavigator, MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  CHAT_SUB_TAB_BAR_HEIGHT,
  ChatHomeHeaderInsetContext,
  chatHomeContentInset,
} from './ChatHomeHeaderInsetContext';
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
import { KoolaText, KoolaSkeleton, koolaRadii, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';

const ConnectionsPlaceholder: React.FC = () => {
  const { tokens } = useTheme();
  const headerInset = React.useContext(ChatHomeHeaderInsetContext);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.semantic.bg.canvas, padding: 24, paddingTop: headerInset + 24 }}>
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
  isDark: boolean;
}

// MaterialIcons codepoints for the active (filled) sub-tab glyphs, rendered
// through SvgText so the icon itself can carry a gradient fill. Values match
// react-native-vector-icons/MaterialIcons glyphmap — do not hand-edit.
const ACTIVE_GLYPH_CHAR: Record<string, string> = {
  forum: String.fromCharCode(0xe0bf),
  people: String.fromCharCode(0xe7fb),
  star: String.fromCharCode(0xe838),
  'play-circle-filled': String.fromCharCode(0xe038),
  handshake: String.fromCharCode(0xebcb),
};

const TabItem: React.FC<TabItemProps> = ({
  meta,
  isFocused,
  position,
  tabIndex,
  routesLength,
  unread,
  onPress,
  semantic,
  isDark,
}) => {
  // Diagonal gradient glyph: top-left ORANGE → bottom-right BLUE (x1=0 y1=0 →
  // x2=1 y2=1) — the reverse of the bottom bar (blue→orange). Same palette as
  // TabIcon3D in MainNavigator.
  const instanceId = React.useId();
  const cleanId = instanceId.replace(/:/g, '_');
  const gradOrange = isDark ? '#FF9A3D' : '#FF8A1A';
  const gradBlue = isDark ? '#4D8DF7' : '#2563EB';
  const glyphGradId = `subTabGlyph-${cleanId}`;
  const barGradId = `subTabBar-${cleanId}`;
  const glyphChar = ACTIVE_GLYPH_CHAR[meta.iconActive] ?? meta.iconActive;
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
              <Svg width={24} height={24} viewBox="0 0 24 24">
                <Defs>
                  <SvgLinearGradient id={glyphGradId} x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={gradOrange} />
                    <Stop offset="1" stopColor={gradBlue} />
                  </SvgLinearGradient>
                </Defs>
                <SvgText
                  x="12"
                  y="12"
                  textAnchor="middle"
                  alignmentBaseline="central"
                  fontFamily="MaterialIcons"
                  fontSize={24}
                  fill={`url(#${glyphGradId})`}>
                  {glyphChar}
                </SvgText>
              </Svg>
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
                opacity: activeProgress,
                transform: [{
                  scaleX: activeProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.45, 1],
                  }),
                }],
              },
            ]}>
            <Svg width={20} height={2} viewBox="0 0 20 2">
              <Defs>
                <SvgLinearGradient id={barGradId} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={gradOrange} />
                  <Stop offset="1" stopColor={gradBlue} />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="20" height="2" rx="1" fill={`url(#${barGradId})`} />
            </Svg>
          </NativeAnimated.View>
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

// ─── Floating frosted chrome ─────────────────────────────────────────────────
// Header (wordmark + dock) và sub-tab bar dùng CHUNG 1 tấm kính phủ màu duy
// nhất (render trong CustomTabBar, nằm dưới header): tint trắng mờ + bloom
// LightField — giữ đúng hiệu ứng cũ, KHÔNG blur. Một tấm = không đường nối,
// bloom bắt đầu từ y=0 nên khớp nền trang. Cảm giác "nổi" đến từ bóng đổ
// (ChromeShadow) hiện dần khi có data cuộn phía sau.
//
// Khi ẩn sub-tab bar, tấm kính chỉ TRƯỢT lên (translateY) — không đổi height.
const CHROME_TINT_LIGHT = 'rgba(255,255,255,0.84)';
const CHROME_TINT_DARK = 'rgba(15,20,25,0.72)';
const CHROME_BLOOM_OPACITY = 0.72;
const CHROME_FALLBACK_LIGHT = '#FFFFFF';
const CHROME_FALLBACK_DARK = '#1C2026';
/** Chiều cao dải bóng đổ dưới chrome khi "nổi" lên khỏi nội dung. */
const CHROME_SHADOW_H = 14;

/**
 * Scrim dọc phủ trên tấm kính trong vùng header: chỉ phủ vùng status bar,
 * tan dần về 0 tại `solidUntil` (đáy status bar) — không phủ wordmark/dock;
 * phần còn lại tới đáy block (đáy dock) giữ đúng độ trong của tấm kính.
 * Nằm trong header block cố định nên không trượt theo sub-tab bar.
 */
const ChromeEdgeScrim: React.FC<{ isDark: boolean; height: number; solidUntil: number }> = ({
  isDark,
  height,
  solidUntil,
}) => {
  const color = isDark ? CHROME_FALLBACK_DARK : CHROME_FALLBACK_LIGHT;
  const solidStop = Math.min(1, Math.max(0, solidUntil / height));
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height={height}>
      <Defs>
        <SvgLinearGradient id="chatChromeEdgeScrim" x1="0" y1="0" x2="0" y2="1">
          {/* Nhẹ: chỉ đỡ thêm cho giờ/pin; từ wordmark trở xuống giữ đúng
              độ trong của tấm kính (user muốn vẫn thấy data mờ phía sau). */}
          <Stop offset="0" stopColor={color} stopOpacity="0.5" />
          <Stop offset={String(solidStop)} stopColor={color} stopOpacity="0" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>
      <Rect width="100%" height={height} fill="url(#chatChromeEdgeScrim)" />
    </Svg>
  );
};

const ChromeShadow: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <Svg width="100%" height={CHROME_SHADOW_H}>
    <Defs>
      <SvgLinearGradient id="chatChromeShadow" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#000000" stopOpacity={isDark ? '0.36' : '0.12'} />
        <Stop offset="1" stopColor="#000000" stopOpacity="0" />
      </SvgLinearGradient>
    </Defs>
    <Rect width="100%" height={CHROME_SHADOW_H} fill="url(#chatChromeShadow)" />
  </Svg>
);

// ─── Tab bar ─────────────────────────────────────────────────────────────────
// Overlays the sub-tab scenes (absolute, directly below the glass header block)
// instead of taking layout space, so scene lists start at y=0 and rows scroll
// behind both the bar and the blur. Scenes reserve the resting chrome height
// via ChatHomeHeaderInsetContext.
type CustomTabBarProps = MaterialTopTabBarProps & { top: number };

const CustomTabBar: React.FC<CustomTabBarProps> = ({ state, navigation, position, top }) => {
  const { tokens, resolvedScheme } = useTheme();
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

  const isDark = resolvedScheme === 'dark';

  const barStyles = useMemo(() => ({
    // Tấm kính chung: phủ từ y=0 (sau header) tới đáy sub-tab bar.
    glass: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      height: top + CHAT_SUB_TAB_BAR_HEIGHT,
      zIndex: 10,
    },
    glassClip: {
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden' as const,
    },
    hairline: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: semantic.border.subtle,
    },
    shadow: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: '100%' as const,
    },
    container: {
      position: 'absolute' as const,
      top,
      left: 0,
      right: 0,
      zIndex: 11,
      backgroundColor: 'transparent',
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
  }), [semantic, top]);

  const visibilityStyle = useAnimatedStyle(() => {
    const t = visibilityContext?.hiddenProgress.value ?? 0;
    const h = t * t * (3 - 2 * t); // smoothstep: êm ở 2 đầu, vẫn nhạy khi vừa đổi hướng
    return {
      height: CHAT_SUB_TAB_BAR_HEIGHT * (1 - h),
      opacity: 1 - h,
      transform: [{ translateY: -CHAT_SUB_TAB_BAR_HEIGHT * h }],
    };
  }, [visibilityContext]);

  // Kính chỉ trượt lên theo tab bar (translateY, không đổi height → không relayout).
  const glassStyle = useAnimatedStyle(() => {
    const t = visibilityContext?.hiddenProgress.value ?? 0;
    const h = t * t * (3 - 2 * t);
    return { transform: [{ translateY: -CHAT_SUB_TAB_BAR_HEIGHT * h }] };
  }, [visibilityContext]);

  // Bóng đổ = chrome "nổi" khỏi nội dung; chỉ hiện khi có data cuộn phía sau.
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: visibilityContext?.scrolledProgress.value ?? 0,
  }), [visibilityContext]);

  // Chỉ 1 cách phân tách tại 1 thời điểm: hairline lúc nghỉ, bóng đổ lúc cuộn.
  const hairlineStyle = useAnimatedStyle(() => ({
    opacity: 1 - (visibilityContext?.scrolledProgress.value ?? 0),
  }), [visibilityContext]);

  useEffect(() => {
    if (state.index !== 0 && visibilityContext) {
      visibilityContext.hiddenProgress.value = withTiming(0, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [state.index, visibilityContext]);

  // Đổi sub-tab: scene mới tự báo lại scrolledProgress ở lần scroll kế tiếp.
  useEffect(() => {
    if (visibilityContext) {
      visibilityContext.scrolledProgress.value = withTiming(0, { duration: 160 });
    }
  }, [state.index, visibilityContext]);

  return (
    <>
      <Animated.View pointerEvents="none" style={[barStyles.glass, glassStyle]}>
        <View style={barStyles.glassClip}>
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: isDark ? CHROME_TINT_DARK : CHROME_TINT_LIGHT },
            ]}
          />
          <View style={[StyleSheet.absoluteFill, { opacity: CHROME_BLOOM_OPACITY }]}>
            <LightFieldBackground windowSized />
          </View>
          <Animated.View style={[barStyles.hairline, hairlineStyle]} />
        </View>
        <Animated.View style={[barStyles.shadow, shadowStyle]}>
          <ChromeShadow isDark={isDark} />
        </Animated.View>
      </Animated.View>
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
                isDark={isDark}
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
    </>
  );
};

// ─── Heavy content subtree (memo boundary) ────────────────────────────────────
// Why a separate React.memo component: ChatHomeScreen re-renders on every
// bottom-tab focus cycle (route.params dance, modal state toggles, header
// press feedback). Without this boundary each of those re-renders walks the
// entire nested TopTab.Navigator tree — 4 sub-tabs, each mounting its own
// screen component — even though none of that UI depends on the outer state.
// Memoizing here confines those re-renders to the chrome layer above and
interface ChatHomeContentProps {
  styles: ReturnType<typeof makeScreenStyles>;
  hiddenProgress: SharedValue<number>;
  scrolledProgress: SharedValue<number>;
  /** y where the overlaid sub-tab bar sits (= glass header block height). */
  tabBarTop: number;
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
  scrolledProgress,
  tabBarTop,
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
  const visibilityValue = useMemo(
    () => ({ hiddenProgress, scrolledProgress }),
    [hiddenProgress, scrolledProgress],
  );

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
            return <CustomTabBar {...props} top={tabBarTop} />;
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
// Flat pill dock — pill cố định cao 36. Lớp fill xám (lớp con đầu tiên, absolute
// fill trong pill bo tròn + overflow hidden) mờ dần opacity 1→0 khi sub-tab bar ẩn
// theo scroll (cùng đường smoothstep với CustomTabBar, chạy trên UI thread) → pill
// hoà vào nền kính header phía sau, khớp tuyệt đối cả light/dark mà không hardcode
// màu. Sub-tab bar hiện lại thì fill hiện dần về. Icon, chữ và press feedback từng
// nút không bị ảnh hưởng; geometry header (blockH/tabBarTop/headerInset) không đổi.
const ChatSearchDock: React.FC<{
  hiddenProgress: SharedValue<number>;
  onSearchPress: () => void;
  onQrPress: () => void;
  onAddPress: () => void;
}> = ({ hiddenProgress, onSearchPress, onQrPress, onAddPress }) => {
  const { tokens } = useTheme();
  const sem = tokens.semantic;
  const [searchPressed, setSearchPressed] = useState(false);
  const [qrPressed, setQrPressed] = useState(false);
  const [addPressed, setAddPressed] = useState(false);
  const pressedStyle = { backgroundColor: sem.action.primarySoft, opacity: 0.82 as const };
  const fillFadeStyle = useAnimatedStyle(() => {
    // Kẹp [0,1]: spring snap có thể vọt nhẹ quá biên → opacity luôn nằm trong 0–1.
    const t = Math.min(1, Math.max(0, hiddenProgress.value));
    const h = t * t * (3 - 2 * t); // smoothstep — khớp visibilityStyle của sub-tab bar
    return { opacity: 1 - h };
  }, [hiddenProgress]);
  return (
    <View style={dockStyles.host}>
      {/* Lớp fill xám — đúng màu pill bên Mua sắm: ShoppingSearchDock dùng
          `semantic.border.subtle` làm fill (#E4E7EC light / #2F3542 dark), không
          phải bg.canvas. Absolute fill trong pill bo tròn + overflow hidden nên
          vẫn bo tròn; mờ dần về 0 khi sub-tab bar ẩn. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: sem.border.subtle }, fillFadeStyle]}
      />
      {/* alignSelf 'stretch': hàng nút nhận chiều cao xác định từ pill (cố định 36)
          để các nút height '100%' lấp đầy pill (host alignItems 'center' không
          stretch con). Render sau lớp fill nên nằm phía trên. */}
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
          </View>
    </View>
  );
};

// Chiều cao pill search dock — cố định, chỉ lớp fill xám bên trong là animate.
const DOCK_PILL_H = 36;

const dockStyles = StyleSheet.create({
  host: {
    flexDirection: 'row',
    alignItems: 'center',
    height: DOCK_PILL_H,
    paddingHorizontal: 4,
    borderRadius: koolaRadii.pill,
    overflow: 'hidden',
    // Nền trong suốt: màu xám do lớp fill con vẽ (mờ dần khi sub-tab bar ẩn).
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
    height: '100%', // lấp đầy pill cố định 36 để không bị overflow:hidden cắt
    borderRadius: koolaRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

const ChatHomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();
  const { tokens, resolvedScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [qrVisible, setQrVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const hiddenProgress = useSharedValue(0);
  const scrolledProgress = useSharedValue(0);
  const topTabNavRef = React.useRef<{ navigate: (name: string) => void } | null>(null);

  // ─── Frosted header block geometry ──────────────────────────────────────────
  // The wordmark (17h) + search dock (36h) chrome block, pinned to the top with
  // frosted semi-transparent backing matching Shopping/Connect tabs. Sub-tab bar (40h) overlays directly below it.
  // Layout: insets.top + 2 (top) + 17 (wordmark) + 6 (gap) + 36 (dock) = insets.top + 61.
  const WORDMARK_TOP = 1; // Nhích lên 1px so với trước (2→1)
  const WORDMARK_H = 15;  // Thu nhỏ 17→15 để logo gọn hơn
  const DOCK_GAP = 6;     // Gap between wordmark and dock
  const DOCK_H = 36;      // Search dock slot height (fixed; pill inside is also a fixed 36, only its gray fill fades)
  const blockH = insets.top + WORDMARK_TOP + WORDMARK_H + DOCK_GAP + DOCK_H; // = insets.top + 58
  const tabBarTop = blockH; // Sub-tab bar sits directly below frosted block
  const headerInset = chatHomeContentInset(blockH); // Full chrome inset for scene lists

  const isDark = resolvedScheme === 'dark';


  // ─── First-mount defer: paint chrome immediately, defer heavy nested tabs ────
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

  return (
    <ChatHomeHeaderInsetContext.Provider value={headerInset}>
      <View style={screenStyles.container}>
        {/* Sticky frosted header block — wordmark + search dock matching Shopping/Connect tabs */}
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: blockH,
            zIndex: 20,
            overflow: 'hidden',
          }}>
          {/* Nền kính (tint + bloom) do CustomTabBar vẽ bên dưới khối này — 1 tấm
              liền cho cả header + sub-tab bar. Trước khi nested tabs mount
              (shell), dùng nền đặc tạm để header không trong suốt trên skeleton. */}
          {!contentReady ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: isDark ? CHROME_FALLBACK_DARK : CHROME_FALLBACK_LIGHT },
              ]}
            />
          ) : (
            // Scroll-edge scrim (kiểu iOS 26): chỉ phủ vùng status bar, nhạt
            // dần về 0 tại đáy status bar → giờ/pin luôn sạch; wordmark, dock
            // và sub-tab bar vẫn thấy mờ data phía sau qua tấm kính.
            <ChromeEdgeScrim
              isDark={isDark}
              height={blockH}
              solidUntil={insets.top}
            />
          )}
          {/* KOOLA wordmark — same geometry as NotchHeader wordmark branch (logo top = insets.top + 2) */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: insets.top + WORDMARK_TOP,
              height: WORDMARK_H,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Image
              source={require('../../assets/logo_koola_wordmark.png')}
              style={{ width: 87, height: 15 }}
              resizeMode="contain"
              accessibilityLabel="KOOLA"
            />
          </View>
          {/* Command dock (search + QR + add) — 6dp below wordmark, fixed 36h slot + pill 36; fill xám mờ dần khi sub-tab ẩn */}
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: insets.top + WORDMARK_TOP + WORDMARK_H + DOCK_GAP,
              height: DOCK_H,
              paddingHorizontal: 12,
              justifyContent: 'center',
            }}>
            <ChatSearchDock
              hiddenProgress={hiddenProgress}
              onSearchPress={handleSearchPress}
              onQrPress={handleQrPress}
              onAddPress={handleAddPress}
            />
          </View>
        </View>
        {!contentReady ? (
          <ChatHomeShell styles={screenStyles} />
        ) : (
          <ChatHomeContent
            styles={screenStyles}
            hiddenProgress={hiddenProgress}
            scrolledProgress={scrolledProgress}
            tabBarTop={tabBarTop}
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
    </ChatHomeHeaderInsetContext.Provider>
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
