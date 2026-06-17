// Mock for react-native-config in Jest
// Returns empty strings for all keys so tests don't fail on missing native module.
// PROD_* URLs get safe placeholder values so modules that read them at load time
// (e.g. src/config/env.ts when __DEV__ is false) don't throw.
// Override specific keys in individual tests via jest.mock or module factory.
const overrides = {
  PROD_API_URL: 'https://test.invalid/api',
  PROD_WS_URL: 'https://test.invalid',
};

module.exports = {
  __esModule: true,
  default: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        if (prop in overrides) return overrides[prop];
        return '';
      },
    },
  ),
};
