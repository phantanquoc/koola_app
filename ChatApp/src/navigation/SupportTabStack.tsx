import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SupportTabStackParamList } from './types';
import ServicesHomeScreen from '../screens/services/ServicesHomeScreen';

const Stack = createNativeStackNavigator<SupportTabStackParamList>();

const SupportTabStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="SupportHome" component={ServicesHomeScreen} />
    </Stack.Navigator>
  );
};

export default SupportTabStack;
