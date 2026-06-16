/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
  email?: string;
  fcmTokens: { token: string; platform: string }[];
  avatar: string | undefined;
};

function makeUser(
  id: string,
  tokens: { token: string; platform: string }[] = [],
  displayName = 'Test User',
): MockUser {
  return { _id: id, displayName, fcmTokens: tokens, avatar: undefined };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('WebrtcGateway — call log lifecycle', () => {
  let gateway: WebrtcGateway;
  let mockIo: {
    in: jest.Mock;
    to: jest.Mock;
  };
  let mockCallSessionService: jest.Mocked<Partial<CallSessionService>>;
  let mockCallLogsService: jest.Mocked<Partial<CallLogsService>>;
  let mockCallNotificationsService: jest.Mocked<
    Partial<CallNotificationsService>
  >;
  let mockUsersService: jest.Mocked<Partial<UsersService>>;
  let mockMembershipService: jest.Mocked<Partial<MembershipService>>;

  const SESSION_ID = 'test-session-id';
  const CALLER_ID = 'user-A';
  const CALLEE_ID = 'user-B';
  const CONV_ID = 'conv-1';

  // Reusable mock session
  const mockSession = {
    sessionId: SESSION_ID,
    initiatorId: CALLER_ID,
    targetUserId: CALLEE_ID,
    conversationId: CONV_ID,
    callType: CallType.AUDIO,
    state: 'initiated' as const,
    createdAt: new Date().toISOString(),
    participantCount: 1,
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    mockCallSessionService = {
      hasExistingSession: jest.fn().mockResolvedValue(null),
      getActiveSessionIds: jest.fn().mockResolvedValue([]),
      isActive: jest.fn().mockResolvedValue(false),
      createSession: jest.fn().mockResolvedValue(mockSession),
      endSession: jest.fn().mockResolvedValue(undefined),
      getSession: jest.fn().mockResolvedValue(mockSession),
      markPushSent: jest.fn().mockResolvedValue(undefined),
      updateSessionState: jest.fn().mockResolvedValue(undefined),
      getParticipants: jest.fn().mockResolvedValue([CALLER_ID, CALLEE_ID]),
      addParticipant: jest.fn().mockResolvedValue(true),
    };

    mockCallLogsService = {
      createLog: jest.fn().mockResolvedValue({ sessionId: SESSION_ID }),
      updateLog: jest.fn().mockResolvedValue(undefined),
      findBySessionId: jest.fn().mockResolvedValue(null),
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

    // Default: caller online, callee online with tokens
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
        { provide: CallLogsService, useValue: mockCallLogsService },
        {
          provide: RedisService,
          useValue: { incrementWithExpiry: jest.fn().mockResolvedValue(1) },
        },
      ],
    }).compile();

    gateway = module.get<WebrtcGateway>(WebrtcGateway);

    // Mock socket.io server — callee online by default
    const mockToChain = { emit: jest.fn() };
    const mockExceptChain = { emit: jest.fn() };
    const mockInChain = {
      fetchSockets: jest.fn().mockResolvedValue([{ id: 'callee-socket' }]),
      except: jest.fn().mockReturnValue(mockExceptChain),
    };
    mockIo = {
      in: jest.fn().mockReturnValue(mockInChain),
      to: jest.fn().mockReturnValue(mockToChain),
    };
    (gateway as unknown as { io: typeof mockIo }).io = mockIo;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── 6.2: online branch → createLog called once with status='missed' ────────

  it('handleCallInitiate (online) → createLog called once with status=missed after session creation', async () => {
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

    expect(mockCallLogsService.createLog).toHaveBeenCalledTimes(1);
    expect(mockCallLogsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        initiatorId: CALLER_ID,
        targetUserId: CALLEE_ID,
        status: 'missed',
      }),
    );
  });

  // ── 6.3: offline with tokens → createLog called once before FCM ───────────

  it('handleCallInitiate (offline with tokens) → createLog called once before FCM send', async () => {
    // Make callee offline
    const mockInChainOffline = {
      fetchSockets: jest.fn().mockResolvedValue([]),
      except: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };
    mockIo.in.mockReturnValue(mockInChainOffline);

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

    expect(mockCallLogsService.createLog).toHaveBeenCalledTimes(1);
    expect(mockCallLogsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, status: 'missed' }),
    );
    // FCM push should also have been called
    expect(
      mockCallNotificationsService.sendIncomingCallPush,
    ).toHaveBeenCalledTimes(1);
  });

  // ── 6.4: offline no tokens → createLog called once; call_missed emitted ───

  it('handleCallInitiate (offline no tokens) → createLog called once; call_missed emitted to caller', async () => {
    // Make callee offline with no tokens
    const mockInChainOffline = {
      fetchSockets: jest.fn().mockResolvedValue([]),
      except: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };
    mockIo.in.mockReturnValue(mockInChainOffline);
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

    expect(mockCallLogsService.createLog).toHaveBeenCalledTimes(1);
    expect(
      (callerSocket as unknown as { emit: jest.Mock }).emit,
    ).toHaveBeenCalledWith(
      'call_missed',
      expect.objectContaining({ reason: 'User unreachable' }),
    );
  });

  // ── 6.5: busy → createLog NOT called; call_busy emitted ──────────────────

  it('handleCallInitiate busy (target has active) → createLog NOT called; call_busy emitted to caller', async () => {
    mockCallSessionService.getActiveSessionIds = jest
      .fn()
      .mockResolvedValue(['existing-session-id']);

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

    expect(mockCallLogsService.createLog).not.toHaveBeenCalled();
    expect(mockCallSessionService.createSession).not.toHaveBeenCalled();
    expect(
      (callerSocket as unknown as { emit: jest.Mock }).emit,
    ).toHaveBeenCalledWith(
      'call_busy',
      expect.objectContaining({ targetUserId: CALLEE_ID }),
    );
  });

  // ── 6.6: accept → updateLog with status=answered ─────────────────────────

  it('handleCallAccept → updateLog(sessionId, {status: answered, answeredAt: <Date>}) called once', async () => {
    const calleeSocket = makeAuthSocket(CALLEE_ID, 'socket-callee');
    // Session has targetUserId = CALLEE_ID
    mockCallSessionService.getSession = jest.fn().mockResolvedValue({
      ...mockSession,
      targetUserId: CALLEE_ID,
    });

    await gateway.handleCallAccept(
      { sessionId: SESSION_ID },
      calleeSocket as unknown as Parameters<typeof gateway.handleCallAccept>[1],
    );

    expect(mockCallLogsService.updateLog).toHaveBeenCalledTimes(1);
    expect(mockCallLogsService.updateLog).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        status: 'answered',
        answeredAt: expect.any(Date),
      }),
    );

    // Regression (FIX 2): the callee MUST be registered as a session
    // participant on accept. createSession only adds the initiator; without
    // this the callee fails validateParticipant in handleCallAnswer /
    // handleIceCandidate and its answer + ICE are silently dropped → the call
    // never reaches 'active'. Earlier tests masked this by hard-mocking
    // getParticipants to include both users.
    expect(mockCallSessionService.addParticipant).toHaveBeenCalledWith(
      SESSION_ID,
      CALLEE_ID,
    );
  });

  // ── 6.7: decline → updateLog with status=declined ────────────────────────

  it('handleCallDecline → updateLog(sessionId, {status: declined, endedAt, duration: 0}) called once', async () => {
    const calleeSocket = makeAuthSocket(CALLEE_ID, 'socket-callee');
    mockCallSessionService.getSession = jest.fn().mockResolvedValue({
      ...mockSession,
      targetUserId: CALLEE_ID,
    });

    await gateway.handleCallDecline(
      { sessionId: SESSION_ID },
      calleeSocket as unknown as Parameters<
        typeof gateway.handleCallDecline
      >[1],
    );

    expect(mockCallLogsService.updateLog).toHaveBeenCalledTimes(1);
    expect(mockCallLogsService.updateLog).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        status: 'declined',
        duration: 0,
        endedAt: expect.any(Date),
      }),
    );
  });

  // ── 6.8: cancel → updateLog with status=cancelled ────────────────────────

  it('handleCallCancel → updateLog(sessionId, {status: cancelled, endedAt, duration: 0}) called once', async () => {
    const callerSocket = makeAuthSocket(CALLER_ID);
    mockCallSessionService.getSession = jest.fn().mockResolvedValue({
      ...mockSession,
      initiatorId: CALLER_ID,
      state: 'initiated',
    });

    await gateway.handleCallCancel(
      { sessionId: SESSION_ID },
      callerSocket as unknown as Parameters<typeof gateway.handleCallCancel>[1],
    );

    expect(mockCallLogsService.updateLog).toHaveBeenCalledTimes(1);
    expect(mockCallLogsService.updateLog).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        status: 'cancelled',
        duration: 0,
        endedAt: expect.any(Date),
      }),
    );
  });

  // ── 6.9: end with prior answeredAt → duration computed ───────────────────

  it('handleCallEnd with prior answeredAt → updateLog called with status=ended and computed duration', async () => {
    const answeredAt = new Date(Date.now() - 60_000); // 60 seconds ago
    mockCallLogsService.findBySessionId = jest
      .fn()
      .mockResolvedValue({ answeredAt });
    mockCallSessionService.getSession = jest.fn().mockResolvedValue({
      ...mockSession,
      state: 'active',
    });
    mockCallSessionService.getParticipants = jest
      .fn()
      .mockResolvedValue([CALLER_ID, CALLEE_ID]);

    const callerSocket = makeAuthSocket(CALLER_ID);

    await gateway.handleCallEnd(
      { sessionId: SESSION_ID },
      callerSocket as unknown as Parameters<typeof gateway.handleCallEnd>[1],
    );

    expect(mockCallLogsService.updateLog).toHaveBeenCalledTimes(1);
    const call = (mockCallLogsService.updateLog as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(SESSION_ID);
    expect(call[1].status).toBe('ended');
    expect(call[1].duration).toBeGreaterThanOrEqual(59);
    expect(call[1].duration).toBeLessThanOrEqual(61);
  });

  // ── 6.10: end with answeredAt=null → duration=0 ──────────────────────────

  it('handleCallEnd with answeredAt=null → updateLog called with duration=0', async () => {
    mockCallLogsService.findBySessionId = jest.fn().mockResolvedValue(null);
    mockCallSessionService.getSession = jest.fn().mockResolvedValue({
      ...mockSession,
      state: 'active',
    });
    mockCallSessionService.getParticipants = jest
      .fn()
      .mockResolvedValue([CALLER_ID, CALLEE_ID]);

    const callerSocket = makeAuthSocket(CALLER_ID);

    await gateway.handleCallEnd(
      { sessionId: SESSION_ID },
      callerSocket as unknown as Parameters<typeof gateway.handleCallEnd>[1],
    );

    expect(mockCallLogsService.updateLog).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ status: 'ended', duration: 0 }),
    );
  });

  // ── 6.11: online timeout → updateLog with status=missed ──────────────────

  it('online timeout callback (30s) → updateLog({status: missed, ...}) is called', async () => {
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

    // Advance 30 seconds
    await jest.advanceTimersByTimeAsync(30_000);

    expect(mockCallLogsService.updateLog).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        status: 'missed',
        duration: 0,
        endedAt: expect.any(Date),
      }),
    );
  });

  // ── 6.12: createLog throwing → gateway continues ─────────────────────────

  it('createLog throwing → gateway continues: call_initiated still emitted, session still created', async () => {
    mockCallLogsService.createLog = jest
      .fn()
      .mockRejectedValue(new Error('DB down'));

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

    // Session was still created
    expect(mockCallSessionService.createSession).toHaveBeenCalledTimes(1);
    // call_initiated was still emitted to caller
    expect(
      (callerSocket as unknown as { emit: jest.Mock }).emit,
    ).toHaveBeenCalledWith(
      'call_initiated',
      expect.objectContaining({ sessionId: SESSION_ID }),
    );
  });

  // ── 6.13: call_initiated payload contains remoteUser ─────────────────────

  it('call_initiated payload contains remoteUser with displayName and avatar from UsersService', async () => {
    mockUsersService.findById = jest.fn().mockImplementation((id: string) => {
      if (id === CALLER_ID)
        return Promise.resolve({
          ...makeUser(CALLER_ID, [], 'Alice'),
          avatar: 'alice.jpg',
        });
      if (id === CALLEE_ID)
        return Promise.resolve({
          ...makeUser(CALLEE_ID, [], 'Bob'),
          avatar: 'bob.jpg',
        });
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

    expect(
      (callerSocket as unknown as { emit: jest.Mock }).emit,
    ).toHaveBeenCalledWith(
      'call_initiated',
      expect.objectContaining({
        remoteUser: expect.objectContaining({
          userId: CALLEE_ID,
          displayName: 'Bob',
          avatar: 'bob.jpg',
        }),
      }),
    );
  });

  // ── 6.14: busy → call_busy emitted with {targetUserId}, no session ────────

  it('handleCallInitiate with target busy emits call_busy with {targetUserId} and does NOT create session', async () => {
    mockCallSessionService.getActiveSessionIds = jest
      .fn()
      .mockResolvedValue(['some-active-session']);

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

    expect(
      (callerSocket as unknown as { emit: jest.Mock }).emit,
    ).toHaveBeenCalledWith('call_busy', { targetUserId: CALLEE_ID });
    expect(mockCallSessionService.createSession).not.toHaveBeenCalled();
  });

  // ── 6.15: accept → multi-device cancel emitted ───────────────────────────

  it('handleCallAccept → io.in(user:<userId>).except(client.id).emit(call_cancelled, {sessionId}) called exactly once', async () => {
    const calleeSocket = makeAuthSocket(CALLEE_ID, 'socket-callee');
    mockCallSessionService.getSession = jest.fn().mockResolvedValue({
      ...mockSession,
      targetUserId: CALLEE_ID,
    });

    const mockExceptChain = { emit: jest.fn() };
    const mockInChainForUser = {
      fetchSockets: jest.fn().mockResolvedValue([{ id: 'callee-socket' }]),
      except: jest.fn().mockReturnValue(mockExceptChain),
    };
    mockIo.in.mockReturnValue(mockInChainForUser);

    await gateway.handleCallAccept(
      { sessionId: SESSION_ID },
      calleeSocket as unknown as Parameters<typeof gateway.handleCallAccept>[1],
    );

    // io.in('user:<userId>') should have been called
    expect(mockIo.in).toHaveBeenCalledWith(`user:${CALLEE_ID}`);
    // .except(client.id) should have been called with the accepting socket id
    expect(mockInChainForUser.except).toHaveBeenCalledWith('socket-callee');
    // .emit('call_cancelled', {sessionId}) should have been called exactly once
    expect(mockExceptChain.emit).toHaveBeenCalledTimes(1);
    expect(mockExceptChain.emit).toHaveBeenCalledWith('call_cancelled', {
      sessionId: SESSION_ID,
    });
  });
});
