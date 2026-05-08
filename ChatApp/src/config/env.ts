// Environment configuration
// Dev URLs use localhost because `adb reverse tcp:3000 tcp:3000` is set up on
// both emulator and physical devices — localhost on the device tunnels back
// to the host machine's port 3000.
const ENV = {
  API_URL: __DEV__ ? 'http://localhost:3000/api' : 'https://api.koola.chat/api',
  WS_URL: __DEV__ ? 'http://localhost:3000' : 'https://api.koola.chat',
};

export default ENV;
