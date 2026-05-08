import React, { useState, useCallback } from 'react';
import { View, StatusBar, TouchableOpacity, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator, MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import type { ChatSubTabParamList, ChatTabStackParamList } from '../../navigation/types';
import KoolaHeader from '../../components/KoolaHeader';
import ConversationListScreen from './ConversationListScreen';
import CallsScreen from './CallsScreen';
import ContactsScreen from './ContactsScreen';
import PlaceholderScreen from '../placeholder/PlaceholderScreen';
import QrScannerModal from './QrScannerModal';
import GroupCreateModal from '../../components/GroupCreateModal';

const TopTab = createMaterialTopTabNavigator<ChatSubTabParamList>();

const VideosPlaceholder = () => <PlaceholderScreen title="Phim" icon="play-circle-outline" />;
const JournalPlaceholder = () => <PlaceholderScreen title="Nhật ký" icon="calendar-today" />;

const SUB_TAB_ICONS: Record<string, string> = {
  Messages: 'chat-bubble-outline',
  Calls: 'phone',
  Contacts: 'people-outline',
  Videos: 'play-circle-outline',
  Journal: 'calendar-today',
};

const CustomTabBar: React.FC<MaterialTopTabBarProps> = ({ state, navigation }) => {
  return (
    <View style={tabBarStyles.container}>
      <View style={tabBarStyles.tabRow}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const iconName = SUB_TAB_ICONS[route.name] || 'circle';
          const color = isFocused ? '#1565C0' : '#9CA3AF';

          return (
            <TouchableOpacity
              key={route.key}
              style={tabBarStyles.tab}
              onPress={() => {
                if (!isFocused) {
                  navigation.navigate(route.name);
                }
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={route.name}>
              <Icon name={iconName} size={24} color={color} />
              {isFocused && <View style={tabBarStyles.indicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const tabBarStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
    backgroundColor: '#FFFFFF',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    minHeight: 48,
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    width: 28,
    height: 3,
    backgroundColor: '#1565C0',
    borderRadius: 2,
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
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
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
        <TopTab.Screen name="Videos" component={VideosPlaceholder} />
        <TopTab.Screen name="Journal" component={JournalPlaceholder} />
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
    backgroundColor: '#fff',
  },
});

export default ChatHomeScreen;
