/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  // Transform everything except node_modules that are already CJS
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-gifted-chat|react-native-mmkv|react-native-blob-util|react-native-fast-image|react-native-gesture-handler|react-native-reanimated|@react-native-async-storage|react-native-vector-icons|react-native-safe-area-context|react-native-screens|react-native-toast-message|react-native-keyboard-controller|react-native-pager-view|nativewind|react-native-svg|react-native-blurhash|react-native-compressor|react-native-document-picker|react-native-image-picker|react-native-permissions|react-native-qrcode-svg|react-native-video|react-native-vision-camera|react-native-webrtc|react-native-incall-manager|@react-native-community|@react-native-firebase|@react-navigation)/)',
  ],
  setupFiles: [
    './jest/setup.js',
  ],
  moduleNameMapper: {
    // op-sqlite: use in-memory mock so repository tests run on Node
    '@op-engineering/op-sqlite': '<rootDir>/jest/mocks/op-sqlite.js',
    // react-native-fast-image: simple mock
    'react-native-fast-image': '<rootDir>/jest/mocks/react-native-fast-image.js',
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  collectCoverageFrom: [
    'src/services/db/**/*.ts',
    'src/services/sync/**/*.ts',
    '!src/**/*.d.ts',
  ],
};
