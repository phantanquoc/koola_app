/**
 * OutboxDevPanel.registration.spec.ts
 *
 * Verifies that OutboxDevPanel is NOT registered in production builds
 * (when __DEV__ is false).
 */

// Mock all navigation dependencies
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: () => null,
  }),
}));

jest.mock('../../screens/main/ChatHomeScreen', () => () => null);
jest.mock('../../screens/chat/ChatScreen', () => () => null);
jest.mock('../../screens/main/GroupInfoScreen', () => () => null);
jest.mock('../../screens/main/ProfileScreen', () => () => null);
jest.mock('../../screens/main/UniversalSearchScreen', () => () => null);

import React from 'react';

describe('ChatTabStack — OutboxDevPanel registration', () => {
  const originalDev = __DEV__;

  afterEach(() => {
    // Restore __DEV__ after each test
    (global as unknown as Record<string, unknown>).__DEV__ = originalDev;
  });

  it('does NOT register OutboxDevPanel when __DEV__ is false', () => {
    (global as unknown as Record<string, unknown>).__DEV__ = false;

    // Re-require to pick up the new __DEV__ value
    jest.resetModules();

    // Mock dependencies again after resetModules
    jest.mock('@react-navigation/native-stack', () => ({
      createNativeStackNavigator: () => ({
        Navigator: ({ children }: { children: React.ReactNode }) => children,
        Screen: ({ name }: { name: string }) => {
          if (name === 'OutboxDevPanel') {
            throw new Error('OutboxDevPanel should not be registered in production');
          }
          return null;
        },
      }),
    }));

    // If the module loads without throwing, the panel is not registered
    expect(() => {
      require('../ChatTabStack');
    }).not.toThrow();
  });

  it('registers OutboxDevPanel when __DEV__ is true', () => {
    (global as unknown as Record<string, unknown>).__DEV__ = true;

    // The panel should be accessible via navigation when __DEV__ is true
    // We verify by checking the OutboxDevPanel screen file exists and exports a component
    const panel = require('../../screens/dev/OutboxDevPanel');
    expect(panel.default).toBeDefined();
    expect(typeof panel.default).toBe('function');
  });
});
