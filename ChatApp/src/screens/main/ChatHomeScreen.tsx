import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Animated as NativeAnimated, View, Pressable } from 'react-native';
import { createMaterialTopTabNavigator, MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { ChatSubTabParamList, ChatTabStackParamList } from '../../navigation/types';
import KoolaHeader from '../../components/KoolaHeader';
import { ChatSubTabVisibilityContext } from './ChatSubTabVisibilityContext';
import ConversationListScreen from './ConversationListScreen';
import ContactsScreen from './ContactsScreen';
import MomentsScreen from './MomentsScreen';
import ShortsScreen from './ShortsScreen';
import CallsScreen from './CallsScreen';
import QrScannerModal from './QrScannerModal';
import GroupCreateModal from '../../components/GroupCreateModal';
import { KoolaText, koolaRadii, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';

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
  Contacts: { iconIdle: 'people-outline', iconActive: 'people', label: 'Tìm người' },
  Moments: { iconIdle: 'star-outline', iconActive: 'star', label: 'Khoảnh khắc' },
  Calls: { iconIdle: 'phone', iconActive: 'phone-in-talk', label: 'Cuộc gọi' },
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
  const callsUnread = useUnreadCount('Calls');
  const shortsUnread = useUnreadCount('Shorts');

  const unreadByRoute: Record<string, number> = {
    Messages: messagesUnread,
    Contacts: contactsUnread,
    Moments: momentsUnread,
    Calls: callsUnread,
    Shorts: shortsUnread,
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

// ─── Screen ──────────────────────────────────────────────────────────────────
const ChatHomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();
  const route = useRoute<any>();
  const { tokens } = useTheme();
  const [qrVisible, setQrVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const hiddenProgress = useSharedValue(0);
  const topTabNavRef = React.useRef<{ navigate: (name: string) => void } | null>(null);

  // Deterministic Chat entry: when resetToMessages param arrives, navigate the
  // nested TopTab to Messages. This receives the reset from MainNavigator's
  // tabPress handler (both cross-tab navigation and reselect).
  useEffect(() => {
    if (route.params?.resetToMessages && topTabNavRef.current) {
      topTabNavRef.current.navigate('Messages');
      // Clear the param so subsequent focuses don't re-trigger
      navigation.setParams({ resetToMessages: undefined } as any);
    }
  }, [route.params?.resetToMessages, navigation]);

  const screenStyles = useMemo(() => ({
    container: {
      flex: 1,
      backgroundColor: tokens.semantic.bg.canvas,
    },
  }), [tokens.semantic]);

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
    <View style={screenStyles.container}>
      <KoolaHeader onQrPress={handleQrPress} onSearchPress={handleSearchPress} onAddPress={handleAddPress} logoAnimation="none" animatedDockBorder />
      <ChatSubTabVisibilityContext.Provider value={{ hiddenProgress }}>
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
          <TopTab.Screen name="Calls" component={CallsScreen} />
          <TopTab.Screen name="Shorts" component={ShortsScreen} />
        </TopTab.Navigator>
      </ChatSubTabVisibilityContext.Provider>
      <QrScannerModal
        visible={qrVisible}
        onClose={handleQrClose}
        onNavigateProfile={handleNavigateProfile}
        onNavigateChat={handleNavigateChat}
      />
      <GroupCreateModal
        visible={groupModalVisible}
        onClose={() => setGroupModalVisible(false)}
        onCreated={(conv) => {
          setGroupModalVisible(false);
          navigation.navigate('Chat', { conversationId: conv._id });
        }}
      />
    </View>
  );
};

export default ChatHomeScreen;
