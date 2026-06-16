// Mock for react-native-config in Jest
// Returns empty strings for all keys so tests don't fail on missing native module.
// Override specific keys in individual tests via jest.mock or module factory.
module.exports = {
  default: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        return '';
      },
    },
  ),
};
