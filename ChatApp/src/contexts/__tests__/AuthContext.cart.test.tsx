/**
 * AuthContext ↔ shopping cart wiring (commerce-catalog D11, task 8.2).
 *
 * Renders the REAL AuthProvider with every side-effecting service mocked, and
 * asserts the cart follows the active account:
 *   restore session → cartStore.setAccount(activeId)
 *   switchAccount   → cartStore.setAccount(targetId)  (business cart swaps in)
 *   logout          → cartStore.clearAllAccounts()    (device storage wiped)
 */
import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create, act } from 'react-test-renderer';

const ROOT = 'user-root';
const BIZ = 'biz-1';

jest.mock('../../services/api/apiService', () => ({
  authApi: {
    refresh: jest.fn(() => Promise.resolve({ accessToken: 'at', refreshToken: 'rt' })),
    logout: jest.fn(() => Promise.resolve()),
  },
  usersApi: {
    getMe: jest.fn(() => Promise.resolve({ _id: 'user-root', displayName: 'Root', avatar: '' })),
  },
  accountsApi: {
    list: jest.fn(() =>
      Promise.resolve([
        { _id: 'user-root', displayName: 'Root', accountType: 'personal' },
        { _id: 'biz-1', displayName: 'Biz', accountType: 'business' },
      ]),
    ),
    switch: jest.fn(() => Promise.resolve({ accessToken: 'biz-at' })),
  },
  conversationsApi: { list: jest.fn(() => Promise.resolve({ conversations: [] })) },
  setAccessTokenInMemory: jest.fn(),
  getAccessTokenInMemory: jest.fn(() => 'at'),
  setForceLogoutHandler: jest.fn(),
}));
jest.mock('../../services/storage/asyncStorage', () => ({
  asyncStorage: {
    getRefreshToken: jest.fn(() => Promise.resolve('rt')),
    setRefreshToken: jest.fn(() => Promise.resolve()),
    getActiveAccountId: jest.fn(() => Promise.resolve(null)),
    setActiveAccountId: jest.fn(() => Promise.resolve()),
    clearActiveAccountId: jest.fn(() => Promise.resolve()),
    clearTokens: jest.fn(() => Promise.resolve()),
    clearAll: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../../services/socket/SocketService', () => ({
  socketService: { connect: jest.fn(), disconnect: jest.fn(), isConnected: jest.fn(() => true) },
}));
jest.mock('../../services/webrtc/WebRTCService', () => ({
  webrtcService: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: jest.fn(() => true),
    emitSync: jest.fn(),
    getCallState: jest.fn(() => 'idle'),
  },
}));
jest.mock('../../services/push/pushNotificationService', () => ({
  pushNotificationService: {
    registerToken: jest.fn(() => Promise.resolve()),
    unregisterToken: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../../services/messageCacheService', () => ({ clearAll: jest.fn() }));
jest.mock('../../services/db/dbInit', () => ({
  initDb: jest.fn(() => Promise.resolve()),
  wipeAllData: jest.fn(() => Promise.resolve()),
  shutdownDb: jest.fn(),
}));
jest.mock('../../services/sync/socketEventRouter', () => ({
  wireSocketEvents: jest.fn(() => () => {}),
  setCurrentUserId: jest.fn(),
}));
jest.mock('../../services/sync/syncOrchestrator', () => ({ wireSyncTriggers: jest.fn(() => () => {}) }));
jest.mock('../../services/media/mediaPreloader', () => ({
  wireMediaPreloader: jest.fn(() => () => {}),
  isDataSaverEnabled: jest.fn(() => false),
  setDataSaver: jest.fn(),
}));
jest.mock('../../config/featureFlags', () => ({ isLocalFirstEnabled: () => false }));
jest.mock('../../services/sync/outboxProcessor', () => ({
  pause: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
}));
jest.mock('../../services/db/storageMaintenance', () => ({
  scheduleMaintenance: jest.fn(),
  _resetForTesting: jest.fn(),
}));
jest.mock('../../navigation/RootNavigator', () => ({
  navigationRef: { isReady: () => false, reset: jest.fn() },
}));
jest.mock('../../services/moments/momentsService', () => ({
  momentsService: {
    setCurrentUserId: jest.fn(),
    refreshFeed: jest.fn(() => Promise.resolve()),
    reset: jest.fn(),
  },
}));
jest.mock('../../services/push/accountBadgeStorage', () => ({
  clearAccountBadge: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/db/conversationRepository', () => ({ upsertMany: jest.fn() }));

const mockCart = {
  setAccount: jest.fn(),
  clearAllAccounts: jest.fn(),
};
// Getter: the jest.mock factory is hoisted above `mockCart`'s initialization.
jest.mock('../../services/shopping/cartStore', () => ({
  get cartStore() {
    return mockCart;
  },
}));

import { AuthProvider, useAuth } from '../AuthContext';

type Ctx = ReturnType<typeof useAuth>;

async function flush() {
  // Let the restoreSession promise chain settle.
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('AuthContext cart wiring', () => {
  let ctx: Ctx;
  const Probe = () => {
    ctx = useAuth();
    return null;
  };

  beforeAll(() => {
    // logout() awaits 3 rAF frames for the Fabric settle.
    (global as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: () => void) =>
      setTimeout(cb, 0);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await act(async () => {
      create(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });
    await flush();
  });

  it('scopes the cart to the restored active account', () => {
    expect(ctx.user?._id).toBe(ROOT);
    expect(mockCart.setAccount).toHaveBeenCalledWith(ROOT);
  });

  it('swaps to the business cart on switchAccount', async () => {
    mockCart.setAccount.mockClear();
    await act(async () => {
      await ctx.switchAccount(BIZ);
    });
    expect(mockCart.setAccount).toHaveBeenCalledWith(BIZ);
    expect(mockCart.clearAllAccounts).not.toHaveBeenCalled();
  });

  it('clears every cart on logout', async () => {
    await act(async () => {
      await ctx.logout();
    });
    expect(mockCart.clearAllAccounts).toHaveBeenCalledTimes(1);
  });
});
