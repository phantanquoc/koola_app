/**
 * jest/mocks/react-native-incall-manager.js
 *
 * No-op mock for react-native-incall-manager.
 * All methods are jest.fn() so tests can spy/assert on calls like
 * start(), stopRingback(), setForceSpeakerphoneOn() without triggering
 * the real native module (which requires a device audio session).
 */

'use strict';

const InCallManager = {
  start: jest.fn(),
  stop: jest.fn(),
  startRingback: jest.fn(),
  stopRingback: jest.fn(),
  startRingtone: jest.fn(),
  stopRingtone: jest.fn(),
  setForceSpeakerphoneOn: jest.fn(),
  setKeepScreenOn: jest.fn(),
};

module.exports = { default: InCallManager, ...InCallManager };
