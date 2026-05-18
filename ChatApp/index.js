import { AppRegistry } from 'react-native';
import App from './src/App';
import { registerFcmCallBackgroundHandler } from './src/services/push/fcmCallHandler';

// Must run before registerComponent so RN headless JS picks up
// FCM data messages while the app is in background or killed state.
registerFcmCallBackgroundHandler();

AppRegistry.registerComponent('ChatApp', () => App);
