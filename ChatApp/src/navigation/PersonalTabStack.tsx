import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../ui';
import type { PersonalTabStackParamList } from './types';
import SettingsScreen from '../screens/main/SettingsScreen';
import EditProfileScreen from '../screens/main/EditProfileScreen';
import StorageSettingsScreen from '../screens/main/StorageSettingsScreen';
import AccountListScreen from '../screens/main/AccountListScreen';

const Stack = createNativeStackNavigator<PersonalTabStackParamList>();

const PersonalTabStack: React.FC = () => {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        statusBarStyle: isDark ? 'light' : 'dark',
      }}>
      <Stack.Screen name="PersonalHome" component={SettingsScreen} />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
      />
      <Stack.Screen name="StorageSettings" component={StorageSettingsScreen} />
      <Stack.Screen name="AccountList" component={AccountListScreen} />
    </Stack.Navigator>
  );
};

export default PersonalTabStack;
