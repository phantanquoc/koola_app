import { Platform } from 'react-native';

// Environment configuration
// Android emulator uses 10.0.2.2 (Google's alias for host loopback).
// iOS simulator and physical devices use localhost (with adb reverse for physical Android).
const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

const ENV = {
  API_URL: __DEV__ ? `http://${DEV_HOST}:3000/api` : 'https://api.koola.chat/api',
  WS_URL: __DEV__ ? `http://${DEV_HOST}:3000` : 'https://api.koola.chat',
};

export default ENV;
