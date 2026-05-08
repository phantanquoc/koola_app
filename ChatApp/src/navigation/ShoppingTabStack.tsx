import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ShoppingTabStackParamList } from './types';
import PlaceholderScreen from '../screens/placeholder/PlaceholderScreen';

const Stack = createNativeStackNavigator<ShoppingTabStackParamList>();

const ShoppingHome: React.FC = () => (
  <PlaceholderScreen title="Shopping" icon="shopping-bag" />
);

const ShoppingTabStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="ShoppingHome" component={ShoppingHome} />
    </Stack.Navigator>
  );
};

export default ShoppingTabStack;
