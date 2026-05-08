import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ChatTabStackParamList } from './types';
import ChatHomeScreen from '../screens/main/ChatHomeScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import GroupInfoScreen from '../screens/main/GroupInfoScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import UniversalSearchScreen from '../screens/main/UniversalSearchScreen';

const Stack = createNativeStackNavigator<ChatTabStackParamList>();

const ChatTabStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="ChatHome" component={ChatHomeScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen
        name="GroupInfo"
        component={GroupInfoScreen}
        options={{ headerShown: true, title: 'Thông tin nhóm' }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: true, title: 'Hồ sơ' }}
      />
      <Stack.Screen
        name="UniversalSearch"
        component={UniversalSearchScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

export default ChatTabStack;
