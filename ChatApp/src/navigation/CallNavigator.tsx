import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CallScreen } from '../screens/main/CallScreen';
import type { CallStackParamList } from './types';

const Stack = createNativeStackNavigator<CallStackParamList>();

export const CallNavigator: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen
      name="Call"
      component={CallScreen}
      options={{
        presentation: 'modal',
        animation: 'slide_from_bottom',
      }}
    />
  </Stack.Navigator>
);
