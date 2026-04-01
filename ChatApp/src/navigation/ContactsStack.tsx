import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ContactsScreen } from '../screens/main/ContactsScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import type { ContactsStackParamList } from './types';

const Stack = createNativeStackNavigator<ContactsStackParamList>();

export const ContactsStack: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Contacts" component={ContactsScreen} />
    <Stack.Screen name="Profile" component={ProfileScreen} />
  </Stack.Navigator>
);
