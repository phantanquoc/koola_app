const path = require('path');
const fs = require('fs');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {withNativeWind} = require('nativewind/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = mergeConfig(getDefaultConfig(__dirname), {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === '@dev-config') {
        if (process.env.NODE_ENV === 'production') {
          return {
            type: 'sourceFile',
            filePath: path.resolve(__dirname, 'dev-config.prod-stub.json'),
          };
        }
        const local = path.resolve(__dirname, 'dev-config.json');
        if (fs.existsSync(local)) {
          return {type: 'sourceFile', filePath: local};
        }
        return {
          type: 'sourceFile',
          filePath: path.resolve(__dirname, 'dev-config.example.json'),
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
});

module.exports = withNativeWind(config, {input: './global.css'});
