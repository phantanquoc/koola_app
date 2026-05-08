import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { PersonalTabStackParamList } from './types';
import SettingsScreen from '../screens/main/SettingsScreen';
import EditProfileScreen from '../screens/main/EditProfileScreen';

const Stack = createNativeStackNavigator<PersonalTabStackParamList>();

const PersonalTabStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="PersonalHome" component={SettingsScreen} />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: true, title: 'Chỉnh sửa hồ sơ' }}
      />
    </Stack.Navigator>
  );
};

export default PersonalTabStack;
