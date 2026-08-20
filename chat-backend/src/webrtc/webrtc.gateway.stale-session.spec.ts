/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/require-await */
/**
 * webrtc.gateway.stale-session.spec.ts
 *
 * P1 (call-reliability-p1): SDP/ICE relay surfaces an explicit error instead
 * of silently dropping when validateParticipant fails.
 *
 * Contract under test (spec delta webrtc-call-timeout-reliability):
 *  - call_offer / call_answer / call_ice_candidate whose session is absent OR
 *    whose sender is no longer a participant MUST emit
 *    `error {code: 410, message: 'Session has ended or you are no longer a
 *    participant'}` back to the SENDER's socket and relay nothing.
 *  - Valid signaling still relays unchanged, with no new error emitted.
 *
 * Style: matches webrtc.gateway.sequence.spec.ts (TestingModule, mock service
 * objects, makeAuthSocket helper, mockIo chain setup).
 */

// Mock uuid before any module loads it
jest.mock('uuid', () => ({ v4: () => 'stale-session-id' }));

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

const STALE_ERROR = {
  code: 410,
  message: 'Session has ended or you are no longer a participant',
};

/**
 * Builds a CallSessionService mock with a configurable session presence and a
 * real Set for participants, so validateParticipant can fail either because
 * the session is gone (expired cron / terminated by peer) or because the
 * sender is no longer listed as a participant.
 */
