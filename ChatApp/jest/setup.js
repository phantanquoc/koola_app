/**
 * jest/setup.js
 * Global mocks for native modules that cannot run in Node.
 * Loaded via jest.config.js `setupFiles`.
 */

// ─── react-native-mmkv ────────────────────────────────────────────────────────
jest.mock('react-native-mmkv', () => {
  const store = new Map();
  const MMKV = jest.fn().mockImplementation(() => ({
    set: jest.fn((key, value) => store.set(key, value)),
    getString: jest.fn((key) => {
      const v = store.get(key);
      return typeof v === 'string' ? v : undefined;
    }),
    getNumber: jest.fn((key) => {
      const v = store.get(key);
      return typeof v === 'number' ? v : undefined;
    }),
    getBoolean: jest.fn((key) => {
      const v = store.get(key);
      return typeof v === 'boolean' ? v : undefined;
    }),
    delete: jest.fn((key) => store.delete(key)),
    clearAll: jest.fn(() => store.clear()),
    getAllKeys: jest.fn(() => Array.from(store.keys())),
    contains: jest.fn((key) => store.has(key)),
  }));
  return { MMKV };
});

// ─── react-native-blob-util ───────────────────────────────────────────────────
jest.mock('react-native-blob-util', () => ({
  default: {
    fs: {
      dirs: { DocumentDir: '/mock/documents', CacheDir: '/mock/cache' },
      isDir: jest.fn().mockResolvedValue(false),
      mkdir: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue(''),
      ls: jest.fn().mockResolvedValue([]),
      stat: jest.fn().mockResolvedValue({ size: 0 }),
    },
    config: jest.fn().mockReturnValue({
      fetch: jest.fn().mockResolvedValue({ path: jest.fn().mockReturnValue('/mock/path') }),
    }),
  },
}));

// ─── @react-native-async-storage/async-storage ───────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    default: {
      getItem: jest.fn((key) => Promise.resolve(store.get(key) ?? null)),
      setItem: jest.fn((key, value) => { store.set(key, value); return Promise.resolve(); }),
      removeItem: jest.fn((key) => { store.delete(key); return Promise.resolve(); }),
      clear: jest.fn(() => { store.clear(); return Promise.resolve(); }),
      getAllKeys: jest.fn(() => Promise.resolve(Array.from(store.keys()))),
      multiGet: jest.fn((keys) => Promise.resolve(keys.map((k) => [k, store.get(k) ?? null]))),
      multiSet: jest.fn((pairs) => { pairs.forEach(([k, v]) => store.set(k, v)); return Promise.resolve(); }),
      multiRemove: jest.fn((keys) => { keys.forEach((k) => store.delete(k)); return Promise.resolve(); }),
    },
  };
});

// ─── react-native-gesture-handler ────────────────────────────────────────────
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: View,
    Slider: View,
    Switch: View,
    TextInput: View,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    DrawerLayoutAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: jest.fn((c) => c),
    GestureHandlerRootView: View,
    Directions: {},
    GestureDetector: View,
    Gesture: {
      Tap: jest.fn(() => ({ onEnd: jest.fn().mockReturnThis(), enabled: jest.fn().mockReturnThis() })),
      Pan: jest.fn(() => ({ onUpdate: jest.fn().mockReturnThis(), onEnd: jest.fn().mockReturnThis() })),
      Simultaneous: jest.fn(),
      Exclusive: jest.fn(),
    },
  };
});

// ─── react-native-reanimated ──────────────────────────────────────────────────
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// ─── react-native-safe-area-context ──────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 375, height: 812 }),
}));

// ─── react-native-vector-icons ────────────────────────────────────────────────
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');
jest.mock('react-native-vector-icons/FontAwesome', () => 'FontAwesome');

// ─── @react-native-firebase ───────────────────────────────────────────────────
jest.mock('@react-native-firebase/app', () => ({}));
jest.mock('@react-native-firebase/messaging', () => () => ({
  getToken: jest.fn().mockResolvedValue('mock-fcm-token'),
  requestPermission: jest.fn().mockResolvedValue(1),
  onMessage: jest.fn(),
  setBackgroundMessageHandler: jest.fn(),
}));

// ─── @react-native-community/netinfo ─────────────────────────────────────────
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn().mockResolvedValue({ isConnected: true, type: 'wifi' }),
  useNetInfo: jest.fn(() => ({ isConnected: true, type: 'wifi' })),
}));

// ─── socket.io-client ────────────────────────────────────────────────────────
jest.mock('socket.io-client', () => {
  const EventEmitter = require('events');
  const mockSocket = new EventEmitter();
  mockSocket.connect = jest.fn();
  mockSocket.disconnect = jest.fn();
  mockSocket.emit = jest.fn();
  mockSocket.connected = false;
  return jest.fn(() => mockSocket);
});

// ─── react-native-image-picker ────────────────────────────────────────────────
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn().mockResolvedValue({ didCancel: true }),
  launchCamera: jest.fn().mockResolvedValue({ didCancel: true }),
}));

// ─── react-native-document-picker ─────────────────────────────────────────────
jest.mock('react-native-document-picker', () => ({
  __esModule: true,
  default: { pick: jest.fn().mockResolvedValue([]), isCancel: jest.fn(() => false) },
  pick: jest.fn().mockResolvedValue([]),
  isCancel: jest.fn(() => false),
  types: { allFiles: 'public.item', images: 'public.image', pdf: 'com.adobe.pdf' },
}));

// ─── react-native-compressor ──────────────────────────────────────────────────
jest.mock('react-native-compressor', () => ({
  Video: { compress: jest.fn(async (uri) => uri) },
  Image: { compress: jest.fn(async (uri) => uri) },
  Audio: { compress: jest.fn(async (uri) => uri) },
}));

// ─── @react-native-clipboard/clipboard ────────────────────────────────────────
jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: { setString: jest.fn(), getString: jest.fn().mockResolvedValue('') },
}));
