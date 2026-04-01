const DEV_API_URL = 'http://localhost:3000/api';
const DEV_WS_URL = 'http://localhost:3000/chat';
const DEV_WEBRTC_WS_URL = 'http://localhost:3000/webrtc';

const PROD_API_URL = 'https://your-domain.com/api';
const PROD_WS_URL = 'https://your-domain.com/chat';
const PROD_WEBRTC_WS_URL = 'https://your-domain.com/webrtc';

export const API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;
export const WS_URL = __DEV__ ? DEV_WS_URL : PROD_WS_URL;
export const WEBRTC_WS_URL = __DEV__ ? DEV_WEBRTC_WS_URL : PROD_WEBRTC_WS_URL;
