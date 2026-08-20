// Mock uuid before any module loads it (pure-ESM in v13+)
jest.mock('uuid', () => ({ v4: () => 'test-session-id' }));

import { Test, TestingModule } from '@nestjs/testing';
import { WebrtcGateway } from './webrtc.gateway';
import { CallSessionService } from './services/call-session.service';
import { TurnService } from './services/turn.service';
import { CallNotificationsService } from './services/call-notifications.service';
import { UsersService } from '../users/users.service';
import { MembershipService } from '../conversations/services/membership.service';
import { JwtService } from '@nestjs/jwt';
import { WsAuthGuard } from '../gateway/guards/ws-auth.guard';
import { CallType } from './dto/call-initiate.dto';
import { CallLogsService } from '../call-logs/call-logs.service';
import { RedisService } from '../common/redis/redis.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type MockSocket = {
  id: string;
  data: { user: { sub: string; phone: string } };
  emit: jest.Mock;
  join: jest.Mock;
};

function makeAuthSocket(
  userId: string,
  socketId = 'socket-caller',
): MockSocket {
  return {
    id: socketId,
    data: { user: { sub: userId, phone: '+1234567890' } },
    emit: jest.fn(),
    join: jest.fn(),
  };
}

type MockUser = {
  _id: string;
  displayName: string;
  fcmTokens: { token: string; platform: string }[];
  avatar: string | undefined;
};