function buildCallSessionMock(opts: {
  sessionId: string;
  initiatorId: string;
  targetUserId: string;
  sessionPresent: boolean;
  participants: string[];
}) {
  const participantStore = new Set<string>(opts.participants);

  const mockSession = {
    sessionId: opts.sessionId,
    initiatorId: opts.initiatorId,
    targetUserId: opts.targetUserId,
    conversationId: 'conv-stale-1',
    callType: CallType.AUDIO,
    state: 'active' as
      | 'initiated'
      | 'active'
      | 'ended'
      | 'declined'
      | 'missed',
    createdAt: new Date().toISOString(),
    participantCount: opts.participants.length,
  };

  return {
    store: participantStore,
    mock: {
      hasExistingSession: jest.fn().mockResolvedValue(null),
      getActiveSessionIds: jest.fn().mockResolvedValue([]),
      isActive: jest.fn().mockResolvedValue(false),
      createSession: jest.fn().mockResolvedValue(mockSession),
      endSession: jest.fn().mockResolvedValue(undefined),
      getSession: jest
        .fn()
        .mockImplementation(async () =>
          opts.sessionPresent ? { ...mockSession } : null,
        ),
      markPushSent: jest.fn().mockResolvedValue(undefined),
      updateSessionState: jest.fn().mockResolvedValue(undefined),
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

describe('WebrtcGateway — stale-session signaling surfaces error 410', () => {
  const SESSION_ID = 'stale-session-id';
  const CALLER_ID = 'stale-user-A';
  const CALLEE_ID = 'stale-user-B';

  const fakeOfferSdp = { type: 'offer', sdp: 'sdp-offer' } as never;
  const fakeAnswerSdp = { type: 'answer', sdp: 'sdp-answer' } as never;
  const fakeCandidate = {
    candidate: 'cand:host',
    sdpMid: '0',
    sdpMLineIndex: 0,
  } as never;

  async function buildGateway(sessionOpts: {
    sessionPresent: boolean;
    participants: string[];
  }): Promise<{
    gateway: WebrtcGateway;
    callSession: ReturnType<typeof buildCallSessionMock>;
    mockToEmit: jest.Mock;
    mockIo: { in: jest.Mock; to: jest.Mock };
  }> {
    const callSession = buildCallSessionMock({
      sessionId: SESSION_ID,
      initiatorId: CALLER_ID,
      targetUserId: CALLEE_ID,
      sessionPresent: sessionOpts.sessionPresent,
      participants: sessionOpts.participants,
    });

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
              .mockResolvedValue({ success: 0, failure: 0, totalTokens: 0 }),
          },
        },
        {
          provide: UsersService,
          useValue: { findById: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: MembershipService,
          useValue: { isMember: jest.fn().mockResolvedValue(true) },
        },
        { provide: JwtService, useValue: { verify: jest.fn() } },
        {
          provide: WsAuthGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: CallLogsService,
          useValue: {
            createLog: jest.fn().mockResolvedValue({ sessionId: SESSION_ID }),
            updateLog: jest.fn().mockResolvedValue(undefined),
            findBySessionId: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: RedisService,
          useValue: { incrementWithExpiry: jest.fn().mockResolvedValue(1) },
        },
      ],
    }).compile();

    const gateway = module.get<WebrtcGateway>(WebrtcGateway);

    const mockToEmit = jest.fn();
    const mockToChain = { emit: mockToEmit };
    const mockInChain = {
      fetchSockets: jest.fn().mockResolvedValue([]),
      except: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };
    const mockIo = {
      in: jest.fn().mockReturnValue(mockInChain),
      to: jest.fn().mockReturnValue(mockToChain),
    };
    (gateway as unknown as { io: typeof mockIo }).io = mockIo;

    return { gateway, callSession, mockToEmit, mockIo };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Session absent (expired by cron / already terminated) ────────────────────

  describe('session absent — race window after settle/expire', () => {
    it('call_offer emits error 410 to the sender and relays nothing', async () => {
      const { gateway, mockToEmit } = await buildGateway({
        sessionPresent: false,
        participants: [CALLER_ID, CALLEE_ID],
      });
      const senderSocket = makeAuthSocket(CALLER_ID);

      await gateway.handleCallOffer(
        { sessionId: SESSION_ID, sdp: fakeOfferSdp },
        senderSocket as unknown as Parameters<typeof gateway.handleCallOffer>[1],
      );

      expect(senderSocket.emit).toHaveBeenCalledWith('error', STALE_ERROR);
      // Nothing relayed to any room.
      expect(
        mockToEmit.mock.calls.filter((c) => c[0] === 'call_offer'),
      ).toHaveLength(0);
    });

    it('call_answer emits error 410 to the sender and relays nothing', async () => {
      const { gateway, mockToEmit } = await buildGateway({
        sessionPresent: false,
        participants: [CALLER_ID, CALLEE_ID],
      });
      const senderSocket = makeAuthSocket(CALLEE_ID);

      await gateway.handleCallAnswer(
        { sessionId: SESSION_ID, sdp: fakeAnswerSdp },
        senderSocket as unknown as Parameters<
          typeof gateway.handleCallAnswer
        >[1],
      );

      expect(senderSocket.emit).toHaveBeenCalledWith('error', STALE_ERROR);
      expect(
        mockToEmit.mock.calls.filter((c) => c[0] === 'call_answer'),
      ).toHaveLength(0);
    });

    it('call_ice_candidate emits error 410 to the sender and fans out nothing', async () => {
      const { gateway, mockToEmit } = await buildGateway({
        sessionPresent: false,
        participants: [CALLER_ID, CALLEE_ID],
      });
      const senderSocket = makeAuthSocket(CALLER_ID);

      await gateway.handleIceCandidate(
        { sessionId: SESSION_ID, candidate: fakeCandidate },
        senderSocket as unknown as Parameters<
          typeof gateway.handleIceCandidate
        >[1],
      );

      expect(senderSocket.emit).toHaveBeenCalledWith('error', STALE_ERROR);
      expect(
        mockToEmit.mock.calls.filter((c) => c[0] === 'call_ice_candidate'),
      ).toHaveLength(0);
    });
  });

  // ── Session present but sender no longer a participant ───────────────────────

  describe('sender no longer a participant', () => {
    it('call_offer from a non-participant emits error 410 and relays nothing', async () => {
      const { gateway, mockToEmit } = await buildGateway({
        sessionPresent: true,
        participants: [CALLEE_ID], // sender CALLER_ID is not listed
      });
      const senderSocket = makeAuthSocket(CALLER_ID);

      await gateway.handleCallOffer(
        { sessionId: SESSION_ID, sdp: fakeOfferSdp },
        senderSocket as unknown as Parameters<typeof gateway.handleCallOffer>[1],
      );

      expect(senderSocket.emit).toHaveBeenCalledWith('error', STALE_ERROR);
      expect(
        mockToEmit.mock.calls.filter((c) => c[0] === 'call_offer'),
      ).toHaveLength(0);
    });

    it('call_answer from a non-participant emits error 410 and relays nothing', async () => {
      const { gateway, mockToEmit } = await buildGateway({
        sessionPresent: true,
        participants: [CALLER_ID], // sender CALLEE_ID is not listed
      });
      const senderSocket = makeAuthSocket(CALLEE_ID);

      await gateway.handleCallAnswer(
        { sessionId: SESSION_ID, sdp: fakeAnswerSdp },
        senderSocket as unknown as Parameters<
          typeof gateway.handleCallAnswer
        >[1],
      );

      expect(senderSocket.emit).toHaveBeenCalledWith('error', STALE_ERROR);
      expect(
        mockToEmit.mock.calls.filter((c) => c[0] === 'call_answer'),
      ).toHaveLength(0);
    });

    it('call_ice_candidate from a non-participant emits error 410 and fans out nothing', async () => {
      const { gateway, mockToEmit, mockIo } = await buildGateway({
        sessionPresent: true,
        participants: [CALLEE_ID], // sender CALLER_ID is not listed
      });
      const senderSocket = makeAuthSocket(CALLER_ID);

      await gateway.handleIceCandidate(
        { sessionId: SESSION_ID, candidate: fakeCandidate },
        senderSocket as unknown as Parameters<
          typeof gateway.handleIceCandidate
        >[1],
      );

      expect(senderSocket.emit).toHaveBeenCalledWith('error', STALE_ERROR);
      expect(
        mockToEmit.mock.calls.filter((c) => c[0] === 'call_ice_candidate'),
      ).toHaveLength(0);
      expect(mockIo.to).not.toHaveBeenCalled();
    });
  });

  // ── Valid signaling still relays unchanged ───────────────────────────────────

  describe('valid signaling still relays unchanged (no new error)', () => {
    it('valid call_offer relays to the peer and emits no error', async () => {
      const { gateway, mockToEmit, mockIo } = await buildGateway({
        sessionPresent: true,
        participants: [CALLER_ID, CALLEE_ID],
      });
      const senderSocket = makeAuthSocket(CALLER_ID);

      await gateway.handleCallOffer(
        { sessionId: SESSION_ID, sdp: fakeOfferSdp },
        senderSocket as unknown as Parameters<typeof gateway.handleCallOffer>[1],
      );

      expect(senderSocket.emit).not.toHaveBeenCalled();
      expect(mockIo.to).toHaveBeenCalledWith(`user:${CALLEE_ID}`);
      expect(mockToEmit).toHaveBeenCalledWith(
        'call_offer',
        expect.objectContaining({ sessionId: SESSION_ID, sdp: fakeOfferSdp }),
      );
    });

    it('valid call_answer relays to the initiator and emits no error', async () => {
      const { gateway, mockToEmit, mockIo } = await buildGateway({
        sessionPresent: true,
        participants: [CALLER_ID, CALLEE_ID],
      });
      const senderSocket = makeAuthSocket(CALLEE_ID);

      await gateway.handleCallAnswer(
        { sessionId: SESSION_ID, sdp: fakeAnswerSdp },
        senderSocket as unknown as Parameters<
          typeof gateway.handleCallAnswer
        >[1],
      );

      expect(senderSocket.emit).not.toHaveBeenCalled();
      expect(mockIo.to).toHaveBeenCalledWith(`user:${CALLER_ID}`);
      expect(mockToEmit).toHaveBeenCalledWith(
        'call_answer',
        expect.objectContaining({ sessionId: SESSION_ID, sdp: fakeAnswerSdp }),
      );
    });

    it('valid call_ice_candidate fans out to the other participant and emits no error', async () => {
      const { gateway, mockToEmit, mockIo } = await buildGateway({
        sessionPresent: true,
        participants: [CALLER_ID, CALLEE_ID],
      });
      const senderSocket = makeAuthSocket(CALLER_ID);

      await gateway.handleIceCandidate(
        { sessionId: SESSION_ID, candidate: fakeCandidate },
        senderSocket as unknown as Parameters<
          typeof gateway.handleIceCandidate
        >[1],
      );

      expect(senderSocket.emit).not.toHaveBeenCalled();
      expect(mockIo.to).toHaveBeenCalledWith(`user:${CALLEE_ID}`);
      // Not fanned back to the sender.
      const toCalls = mockIo.to.mock.calls.map((c) => c[0]);
      expect(toCalls).not.toContain(`user:${CALLER_ID}`);
      expect(mockToEmit).toHaveBeenCalledWith(
        'call_ice_candidate',
        expect.objectContaining({ candidate: fakeCandidate }),
      );
    });
  });

  // ── validateParticipant contract unchanged ────────────────────────────────────

  it('validateParticipant keeps Promise<boolean> contract (no widened return type)', async () => {
    const { gateway } = await buildGateway({
      sessionPresent: true,
      participants: [CALLER_ID, CALLEE_ID],
    });
    const validate = (
      gateway as unknown as {
        validateParticipant: (s: string, u: string) => Promise<boolean>;
      }
    ).validateParticipant.bind(gateway);

    const ok = await validate(SESSION_ID, CALLER_ID);
    expect(ok).toBe(true);

    const notParticipant = await validate(SESSION_ID, 'someone-else');
    expect(notParticipant).toBe(false);

    // Session-absent early null-check is covered by the same boolean branch.
    const { gateway: absentGateway } = await buildGateway({
      sessionPresent: false,
      participants: [CALLER_ID],
    });
    const validateAbsent = (
      absentGateway as unknown as {
        validateParticipant: (s: string, u: string) => Promise<boolean>;
      }
    ).validateParticipant.bind(absentGateway);
    const absent = await validateAbsent(SESSION_ID, CALLER_ID);
    expect(absent).toBe(false);
  });
});
