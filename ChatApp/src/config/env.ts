import Config from 'react-native-config';

let devHost = '10.0.2.2';
let devPort = 3000;

if (__DEV__) {
  // Stripped from prod bundle by Metro constant folding.
  const dev = require('@dev-config') as { DEV_HOST?: string; DEV_PORT?: number };
  if (dev.DEV_HOST) devHost = dev.DEV_HOST;
  if (typeof dev.DEV_PORT === 'number') devPort = dev.DEV_PORT;
}

const apiUrl = __DEV__ ? `http://${devHost}:${devPort}/api` : Config.PROD_API_URL;
const wsUrl = __DEV__ ? `http://${devHost}:${devPort}` : Config.PROD_WS_URL;

if (!apiUrl || (__DEV__ && devHost === 'PLACEHOLDER')) {
  throw new Error(
    [
      'API_URL chưa được cấu hình.',
      'Dev: chạy `npm run dev:sync-host` từ repo root để ghi LAN IP máy dev vào dev-config.json.',
      'Prod: thiếu PROD_API_URL trong ChatApp/.env (xem .env.example).',
    ].join('\n'),
  );
}

const ENV = { API_URL: apiUrl as string, WS_URL: wsUrl as string };
export default ENV;
