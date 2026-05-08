import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ConnectTabStackParamList } from './types';
import ConnectHomeScreen from '../screens/connect/ConnectHomeScreen';
import BusinessProfileScreen from '../screens/connect/BusinessProfileScreen';
import BusinessSearchScreen from '../screens/connect/BusinessSearchScreen';
import CreateBusinessScreen from '../screens/connect/CreateBusinessScreen';

const Stack = createNativeStackNavigator<ConnectTabStackParamList>();

const ConnectTabStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="ConnectHome" component={ConnectHomeScreen} />
      <Stack.Screen
        name="BusinessProfile"
        component={BusinessProfileScreen}
        options={{ headerShown: true, title: 'Hồ sơ doanh nghiệp' }}
      />
      <Stack.Screen
        name="BusinessSearch"
        component={BusinessSearchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateBusiness"
        component={CreateBusinessScreen}
        options={{ headerShown: true, title: 'Đăng ký doanh nghiệp' }}
      />
    </Stack.Navigator>
  );
};

export default ConnectTabStack;
