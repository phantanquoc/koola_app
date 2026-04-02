// Environment configuration
const ENV = {
  API_URL: __DEV__ ? 'http://10.0.2.2:3000/api' : 'https://api.koola.chat/api',
  WS_URL: __DEV__ ? 'http://10.0.2.2:3000' : 'https://api.koola.chat',
};

export default ENV;
