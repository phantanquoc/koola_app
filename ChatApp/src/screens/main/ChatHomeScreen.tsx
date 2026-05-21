import React, { useState, useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator, MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import type { ChatSubTabParamList, ChatTabStackParamList } from '../../navigation/types';
import KoolaHeader from '../../components/KoolaHeader';
import ConversationListScreen from './ConversationListScreen';
import CallsScreen from './CallsScreen';
import ContactsScreen from './ContactsScreen';
import QrScannerModal from './QrScannerModal';
import GroupCreateModal from '../../components/GroupCreateModal';
import { KoolaText, koolaColors, koolaRadii } from '../../ui';

const TopTab = createMaterialTopTabNavigator<ChatSubTabParamList>();

const SUB_TAB_META: Record<string, { icon: string; label: string }> = {
  Messages: { icon: 'chat-bubble-outline', label: 'Tin nhắn' },
  Calls: { icon: 'phone', label: 'Cuộc gọi' },
  Contacts: { icon: 'people-outline', label: 'Danh bạ' },
};

const CustomTabBar: React.FC<MaterialTopTabBarProps> = ({ state, navigation }) => {
  return (
    <View style={tabBarStyles.container}>
      <View style={tabBarStyles.tabRow}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const meta = SUB_TAB_META[route.name];
          if (!meta) return null;
          const color = isFocused ? koolaColors.primary : koolaColors.muted;

          return (
            <Pressable
              key={route.key}
              style={tabBarStyles.tab}
              onPress={() => {
                if (!isFocused) {
                  navigation.navigate(route.name);
                }
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={meta.label}>
              <View style={[tabBarStyles.iconWrap, isFocused && tabBarStyles.iconWrapActive]}>
                <Icon name={meta.icon} size={20} color={color} />
              </View>
              <KoolaText
                variant="caption"
                weight={isFocused ? '700' : '600'}
                tone={isFocused ? 'primary' : 'muted'}>
                {meta.label}
              </KoolaText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const tabBarStyles = StyleSheet.create({
  container: {
    backgroundColor: koolaColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    minHeight: 48,
    gap: 2,
  },
  iconWrap: {
    width: 44,
    height: 28,
    borderRadius: koolaRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: koolaColors.primarySoft,
  },
});

const ChatHomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();
  const [qrVisible, setQrVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);

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
      <KoolaHeader onQrPress={handleQrPress} onSearchPress={handleSearchPress} onAddPress={handleAddPress} />
      <TopTab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          lazy: true,
          swipeEnabled: true,
        }}>
        <TopTab.Screen name="Messages" component={ConversationListScreen} />
        <TopTab.Screen name="Calls" component={CallsScreen} />
        <TopTab.Screen name="Contacts" component={ContactsScreen} />
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
    backgroundColor: koolaColors.surface,
  },
});

export default ChatHomeScreen;
