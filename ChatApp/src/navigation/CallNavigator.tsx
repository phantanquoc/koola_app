import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { CallStackParamList } from './types';
import CallScreen from '../screens/main/CallScreen';

const Stack = createNativeStackNavigator<CallStackParamList>();

const CallNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        presentation: 'fullScreenModal',
        animation: 'slide_from_bottom',
      }}>
      <Stack.Screen name="Call" component={CallScreen} />
    </Stack.Navigator>
  );
};

export default CallNavigator;
