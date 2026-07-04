import React, { useState, useCallback, useEffect } from 'react';
import { View, Pressable, StyleSheet, InteractionManager } from 'react-native';
import { createMaterialTopTabNavigator, MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useNavigation, useIsFocused } from '@react-navigation/native';
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
import QrScannerModal from './QrScannerModal';
import GroupCreateModal from '../../components/GroupCreateModal';
import { KoolaText, koolaColors, koolaRadii } from '../../ui';

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
  Contacts: { iconIdle: 'people-outline', iconActive: 'people', label: 'Danh bạ' },
  Moments: { iconIdle: 'auto-awesome', iconActive: 'auto-awesome', label: 'Khoảnh khắc' },
  Shorts: { iconIdle: 'play-circle-outline', iconActive: 'play-circle-filled', label: 'Video ngắn' },
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
}

const TabItem: React.FC<TabItemProps> = ({ meta, isFocused, unread, onPress }) => {
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

  return (
    <Pressable
      style={tabItemStyles.host}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={{ color: koolaColors.primarySoft, borderless: true, radius: 32 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={meta.label}>
      <Animated.View style={[tabItemStyles.inner, wrapperStyle]}>
        <View style={tabItemStyles.iconSlot}>
          <AnimatedIcon
            name={meta.iconIdle}
            size={22}
            color={koolaColors.muted}
            style={iconIdleStyle}
          />
          <AnimatedIcon
            name={meta.iconActive}
            size={22}
            color={koolaColors.primary}
            style={iconActiveStyle}
          />
          {unread > 0 ? (
            <View style={tabItemStyles.badge}>
              <KoolaText variant="caption" weight="700" style={tabItemStyles.badgeText}>
                {unread > 99 ? '99+' : String(unread)}
              </KoolaText>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
};

const tabItemStyles = StyleSheet.create({
  host: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: {
    width: 26,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: koolaRadii.pill,
    backgroundColor: koolaColors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: koolaColors.surface,
    fontSize: 10,
    lineHeight: 12,
  },
});

// ─── Tab bar ─────────────────────────────────────────────────────────────────
const CustomTabBar: React.FC<MaterialTopTabBarProps> = ({ state, navigation }) => {
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

  return (
    <View style={tabBarStyles.container}>
      <View style={tabBarStyles.row}>
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

const tabBarStyles = StyleSheet.create({
  container: {
    backgroundColor: koolaColors.surface,
    paddingHorizontal: 4,
    paddingTop: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    position: 'relative',
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────
const ChatHomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();
  const isFocused = useIsFocused();
  const [qrVisible, setQrVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [logoReplayKey, setLogoReplayKey] = useState(0);

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
    <View style={styles.container}>
      <KoolaHeader onQrPress={handleQrPress} onSearchPress={handleSearchPress} onAddPress={handleAddPress} logoAnimation="stagger-pop" logoReplayKey={logoReplayKey} />
      <TopTab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          lazy: true,
          swipeEnabled: true,
        }}>
        <TopTab.Screen name="Messages" component={ConversationListScreen} />
        <TopTab.Screen name="Contacts" component={ContactsScreen} />
        <TopTab.Screen name="Moments" component={MomentsScreen} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Slight off-white so the floating tab dock's translucent fill doesn't
    // sit on a pure-white surface (which made the empty bottom strip below
    // the tab labels read as a brighter band). #F8FAFC is one notch cooler
    // than `koolaColors.surface` (#FFFFFF).
    backgroundColor: '#F8FAFC',
  },
});

export default ChatHomeScreen;
