import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated as NativeAnimated, BackHandler, View, Pressable, InteractionManager, StyleSheet } from 'react-native';
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
import { ChromeHeaderBox, getChromeBoxHeight } from '../../components/ChromeHeaderBox';
import { ChromeGlassSheet } from '../../components/ChromeGlassSheet';
import { HeaderDockAction } from '../../components/HeaderSearchDock';
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
import ChatStartPopup from '../../components/ChatStartPopup';
import { useChatHomeOverlay, type ChatHomeOverlay, type GroupCloseRequester } from './useChatHomeOverlay';
import { useTabDockSuppression } from '../../navigation/MainNavigator';
import { acquireBackIntercept } from '../../services/nativeBack';
import { KoolaText, KoolaSkeleton, koolaRadii, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';

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

// Container nằm trong bar wrapper (đã absolute top=blockH), nên không tự absolute top nữa.
const barStyles = {
  container: {
    position: 'relative' as const,
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
};

// ─── Floating frosted chrome ─────────────────────────────────────────────────
// Header (wordmark + dock) và sub-tab bar dùng CHUNG 1 tấm kính phủ màu duy
// nhất, render bởi `ChromeGlassSheet` (single source: tint + bloom + hairline +
// bóng đổ + height animation). Một tấm = không đường nối, bloom bắt đầu từ y=0
// nên khớp nền trang. Cảm giác "nổi" đến từ bóng đổ hiện dần khi có data cuộn
// phía sau.

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

  const unreadByRoute: Record<string, number> = {
    Messages: messagesUnread,
    Contacts: contactsUnread,
    Moments: momentsUnread,
    Shorts: shortsUnread,
  };

  const isDark = resolvedScheme === 'dark';

  // Wrapper chỉ bọc vùng sub-tab (top=blockH) để overflow:hidden cắt icon
  // trước khi nó trượt vào header. Kính đứng yên riêng ở y=0 → không translate.
  const barVisibilityStyle = useAnimatedStyle(() => {
    const t = visibilityContext?.hiddenProgress.value ?? 0;
    const h = t * t * (3 - 2 * t);
    return {
      height: CHAT_SUB_TAB_BAR_HEIGHT * (1 - h),
      opacity: 1 - h,
      transform: [{ translateY: -CHAT_SUB_TAB_BAR_HEIGHT * h }],
    };
  }, [visibilityContext]);

  const barWrapperStyle = useAnimatedStyle(() => {
    const t = visibilityContext?.hiddenProgress.value ?? 0;
    const h = t * t * (3 - 2 * t);
    return { height: CHAT_SUB_TAB_BAR_HEIGHT * (1 - h) };
  }, [visibilityContext]);

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
      <ChromeGlassSheet
        blockH={top}
        barH={CHAT_SUB_TAB_BAR_HEIGHT}
        hiddenProgress={visibilityContext?.hiddenProgress}
        scrolledProgress={visibilityContext?.scrolledProgress}
      />
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            top,
            left: 0,
            right: 0,
            overflow: 'hidden',
            zIndex: 11,
          },
          barWrapperStyle,
        ]}>
        <Animated.View style={[barStyles.container, barVisibilityStyle]} accessibilityRole="tablist">
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
/** A header press parked while ChatHomeContent was absent, with its dock
 * suppressor already held. Owned by ChatHomeScreen — never by a hook
 * instance — so there is exactly one place a parked press can wait. */
export interface ParkedOverlayPress {
  next: ChatHomeOverlay;
  release: () => void;
}

interface ChatHomeContentProps {
  styles: ReturnType<typeof makeScreenStyles>;
  hiddenProgress: SharedValue<number>;
  scrolledProgress: SharedValue<number>;
  /** y where the overlaid sub-tab bar sits (= glass header block height). */
  tabBarTop: number;
  topTabNavRef: React.MutableRefObject<{ navigate: (name: string) => void } | null>;
  /** Receives the content's overlay `open` (header presses go through this). */
  overlayOpenRef: React.MutableRefObject<((next: ChatHomeOverlay) => void) | null>;
  /** Screen-owned parked press, consumed exactly once on mount (see above). */
  parkedRef: React.MutableRefObject<ParkedOverlayPress | null>;
  /** Tells the screen the parked press was adopted (clears the parked flag). */
  onParkedAdopted: () => void;
  onNavigateProfile: (userId: string) => void;
  onNavigateChat: (conversationId: string) => void;
}

