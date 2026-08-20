/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/**
 * webrtc.gateway.sequence.spec.ts
 *
 * Backend integration sequence test for WebrtcGateway.
 * Tests the full 1-1 call relay sequence using two mock sockets (caller, callee).
 *
 * Key design decision:
 *  - CallSessionService mock uses a REAL in-memory Set for participants, NOT a
 *    hard-coded [CALLER_ID, CALLEE_ID] return. This means validateParticipant
 *    actually fails until addParticipant is called — exactly the regression
 *    that FIX2 addresses.
 *  - FIX2 regression assert: if callee is NOT added via addParticipant before
 *    call_answer is processed, validateParticipant silently drops the answer.
 *
 * Style: matches webrtc.gateway.call-log.spec.ts (TestingModule, mock service
 * objects, makeAuthSocket helper, mockIo chain setup).
 */

// Mock uuid before any module loads it
jest.mock('uuid', () => ({ v4: () => 'seq-session-id' }));

import { Test, TestingModule } from '@nestjs/testing';
import { WebrtcGateway } from './webrtc.gateway';
import { CallSessionService } from './services/call-session.service';
import { TurnService } from './services/turn.service';
import { CallNotificationsService } from './services/call-notifications.service';
import { UsersService } from '../users/users.service';
import { MembershipService } from '../conversations/services/membership.service';
import { JwtService } from '@nestjs/jwt';
import { WsAuthGuard } from '../gateway/guards/ws-auth.guard';
import { CallLogsService } from '../call-logs/call-logs.service';
import { RedisService } from '../common/redis/redis.service';
import { CallType } from './dto/call-initiate.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MockSocket = {
  id: string;
  data: { user: { sub: string; phone: string } };
  emit: jest.Mock;
  join: jest.Mock;
};

