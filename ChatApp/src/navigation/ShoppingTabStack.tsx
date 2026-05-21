import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ShoppingTabStackParamList } from './types';
import ShoppingHomeScreen from '../screens/shopping/ShoppingHomeScreen';

const Stack = createNativeStackNavigator<ShoppingTabStackParamList>();

const ShoppingTabStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="ShoppingHome" component={ShoppingHomeScreen} />
    </Stack.Navigator>
  );
};

export default ShoppingTabStack;
