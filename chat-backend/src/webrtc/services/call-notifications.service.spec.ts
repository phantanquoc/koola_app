// Mock firebase-admin before any module under test loads it.
jest.mock('../../notifications/fcm-client', () => ({
  getMessaging: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  CallNotificationsService,
  SendIncomingCallPushParams,
} from './call-notifications.service';
import { UsersService } from '../../users/users.service';
import { getMessaging } from '../../notifications/fcm-client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockGetMessaging = getMessaging as jest.MockedFunction<
  typeof getMessaging
>;

function makeParams(
  overrides: Partial<SendIncomingCallPushParams> = {},
): SendIncomingCallPushParams {
  return {
    recipientId: 'user-B',
    sessionId: 'sess-001',
    callerId: 'user-A',
    callerName: 'Alice',
    callerAvatar: 'https://example.com/avatar.jpg',
    callType: 'audio',
    conversationId: 'conv-1',
    expiresAt: 1700000025000,
    ...overrides,
  };
}

function makeUser(tokens: { token: string; platform: string }[]) {
  return { fcmTokens: tokens } as any;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CallNotificationsService', () => {
  let service: CallNotificationsService;
  let mockUsersService: { findById: jest.Mock };
  let mockSendEach: jest.Mock;

  beforeEach(async () => {
    mockUsersService = { findById: jest.fn() };
    mockSendEach = jest.fn();

    mockGetMessaging.mockReturnValue({
      sendEach: mockSendEach,
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallNotificationsService,
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<CallNotificationsService>(CallNotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── 6.2: valid user with 2 tokens ─────────────────────────────────────────

  it('sends to all tokens and returns correct counts when user has 2 tokens', async () => {
    const tokens = [
      { token: 'token-1', platform: 'android' },
      { token: 'token-2', platform: 'ios' },
    ];
    mockUsersService.findById.mockResolvedValue(makeUser(tokens));
    mockSendEach.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [],
    });

    const result = await service.sendIncomingCallPush(makeParams());

    expect(result).toEqual({ success: 2, failure: 0, totalTokens: 2 });
    expect(mockSendEach).toHaveBeenCalledTimes(1);

    // Verify both tokens were included in the messages array
    const messages: any[] = mockSendEach.mock.calls[0][0];
    expect(messages).toHaveLength(2);
    expect(messages[0].token).toBe('token-1');
    expect(messages[1].token).toBe('token-2');
  });

  // ── 6.3: user with zero tokens ────────────────────────────────────────────

  it('returns zero counts and does NOT call messaging SDK when user has no tokens', async () => {
    mockUsersService.findById.mockResolvedValue(makeUser([]));

    const result = await service.sendIncomingCallPush(makeParams());

    expect(result).toEqual({ success: 0, failure: 0, totalTokens: 0 });
    expect(mockSendEach).not.toHaveBeenCalled();
  });

  // ── 6.3 variant: user not found ───────────────────────────────────────────

  it('returns zero counts and does NOT call messaging SDK when user is not found', async () => {
    mockUsersService.findById.mockResolvedValue(null);

    const result = await service.sendIncomingCallPush(makeParams());

    expect(result).toEqual({ success: 0, failure: 0, totalTokens: 0 });
    expect(mockSendEach).not.toHaveBeenCalled();
  });

  // ── 6.4: messaging throws ─────────────────────────────────────────────────

  it('logs error and returns failure counts without throwing when messaging throws', async () => {
    const tokens = [
      { token: 'token-1', platform: 'android' },
      { token: 'token-2', platform: 'android' },
    ];
    mockUsersService.findById.mockResolvedValue(makeUser(tokens));
    mockSendEach.mockRejectedValue(new Error('FCM service unavailable'));

    // Must not throw
    const result = await service.sendIncomingCallPush(makeParams());

    expect(result).toEqual({ success: 0, failure: 2, totalTokens: 2 });
  });

  // ── 6.5: payload shape ────────────────────────────────────────────────────

  it('builds correct data-only payload with all required fields and correct types', async () => {
    const tokens = [{ token: 'token-x', platform: 'android' }];
    mockUsersService.findById.mockResolvedValue(makeUser(tokens));
    mockSendEach.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [],
    });

    const params = makeParams({ expiresAt: 1700000025000 });
    await service.sendIncomingCallPush(params);

    const messages: any[] = mockSendEach.mock.calls[0][0];
    const msg = messages[0];

    // No notification field — data-only
    expect(msg.notification).toBeUndefined();

    // Data fields
    expect(msg.data.type).toBe('incoming_call');
    expect(msg.data.sessionId).toBe('sess-001');
    expect(msg.data.callerId).toBe('user-A');
    expect(msg.data.callerName).toBe('Alice');
    expect(msg.data.callerAvatar).toBe('https://example.com/avatar.jpg');
    expect(msg.data.callType).toBe('audio');
    expect(msg.data.conversationId).toBe('conv-1');
    // expiresAt must be a string (FCM requirement)
    expect(typeof msg.data.expiresAt).toBe('string');
    expect(msg.data.expiresAt).toBe('1700000025000');

    // Android config
    expect(msg.android.priority).toBe('high');
    expect(msg.android.ttl).toBe(20_000); // 20s in ms

    // APNs config
    expect(msg.apns.headers['apns-priority']).toBe('10');
    expect(msg.apns.headers['apns-push-type']).toBe('background');
    expect(msg.apns.payload.aps['content-available']).toBe(1);
  });

  // ── callerAvatar fallback to empty string ─────────────────────────────────

  it('uses empty string for callerAvatar when not provided', async () => {
    const tokens = [{ token: 'token-y', platform: 'android' }];
    mockUsersService.findById.mockResolvedValue(makeUser(tokens));
    mockSendEach.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [],
    });

    await service.sendIncomingCallPush(makeParams({ callerAvatar: undefined }));

    const messages: any[] = mockSendEach.mock.calls[0][0];
    expect(messages[0].data.callerAvatar).toBe('');
  });
});
