import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../ui';
import { NotchHeader } from '../components/NotchHeader';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';
import type { PersonalTabStackParamList } from './types';
import SettingsScreen from '../screens/main/SettingsScreen';
import EditProfileScreen from '../screens/main/EditProfileScreen';
import StorageSettingsScreen from '../screens/main/StorageSettingsScreen';
import AccountListScreen from '../screens/main/AccountListScreen';
import UpgradeScreen from '../screens/main/UpgradeScreen';
import SettingsDetailScreen from '../screens/main/SettingsDetailScreen';

const Stack = createNativeStackNavigator<PersonalTabStackParamList>();

const PersonalTabStack: React.FC = () => {
  const { resolvedScheme, tokens } = useTheme();
  const isDark = resolvedScheme === 'dark';
  return (
    <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
      {/* Shared chrome — stays fixed across stack pushes so the notch doesn't slide */}
      <LightFieldBackground />
      <NotchHeader style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />

      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          statusBarTranslucent: true,
          navigationBarTranslucent: true,
          statusBarStyle: isDark ? 'light' : 'dark',
          contentStyle: { backgroundColor: 'transparent' } as never,
          // @ts-expect-error cardStyle is valid for native-stack but types lag
          cardStyle: { backgroundColor: 'transparent' },
        }}>
        <Stack.Screen name="PersonalHome" component={SettingsScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="StorageSettings" component={StorageSettingsScreen} />
        <Stack.Screen name="AccountList" component={AccountListScreen} />
        <Stack.Screen name="SettingsDetail" component={SettingsDetailScreen} />
        <Stack.Screen name="UpgradeAccount" component={UpgradeScreen} />
      </Stack.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  host: { flex: 1 },
});

export default PersonalTabStack;