function makeUser(
  id: string,
  tokens: { token: string; platform: string }[] = [],
  displayName = 'Test User',
): MockUser {
  return {
    _id: id,
    displayName,
    fcmTokens: tokens,
    avatar: undefined,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('WebrtcGateway — offline-push branch', () => {
  let gateway: WebrtcGateway;
  let mockIo: { in: jest.Mock; to: jest.Mock };
  let mockCallSessionService: jest.Mocked<Partial<CallSessionService>>;
  let mockCallNotificationsService: jest.Mocked<
    Partial<CallNotificationsService>
  >;
  let mockUsersService: jest.Mocked<Partial<UsersService>>;
  let mockMembershipService: jest.Mocked<Partial<MembershipService>>;

  const SESSION_ID = 'test-session-id';
  const CALLER_ID = 'user-A';
  const CALLEE_ID = 'user-B';
  const CONV_ID = 'conv-1';

  beforeEach(async () => {
    jest.useFakeTimers();

    // Session service — returns a created session and supports state ops
    mockCallSessionService = {
      hasExistingSession: jest.fn().mockResolvedValue(null),
      getActiveSessionIds: jest.fn().mockResolvedValue([]),
      isActive: jest.fn().mockResolvedValue(false),
      createSession: jest.fn().mockResolvedValue({
        sessionId: SESSION_ID,
        initiatorId: CALLER_ID,
        targetUserId: CALLEE_ID,
        conversationId: CONV_ID,
        callType: CallType.AUDIO,
        state: 'initiated',
        createdAt: new Date().toISOString(),
        participantCount: 1,
      }),
      endSession: jest.fn().mockResolvedValue(undefined),
      getSession: jest.fn().mockResolvedValue({
        sessionId: SESSION_ID,
        initiatorId: CALLER_ID,
        targetUserId: CALLEE_ID,
        state: 'initiated',
      }),
      markPushSent: jest.fn().mockResolvedValue(undefined),
      updateSessionState: jest.fn().mockResolvedValue(undefined),
      updateDeadlineAt: jest.fn().mockResolvedValue(undefined),
      setPendingCall: jest.fn().mockResolvedValue(undefined),
      getPendingCall: jest.fn().mockResolvedValue(null),
      delPendingCall: jest.fn().mockResolvedValue(undefined),
      delPendingCallIfMatches: jest.fn().mockResolvedValue(undefined),
    };

    mockCallNotificationsService = {
      sendIncomingCallPush: jest.fn().mockResolvedValue({
        success: 1,
        failure: 0,
        totalTokens: 1,
      }),
    };

    mockMembershipService = {
      isMember: jest.fn().mockResolvedValue(true),
    };

    // Default: caller has no tokens, callee has one token
    mockUsersService = {
      findById: jest.fn().mockImplementation((id: string) => {
        if (id === CALLER_ID)
          return Promise.resolve(makeUser(CALLER_ID, [], 'Alice'));
        if (id === CALLEE_ID)
          return Promise.resolve(
            makeUser(
              CALLEE_ID,
              [{ token: 'fcm-token-1', platform: 'android' }],
              'Bob',
            ),
          );
        return Promise.resolve(null);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebrtcGateway,
        { provide: CallSessionService, useValue: mockCallSessionService },
        {
          provide: TurnService,
          useValue: { getIceServers: jest.fn().mockReturnValue([]) },
        },
        {
          provide: CallNotificationsService,
          useValue: mockCallNotificationsService,
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: MembershipService, useValue: mockMembershipService },
        { provide: JwtService, useValue: { verify: jest.fn() } },
        {
          provide: WsAuthGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: CallLogsService,
          useValue: {
            findBySessionId: jest.fn().mockResolvedValue(null),
            updateLog: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RedisService,
          useValue: {
            incrementWithExpiry: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    gateway = module.get<WebrtcGateway>(WebrtcGateway);

    // Mock socket.io server
    const mockToChain = { emit: jest.fn() };
    mockIo = {
      in: jest.fn().mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([]), // callee offline by default
      }),
      to: jest.fn().mockReturnValue(mockToChain),
    };
    (gateway as unknown as { io: typeof mockIo }).io = mockIo;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── 7.3: offline callee with tokens ──────────────────────────────────────

  it('emits call_initiated to caller, calls push service, marks pushSentAt, and sets deadline + pending_call', async () => {
    const callerSocket = makeAuthSocket(CALLER_ID);

    await gateway.handleCallInitiate(
      {
        targetUserId: CALLEE_ID,
        conversationId: CONV_ID,
        callType: CallType.AUDIO,
      },
      callerSocket as unknown as Parameters<
        typeof gateway.handleCallInitiate
      >[1],
    );

    // call_initiated emitted to caller
    expect(
      (callerSocket as unknown as { emit: jest.Mock }).emit,
    ).toHaveBeenCalledWith(
      'call_initiated',
      expect.objectContaining({ sessionId: SESSION_ID }),
    );

    // Push service called once
    expect(
      mockCallNotificationsService.sendIncomingCallPush,
    ).toHaveBeenCalledTimes(1);
    expect(
      mockCallNotificationsService.sendIncomingCallPush,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: CALLEE_ID,
        sessionId: SESSION_ID,
        callerId: CALLER_ID,
        callType: 'audio',
        conversationId: CONV_ID,
      }),
    );

    // pushSentAt marked in Redis
    expect(mockCallSessionService.markPushSent).toHaveBeenCalledWith(
      SESSION_ID,
    );

    // Deadline + pending_call set (replaces grace timer)
    expect(mockCallSessionService.updateDeadlineAt).toHaveBeenCalledWith(
      SESSION_ID,
      expect.any(Number),
    );
    expect(mockCallSessionService.setPendingCall).toHaveBeenCalledWith(
      CALLEE_ID,
      expect.objectContaining({ sessionId: SESSION_ID }),
      expect.any(Number),
    );

    // Session NOT ended yet
    expect(mockCallSessionService.endSession).not.toHaveBeenCalled();
  });

  // ── 7.4: offline callee with no tokens ───────────────────────────────────

  it('emits call_missed immediately and does NOT call push service or start timer when callee has no tokens', async () => {
    // Override callee to have no tokens
    mockUsersService.findById = jest.fn().mockImplementation((id: string) => {
      if (id === CALLER_ID)
        return Promise.resolve(makeUser(CALLER_ID, [], 'Alice'));
      if (id === CALLEE_ID)
        return Promise.resolve(makeUser(CALLEE_ID, [], 'Bob'));
      return Promise.resolve(null);
    });

    const callerSocket = makeAuthSocket(CALLER_ID);

    await gateway.handleCallInitiate(
      {
        targetUserId: CALLEE_ID,
        conversationId: CONV_ID,
        callType: CallType.AUDIO,
      },
      callerSocket as unknown as Parameters<
        typeof gateway.handleCallInitiate
      >[1],
    );

    // call_missed emitted with 'User unreachable'
    expect(
      (callerSocket as unknown as { emit: jest.Mock }).emit,
    ).toHaveBeenCalledWith(
      'call_missed',
      expect.objectContaining({ reason: 'User unreachable' }),
    );

    // Push service NOT called
    expect(
      mockCallNotificationsService.sendIncomingCallPush,
    ).not.toHaveBeenCalled();

    // No pending timer — session already marked missed (single-host deadline path)
    expect(mockCallSessionService.updateSessionState).toHaveBeenCalledWith(
      SESSION_ID,
      'missed',
    );
  });

  // ── 7.5: offline push sets deadline+pending (cron will fire missed later) ──

  it('sets deadline ~25s and pending_call; does NOT auto-end session (cron owns timeout)', async () => {
    const callerSocket = makeAuthSocket(CALLER_ID);

    await gateway.handleCallInitiate(
      {
        targetUserId: CALLEE_ID,
        conversationId: CONV_ID,
        callType: CallType.AUDIO,
      },
      callerSocket as unknown as Parameters<
        typeof gateway.handleCallInitiate
      >[1],
    );

    // deadline + pending_call set (cron is single source for timeout)
    expect(mockCallSessionService.updateDeadlineAt).toHaveBeenCalledWith(
      SESSION_ID,
      expect.any(Number),
    );
    expect(mockCallSessionService.setPendingCall).toHaveBeenCalledTimes(1);

    // Gate: deadline is ~25s from now (OFFLINE_PUSH_GRACE_MS)
    const deadlineCalls = (mockCallSessionService.updateDeadlineAt as jest.Mock)
      .mock.calls as Array<[string, number]>;
    const deadlineArg = deadlineCalls[0][1];
    const delta = deadlineArg - Date.now();
    expect(delta).toBeGreaterThan(20_000);
    expect(delta).toBeLessThan(30_000);

    // Session NOT ended synchronously — cron will emit call_missed later
    expect(mockCallSessionService.endSession).not.toHaveBeenCalled();
  });

  // ── 7.6: caller cancels during pending window → pending_call cleaned ─────

  it('cleans pending_call and emits call_cancelled when caller cancels after offline push', async () => {
    const callerSocket = makeAuthSocket(CALLER_ID);

    // Start the offline-push flow
    await gateway.handleCallInitiate(
      {
        targetUserId: CALLEE_ID,
        conversationId: CONV_ID,
        callType: CallType.AUDIO,
      },
      callerSocket as unknown as Parameters<
        typeof gateway.handleCallInitiate
      >[1],
    );

    // Deadline + pending_call was set
    expect(mockCallSessionService.setPendingCall).toHaveBeenCalledTimes(1);

    // Caller cancels
    await gateway.handleCallCancel(
      { sessionId: SESSION_ID },
      callerSocket as unknown as Parameters<typeof gateway.handleCallCancel>[1],
    );

    // pending_call cleaned (guarded by sessionId)
    expect(mockCallSessionService.delPendingCallIfMatches).toHaveBeenCalledWith(
      CALLEE_ID,
      SESSION_ID,
    );

    // Session ended
    expect(mockCallSessionService.endSession).toHaveBeenCalledWith(SESSION_ID);

    // call_cancelled emitted to callee
    expect(mockIo.to).toHaveBeenCalledWith(`user:${CALLEE_ID}`);
  });
});