const ChatHomeContent: React.FC<ChatHomeContentProps> = React.memo(function ChatHomeContent({
  styles: _styles,
  hiddenProgress,
  scrolledProgress,
  tabBarTop,
  topTabNavRef,
  overlayOpenRef,
  parkedRef,
  onParkedAdopted,
  onNavigateProfile,
  onNavigateChat,
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

  // Single overlay owner (start popup | group form | QR scanner): state machine,
  // hardware Back and tab-dock suppression all live in this hook. It is called
  // HERE, inside the memo boundary, so popup state never re-renders the header.
  // This is the ONLY hook instance on this screen: a header press that landed
  // while this subtree was absent was parked (with its dock suppression
  // already held) in the screen-owned `parkedRef`, and is adopted below into
  // this instance via `adoptParked` — the parked suppressor is transferred,
  // never stacked, and the header never paints an overlay.
  const { overlay, open, close, adoptParked, requestGroupCloseRef } = useChatHomeOverlay();

  // Publish the header trigger AND adopt a parked press in one effect, in this
  // order: the trigger must exist before adoption runs, otherwise a second
  // press landing between the two could park again instead of opening
  // directly. Consuming `parkedRef.current` (ref, not state) makes adoption
  // exactly-once even under StrictMode double-effects: the second setup sees
  // null and does nothing, so there is no double open and no second
  // suppressor. `close` is stable; `adoptParked` transfers the suppressor.
  useEffect(() => {
    overlayOpenRef.current = open;
    const parked = parkedRef.current;
    if (parked !== null) {
      parkedRef.current = null;
      onParkedAdopted();
      adoptParked(parked.next, parked.release);
    }
    return () => {
      overlayOpenRef.current = null;
    };
  }, [open, overlayOpenRef, parkedRef, onParkedAdopted, adoptParked]);

  // onCreated must be stable for GroupCreateModal AND for this memo boundary.
  // It closes over `navigation` and the owner's stable callbacks only, so its
  // identity survives parent re-renders.
  const handleGroupCreated = useCallback((conv: { _id: string }) => {
    close();
    navigation.navigate('Chat', { conversationId: conv._id });
  }, [navigation, close]);

  // The start popup is a two-stage flow: switching stages keeps the suppression
  // held (the hook's open() does not stack suppressors).
  const handleStartGroup = useCallback(() => open('group'), [open]);
  const handleStartNewMessage = useCallback(() => {
    // Clear the overlay first so the destination opens onto a released dock.
    close();
    topTabNavRef.current?.navigate('Contacts');
  }, [close, topTabNavRef]);

  // Assigning through a callback ref re-publishes the guarded close on every
  // render (its identity changes with `creating`); React calls it with null on
  // unmount, which clears it for the owner's Back handler.
  const setGroupCloseRef = useCallback((fn: GroupCloseRequester | null) => {
    requestGroupCloseRef.current = fn;
  }, [requestGroupCloseRef]);

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
        </TopTab.Navigator>
      </ChatSubTabVisibilityContext.Provider>
      {/* Sibling of the navigator, inside the memoized content: the scrim covers
          the list + sub-tab bar but never the header chrome above. */}
      <ChatStartPopup
        visible={overlay === 'start'}
        onClose={close}
        onGroupPress={handleStartGroup}
        onNewMessagePress={handleStartNewMessage}
      />
      <GroupCreateModal
        visible={overlay === 'group'}
        onClose={close}
        onCreated={handleGroupCreated}
        requestCloseRef={setGroupCloseRef}
      />
      <QrScannerModal
        visible={overlay === 'qr'}
        onClose={close}
        onNavigateProfile={onNavigateProfile}
        onNavigateChat={onNavigateChat}
      />
    </>
  );
});

// ─── Screen ──────────────────────────────────────────────────────────────────

const ChatHomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();
  const { tokens, resolvedScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const hiddenProgress = useSharedValue(0);
  const scrolledProgress = useSharedValue(0);
  const topTabNavRef = React.useRef<{ navigate: (name: string) => void } | null>(null);

  // ─── Frosted header block geometry ──────────────────────────────────────────
  const blockH = getChromeBoxHeight(insets.top);
  const tabBarTop = blockH; // Sub-tab bar sits directly below frosted block
  const headerInset = chatHomeContentInset(blockH); // Full chrome inset for scene lists

  const isDark = resolvedScheme === 'dark';

  // The overlay state machine lives inside ChatHomeContent (memo boundary);
  // the header must not open it itself, it just asks the content to. The
  // HEADER PRESS ITSELF is owned here: the content subtree does not exist
  // while the first-mount shell is showing, so a ref populated by the content
  // would silently drop every press in that window (the very first press after
  // mount is the common case). Parking therefore lives in a screen-owned ref
  // (`parkedRef`) — not in any hook instance, of which there is now exactly
  // one (the content's, the sole renderer). `parkPress` acquires the dock
  // suppression synchronously with the press and parks the stage; the content
  // adopts it on mount via its own `adoptParked`, transferring the suppressor.
  // A press while a park is already waiting is dropped — it restates the same
  // request, so a second suppressor must never be acquired.
  const suppressTabDock = useTabDockSuppression();
  const parkedRef = useRef<ParkedOverlayPress | null>(null);
  const [parkedActive, setParkedActive] = useState(false);
  const overlayOpenRef = useRef<((next: ChatHomeOverlay) => void) | null>(null);
  const parkPress = useCallback((next: ChatHomeOverlay) => {
    const openFromContent = overlayOpenRef.current;
    if (openFromContent) {
      openFromContent(next);
      return;
    }
    if (parkedRef.current !== null) return;
    parkedRef.current = { next, release: suppressTabDock() };
    setParkedActive(true);
  }, [suppressTabDock]);
  const handleOpenStart = useCallback(() => parkPress('start'), [parkPress]);
  const handleQrPress = useCallback(() => parkPress('qr'), [parkPress]);
  // Adoption handshake: the content nulled the slot and calls this to drop the
  // parked flag (the Back listener below is then unmounted).
  const handleParkedAdopted = useCallback(() => setParkedActive(false), []);

  // Back + unmount safety net for a parked press: the content subtree (and its
  // overlay owner) does not exist yet, so Back must dismiss the park here —
  // releasing the held suppressor and clearing the slot so a later mount
  // adopts nothing. Cleanup also covers screen unmount with a park still held:
  // the slot is consumed (nulled) so the suppressor can never leak.
  useEffect(() => {
    if (!parkedActive) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const parked = parkedRef.current;
      parkedRef.current = null;
      parked?.release();
      setParkedActive(false);
      return true;
    });
    // JS consumes Back while the park is armed → native skips the card shrink.
    const releaseIntercept = acquireBackIntercept();
    return () => {
      sub.remove();
      releaseIntercept();
      const parked = parkedRef.current;
      parkedRef.current = null;
      parked?.release();
    };
  }, [parkedActive]);

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
        <ChromeHeaderBox
          insetsTop={insets.top}
          isDark={isDark}
          contentReady={contentReady}
          withGlass={false}
          onSearchPress={handleSearchPress}
          hiddenProgress={hiddenProgress}
          rightActions={
            // QR is back as a standalone dock icon next to `+`, as before this
            // change; `+` opens the two-row "Bắt đầu mới" popup.
            <>
              <HeaderDockAction
                icon="qr-code-scanner"
                onPress={handleQrPress}
                accessibilityLabel="Quét mã QR"
                accessibilityHint="Mở quét mã QR"
              />
              <HeaderDockAction
                icon="add"
                onPress={handleOpenStart}
                accessibilityLabel="Tạo trò chuyện mới"
                accessibilityHint="Mở bảng tạo nhóm hoặc nhắn tin mới"
              />
            </>
          }
        />
        {!contentReady ? (
          <ChatHomeShell styles={screenStyles} />
        ) : (
          <ChatHomeContent
            styles={screenStyles}
            hiddenProgress={hiddenProgress}
            scrolledProgress={scrolledProgress}
            tabBarTop={tabBarTop}
            topTabNavRef={topTabNavRef}
            overlayOpenRef={overlayOpenRef}
            parkedRef={parkedRef}
            onParkedAdopted={handleParkedAdopted}
            onNavigateProfile={handleNavigateProfile}
            onNavigateChat={handleNavigateChat}
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
const SHELL_TAB_KEYS = ['t0', 't1', 't2', 't3'];

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