function makeAuthSocket(
  userId: string,
  socketId = `socket-${userId}`,
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

// ─── In-memory participant store ───────────────────────────────────────────────

/**
 * Builds a CallSessionService mock that uses a real Set for participants.
 * This is the critical difference from call-log.spec.ts which hard-mocks
 * getParticipants — here we let validateParticipant actually fail when the
 * callee has not been added yet, proving FIX2 is necessary.
 */
function buildCallSessionMock(
  sessionId: string,
  initiatorId: string,
  targetUserId: string,
) {
  // Participant store: starts with only the initiator (as createSession does)
  const participantStore = new Set<string>([initiatorId]);

  const mockSession = {
    sessionId,
    initiatorId,
    targetUserId,
    conversationId: 'conv-seq-1',
    callType: CallType.AUDIO,
    state: 'initiated' as
      | 'initiated'
      | 'active'
      | 'ended'
      | 'declined'
      | 'missed',
    createdAt: new Date().toISOString(),
    participantCount: 1,
  };

  return {
    store: participantStore,
    session: mockSession,
    mock: {
      hasExistingSession: jest.fn().mockResolvedValue(null),
      getActiveSessionIds: jest.fn().mockResolvedValue([]),
      isActive: jest.fn().mockResolvedValue(false),
      createSession: jest.fn().mockImplementation(async () => {
        // reset participant store on each createSession call
        participantStore.clear();
        participantStore.add(initiatorId);
        mockSession.state = 'initiated';
        return mockSession;
      }),
      endSession: jest.fn().mockResolvedValue(undefined),
      getSession: jest
        .fn()
        .mockImplementation(async () => ({ ...mockSession })),
      markPushSent: jest.fn().mockResolvedValue(undefined),
      updateSessionState: jest
        .fn()
        .mockImplementation(async (_sid: string, state: string) => {
          mockSession.state = state as typeof mockSession.state;
        }),
      getParticipants: jest
        .fn()
        .mockImplementation(async () => Array.from(participantStore)),
      addParticipant: jest
        .fn()
        .mockImplementation(async (_sid: string, userId: string) => {
          participantStore.add(userId);
          return true;
        }),
      updateDeadlineAt: jest.fn().mockResolvedValue(undefined),
      setPendingCall: jest.fn().mockResolvedValue(undefined),
      getPendingCall: jest.fn().mockResolvedValue(null),
      delPendingCall: jest.fn().mockResolvedValue(undefined),
      delPendingCallIfMatches: jest.fn().mockResolvedValue(undefined),
    },
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('WebrtcGateway — 1-1 call relay sequence', () => {
  let gateway: WebrtcGateway;

  // Tracked mock IO chains per user room
  let mockToEmit: jest.Mock;
  let mockIo: { in: jest.Mock; to: jest.Mock };

  // Per-call mocks
  let callSession: ReturnType<typeof buildCallSessionMock>;
  let mockCallLogsService: jest.Mocked<Partial<CallLogsService>>;
  let mockUsersService: jest.Mocked<Partial<UsersService>>;
  let mockMembershipService: jest.Mocked<Partial<MembershipService>>;

  const SESSION_ID = 'seq-session-id';
  const CALLER_ID = 'seq-user-A';
  const CALLEE_ID = 'seq-user-B';
  const CONV_ID = 'conv-seq-1';

  beforeEach(async () => {
    jest.useFakeTimers();

    callSession = buildCallSessionMock(SESSION_ID, CALLER_ID, CALLEE_ID);

    mockCallLogsService = {
      createLog: jest.fn().mockResolvedValue({ sessionId: SESSION_ID }),
      updateLog: jest.fn().mockResolvedValue(undefined),
      findBySessionId: jest.fn().mockResolvedValue(null),
    };

    mockMembershipService = {
      isMember: jest.fn().mockResolvedValue(true),
    };

    mockUsersService = {
      findById: jest.fn().mockImplementation((id: string) => {
        if (id === CALLER_ID)
          return Promise.resolve(makeUser(CALLER_ID, [], 'Alice'));
        if (id === CALLEE_ID)
          return Promise.resolve(
            makeUser(
              CALLEE_ID,
              [{ token: 'fcm-1', platform: 'android' }],
              'Bob',
            ),
          );
        return Promise.resolve(null);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebrtcGateway,
        { provide: CallSessionService, useValue: callSession.mock },
        {
          provide: TurnService,
          useValue: { getIceServers: jest.fn().mockReturnValue([]) },
        },
        {
          provide: CallNotificationsService,
          useValue: {
            sendIncomingCallPush: jest
              .fn()
              .mockResolvedValue({ success: 1, failure: 0, totalTokens: 1 }),
          },
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

    // Build mock IO with per-call tracking
    mockToEmit = jest.fn();
    const mockToChain = { emit: mockToEmit };
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

  // ── Full relay sequence ───────────────────────────────────────────────────────

  describe('Full 1-1 call sequence: initiate → accept → offer → answer → ICE → end', () => {
    it('Step 1: call_initiate → call_initiated to caller + incoming_call to callee', async () => {
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

      // call_initiated emitted to caller (direct socket.emit)
      expect(callerSocket.emit).toHaveBeenCalledWith(
        'call_initiated',
        expect.objectContaining({ sessionId: SESSION_ID }),
      );

      // incoming_call emitted to callee room
      expect(mockIo.to).toHaveBeenCalledWith(`user:${CALLEE_ID}`);
      expect(mockToEmit).toHaveBeenCalledWith(
        'incoming_call',
        expect.objectContaining({ sessionId: SESSION_ID }),
      );
    });

    it('Step 2: call_accept → addParticipant(callee) BEFORE call_accepted emitted', async () => {
      const calleeSocket = makeAuthSocket(CALLEE_ID);

      // Confirm callee is NOT yet in participants
      expect(Array.from(callSession.store)).not.toContain(CALLEE_ID);

      await gateway.handleCallAccept(
        { sessionId: SESSION_ID },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleCallAccept
        >[1],
      );

      // addParticipant was called with callee's ID
      expect(callSession.mock.addParticipant).toHaveBeenCalledWith(
        SESSION_ID,
        CALLEE_ID,
      );

      // Callee is now in the participant store (real Set)
      expect(Array.from(callSession.store)).toContain(CALLEE_ID);

      // call_accepted was emitted to caller room
      expect(mockIo.to).toHaveBeenCalledWith(`user:${CALLER_ID}`);
      expect(mockToEmit).toHaveBeenCalledWith(
        'call_accepted',
        expect.objectContaining({ sessionId: SESSION_ID }),
      );
    });

    it('Step 2 (ordering): addParticipant is called before call_accepted is emitted', async () => {
      const calleeSocket = makeAuthSocket(CALLEE_ID);
      const callOrder: string[] = [];

      // Track order of operations
      callSession.mock.addParticipant.mockImplementation(
        async (_sid: string, userId: string) => {
          callOrder.push('addParticipant');
          callSession.store.add(userId);
          return true;
        },
      );
      mockToEmit.mockImplementation((event: string) => {
        if (event === 'call_accepted') callOrder.push('call_accepted');
        return undefined;
      });

      await gateway.handleCallAccept(
        { sessionId: SESSION_ID },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleCallAccept
        >[1],
      );

      expect(callOrder.indexOf('addParticipant')).toBeLessThan(
        callOrder.indexOf('call_accepted'),
      );
    });

    it('Step 3: call_offer from caller → relayed to callee via io.to(user:callee)', async () => {
      // First accept so callee is a participant
      const calleeSocket = makeAuthSocket(CALLEE_ID);
      await gateway.handleCallAccept(
        { sessionId: SESSION_ID },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleCallAccept
        >[1],
      );

      mockToEmit.mockClear();
      mockIo.to.mockClear();

      const callerSocket = makeAuthSocket(CALLER_ID);
      await gateway.handleCallOffer(
        { sessionId: SESSION_ID, sdp: { type: 'offer', sdp: 'sdp-offer' } },
        callerSocket as unknown as Parameters<
          typeof gateway.handleCallOffer
        >[1],
      );

      // Offer should be relayed to callee
      expect(mockIo.to).toHaveBeenCalledWith(`user:${CALLEE_ID}`);
      expect(mockToEmit).toHaveBeenCalledWith(
        'call_offer',
        expect.objectContaining({
          sessionId: SESSION_ID,
          sdp: { type: 'offer', sdp: 'sdp-offer' },
        }),
      );
    });

    it('Step 4: call_answer from callee → relayed to initiator (updateSessionState(active) already called by accept)', async () => {
      // Accept first so callee is participant
      const calleeSocket = makeAuthSocket(CALLEE_ID);
      await gateway.handleCallAccept(
        { sessionId: SESSION_ID },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleCallAccept
        >[1],
      );

      // updateSessionState('active') was called by handleCallAccept
      expect(callSession.mock.updateSessionState).toHaveBeenCalledWith(
        SESSION_ID,
        'active',
      );

      mockToEmit.mockClear();
      mockIo.to.mockClear();
      callSession.mock.updateSessionState.mockClear();

      await gateway.handleCallAnswer(
        { sessionId: SESSION_ID, sdp: { type: 'answer', sdp: 'sdp-answer' } },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleCallAnswer
        >[1],
      );

      // Answer relayed to caller (initiator)
      expect(mockIo.to).toHaveBeenCalledWith(`user:${CALLER_ID}`);
      expect(mockToEmit).toHaveBeenCalledWith(
        'call_answer',
        expect.objectContaining({
          sessionId: SESSION_ID,
          sdp: { type: 'answer', sdp: 'sdp-answer' },
        }),
      );

      // handleCallAnswer does NOT call updateSessionState again when state is already 'active'
      // (guard: if session.state === 'initiated'). This is correct — handleCallAccept already did it.
      expect(callSession.mock.updateSessionState).not.toHaveBeenCalledWith(
        SESSION_ID,
        'active',
      );
    });

    it('Step 5: call_ice_candidate from caller → relayed to callee only (not back to sender)', async () => {
      // Accept so callee is participant
      const calleeSocket = makeAuthSocket(CALLEE_ID);
      await gateway.handleCallAccept(
        { sessionId: SESSION_ID },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleCallAccept
        >[1],
      );

      mockToEmit.mockClear();
      mockIo.to.mockClear();

      const callerSocket = makeAuthSocket(CALLER_ID);
      const fakeCandidate = {
        candidate: 'cand:host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      };

      await gateway.handleIceCandidate(
        { sessionId: SESSION_ID, candidate: fakeCandidate as never },
        callerSocket as unknown as Parameters<
          typeof gateway.handleIceCandidate
        >[1],
      );

      // ICE sent to callee room
      expect(mockIo.to).toHaveBeenCalledWith(`user:${CALLEE_ID}`);
      expect(mockToEmit).toHaveBeenCalledWith(
        'call_ice_candidate',
        expect.objectContaining({ candidate: fakeCandidate }),
      );

      // ICE NOT sent back to the caller (caller is CALLER_ID, not in the targets)
      const toCalls = mockIo.to.mock.calls.map((c) => c[0]);
      expect(toCalls).not.toContain(`user:${CALLER_ID}`);
    });

    it('Step 5b: call_ice_candidate from callee → relayed to caller only', async () => {
      // Accept so callee is participant
      const calleeSocket = makeAuthSocket(CALLEE_ID);
      await gateway.handleCallAccept(
        { sessionId: SESSION_ID },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleCallAccept
        >[1],
      );

      mockToEmit.mockClear();
      mockIo.to.mockClear();

      const fakeCandidate = {
        candidate: 'cand:callee',
        sdpMid: '0',
        sdpMLineIndex: 0,
      };

      await gateway.handleIceCandidate(
        { sessionId: SESSION_ID, candidate: fakeCandidate as never },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleIceCandidate
        >[1],
      );

      // Sent to caller room
      expect(mockIo.to).toHaveBeenCalledWith(`user:${CALLER_ID}`);
      // NOT sent to callee room
      const toCalls = mockIo.to.mock.calls.map((c) => c[0]);
      expect(toCalls).not.toContain(`user:${CALLEE_ID}`);
    });

    it('Step 6: call_end → call_ended emitted to BOTH participants + updateLog(ended)', async () => {
      // Accept so callee is participant
      const calleeSocket = makeAuthSocket(CALLEE_ID);
      await gateway.handleCallAccept(
        { sessionId: SESSION_ID },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleCallAccept
        >[1],
      );

      // Set answeredAt on log to test duration computation
      const answeredAt = new Date(Date.now() - 30_000);
      mockCallLogsService.findBySessionId = jest
        .fn()
        .mockResolvedValue({ answeredAt });

      mockToEmit.mockClear();
      mockIo.to.mockClear();

      const callerSocket = makeAuthSocket(CALLER_ID);
      await gateway.handleCallEnd(
        { sessionId: SESSION_ID },
        callerSocket as unknown as Parameters<typeof gateway.handleCallEnd>[1],
      );

      const toCalls = mockIo.to.mock.calls.map((c) => c[0]);
      // Both participants should receive call_ended
      expect(toCalls).toContain(`user:${CALLER_ID}`);
      expect(toCalls).toContain(`user:${CALLEE_ID}`);
      expect(mockToEmit).toHaveBeenCalledWith(
        'call_ended',
        expect.objectContaining({ sessionId: SESSION_ID }),
      );

      // updateLog called with status=ended
      expect(mockCallLogsService.updateLog).toHaveBeenCalledWith(
        SESSION_ID,
        expect.objectContaining({ status: 'ended' }),
      );
    });
  });

  // ── FIX2 regression ───────────────────────────────────────────────────────────

  describe('FIX2 regression: callee must be in participants before call_answer is processed', () => {
    it('call_answer WITHOUT addParticipant → validateParticipant returns false → answer is NOT relayed', async () => {
      // Callee NOT added (simulates the old bug: handleCallAccept did not call addParticipant)
      // participant store only has CALLER_ID (from createSession)
      expect(Array.from(callSession.store)).toEqual([CALLER_ID]);

      mockToEmit.mockClear();
      mockIo.to.mockClear();

      const calleeSocket = makeAuthSocket(CALLEE_ID);
      await gateway.handleCallAnswer(
        { sessionId: SESSION_ID, sdp: { type: 'answer', sdp: 'sdp-answer' } },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleCallAnswer
        >[1],
      );

      // validateParticipant fails → answer NOT relayed to caller
      const callAnswerCalls = mockToEmit.mock.calls.filter(
        (c) => c[0] === 'call_answer',
      );
      expect(callAnswerCalls).toHaveLength(0);
    });

    it('call_answer AFTER addParticipant → validateParticipant passes → answer IS relayed', async () => {
      // Accept (which calls addParticipant) first
      const calleeSocket = makeAuthSocket(CALLEE_ID);
      await gateway.handleCallAccept(
        { sessionId: SESSION_ID },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleCallAccept
        >[1],
      );

      mockToEmit.mockClear();
      mockIo.to.mockClear();

      await gateway.handleCallAnswer(
        { sessionId: SESSION_ID, sdp: { type: 'answer', sdp: 'sdp-answer' } },
        calleeSocket as unknown as Parameters<
          typeof gateway.handleCallAnswer
        >[1],
      );

      // Answer IS relayed
      const callAnswerCalls = mockToEmit.mock.calls.filter(
        (c) => c[0] === 'call_answer',
      );
      expect(callAnswerCalls).toHaveLength(1);
    });
  });
});
