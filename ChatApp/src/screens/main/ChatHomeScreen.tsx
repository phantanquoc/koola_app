import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Pressable, InteractionManager } from 'react-native';
import { createMaterialTopTabNavigator, MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useNavigation, useIsFocused, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { ChatSubTabParamList, ChatTabStackParamList } from '../../navigation/types';
import KoolaHeader from '../../components/KoolaHeader';
import ConversationListScreen from './ConversationListScreen';
import ContactsScreen from './ContactsScreen';
import MomentsScreen from './MomentsScreen';
import ShortsScreen from './ShortsScreen';
import CallsScreen from './CallsScreen';
import QrScannerModal from './QrScannerModal';
import GroupCreateModal from '../../components/GroupCreateModal';
import { KoolaText, koolaRadii, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';

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
  Messages: { iconIdle: 'chat-bubble-outline', iconActive: 'chat-bubble', label: 'Tin nhắn' },
  Contacts: { iconIdle: 'people-outline', iconActive: 'people', label: 'Tìm người' },
  Moments: { iconIdle: 'auto-awesome', iconActive: 'auto-awesome', label: 'Khoảnh khắc' },
  Calls: { iconIdle: 'call', iconActive: 'call', label: 'Cuộc gọi' },
  Shorts: { iconIdle: 'play-circle-outline', iconActive: 'play-circle-filled', label: 'Xem trước' },
};

// Hook for unread counts. Returns 0 for now — wire to store/api when available.
function useUnreadCount(_routeName: keyof ChatSubTabParamList): number {
  return 0;
}

const AnimatedIcon = Animated.createAnimatedComponent(Icon);

// ─── Tab item ────────────────────────────────────────────────────────────────
interface TabItemProps {
  meta: TabMeta;
  isFocused: boolean;
  unread: number;
  onPress: () => void;
  palette: Palette;
}

const TabItem: React.FC<TabItemProps> = ({ meta, isFocused, unread, onPress, palette }) => {
  const focus = useSharedValue(isFocused ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    focus.value = withTiming(isFocused ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [isFocused, focus]);

  const handlePressIn = useCallback(() => {
    press.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
  }, [press]);

  const handlePressOut = useCallback(() => {
    press.value = withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) });
  }, [press]);

  const wrapperStyle = useAnimatedStyle(() => {
    const f = focus.value;
    const p = press.value;
    return {
      transform: [{ scale: (1 + 0.04 * f) * (1 - 0.05 * p) }],
      opacity: 1 - 0.12 * p,
    };
  });

  const iconIdleStyle = useAnimatedStyle(() => ({
    opacity: 1 - focus.value,
    position: 'absolute',
  }));

  const iconActiveStyle = useAnimatedStyle(() => ({
    opacity: focus.value,
  }));

  // Active pill background — animates in/out with focus
  const pillStyle = useAnimatedStyle(() => ({
    opacity: focus.value,
    transform: [{ scale: 0.85 + 0.15 * focus.value }],
  }));

  return (
    <Pressable
      style={tabItemStyles.host}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={{ color: palette.primarySoft, borderless: true, radius: 32 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={meta.label}>
      <Animated.View style={[tabItemStyles.inner, wrapperStyle]}>
        {/* Active indicator pill behind icon */}
        <Animated.View
          style={[
            tabItemStyles.pill,
            { backgroundColor: palette.primarySoft },
            pillStyle,
          ]}
        />
        <View style={tabItemStyles.iconSlot}>
          <AnimatedIcon
            name={meta.iconIdle}
            size={20}
            color={palette.muted}
            style={iconIdleStyle}
          />
          <AnimatedIcon
            name={meta.iconActive}
            size={20}
            color={palette.primary}
            style={iconActiveStyle}
          />
          {unread > 0 ? (
            <View style={[tabItemStyles.badge, { backgroundColor: palette.danger }]}>
              <KoolaText variant="caption" weight="700" style={[tabItemStyles.badgeText, { color: palette.surface }]}>
                {unread > 99 ? '99+' : String(unread)}
              </KoolaText>
            </View>
          ) : null}
        </View>
        <KoolaText
          variant="caption"
          weight={isFocused ? '700' : '500'}
          numberOfLines={1}
          style={[
            tabItemStyles.label,
            { color: isFocused ? palette.primary : palette.muted },
          ]}>
          {meta.label}
        </KoolaText>
      </Animated.View>
    </Pressable>
  );
};

const tabItemStyles = {
  host: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 44,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  inner: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pill: {
    position: 'absolute' as const,
    width: 40,
    height: 32,
    borderRadius: koolaRadii.sm,
  },
  iconSlot: {
    width: 24,
    height: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  label: {
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center' as const,
    maxWidth: 60,
    marginTop: 2,
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
const CustomTabBar: React.FC<MaterialTopTabBarProps> = ({ state, navigation }) => {
  const { palette } = useTheme();
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
      backgroundColor: palette.surface,
      paddingHorizontal: 4,
      paddingTop: 0,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'stretch' as const,
      justifyContent: 'space-between' as const,
      position: 'relative' as const,
    },
  }), [palette]);

  return (
    <View style={barStyles.container} accessibilityRole="tablist">
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
              unread={unreadByRoute[route.name] ?? 0}
              palette={palette}
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
    </View>
  );
};

// ─── Screen ──────────────────────────────────────────────────────────────────
const ChatHomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();
  const route = useRoute<any>();
  const isFocused = useIsFocused();
  const { palette } = useTheme();
  const [qrVisible, setQrVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [logoReplayKey, setLogoReplayKey] = useState(0);
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
      backgroundColor: palette.canvas,
    },
  }), [palette]);

  useEffect(() => {
    if (!isFocused) return;
    const task = InteractionManager.runAfterInteractions(() => {
      setLogoReplayKey((k) => k + 1);
    });
    return () => task.cancel();
  }, [isFocused]);

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
      <KoolaHeader onQrPress={handleQrPress} onSearchPress={handleSearchPress} onAddPress={handleAddPress} logoAnimation="stagger-pop" logoReplayKey={logoReplayKey} />
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
