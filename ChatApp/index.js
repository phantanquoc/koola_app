/**
 * @format
 */

import {AppRegistry} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import {name as appName} from './app.json';

// Background / quit-state message handler — must be registered before AppRegistry
messaging().setBackgroundMessageHandler(async (_remoteMessage) => {
  // Firebase automatically shows the notification from the `notification` payload.
  // No custom logic needed here for MVP — the OS handles display.
});

AppRegistry.registerComponent(appName, () => App);
