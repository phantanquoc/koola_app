import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SupportTabStackParamList } from './types';
import PlaceholderScreen from '../screens/placeholder/PlaceholderScreen';

const Stack = createNativeStackNavigator<SupportTabStackParamList>();

const SupportHome: React.FC = () => (
  <PlaceholderScreen title="Hỗ trợ" icon="support-agent" />
);

const SupportTabStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="SupportHome" component={SupportHome} />
    </Stack.Navigator>
  );
};

export default SupportTabStack;
