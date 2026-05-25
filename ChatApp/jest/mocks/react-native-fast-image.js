/**
 * jest/mocks/react-native-fast-image.js
 * Minimal mock for react-native-fast-image.
 */
const React = require('react');
const { Image } = require('react-native');

const FastImage = (props) => React.createElement(Image, props);
FastImage.resizeMode = { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' };
FastImage.priority = { low: 'low', normal: 'normal', high: 'high' };
FastImage.cacheControl = { immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly' };
FastImage.preload = jest.fn();
FastImage.clearMemoryCache = jest.fn();
FastImage.clearDiskCache = jest.fn();

module.exports = FastImage;
module.exports.default = FastImage;
