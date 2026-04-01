import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ConversationListScreen } from '../screens/main/ConversationListScreen';
import { ChatScreen } from '../screens/main/ChatScreen';
import type { ChatsStackParamList } from './types';

const Stack = createNativeStackNavigator<ChatsStackParamList>();

export const ChatsStack: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ConversationList" component={ConversationListScreen} />
    <Stack.Screen name="Chat" component={ChatScreen} />
  </Stack.Navigator>
);
