/**
 * WebRTCService.call.spec.ts
 *
 * 2-client simulation test suite for WebRTCService.
 * Tests all major call flow paths using the in-memory relay bus from callHarness.ts.
 *
 * Mocking strategy:
 *  - react-native-webrtc: loopback mock (jest/mocks/react-native-webrtc.js via
 *    moduleNameMapper) — RTCPeerConnection fires synthetic 'track' on setRemoteDescription
 *  - react-native-incall-manager: no-op mock via moduleNameMapper
 *  - socket.io-client: overridden below per-file so callerService and calleeService
 *    each get their own FakeSocket injected by callHarness (not the global singleton)
 *  - react-native-permissions: stubbed here
 *
 * NOTE: @testing-library/react-hooks is NOT in package.json so hooks are NOT
 * tested here. State assertions go through WebRTCService.getCallState() and
 * the internal event listener API (service.on/off/emit).
 */

// Override socket.io-client locally so this file does NOT use the global
// singleton from jest/setup.js. callHarness injects its own FakeSocket
// instances directly into each service, so socket.io-client is never
// actually called from within the service under test — EXCEPT the 7.6
// safe-reconnect tests, which call service.connect() and need io() to
// return a trackable fake socket.
jest.mock('socket.io-client', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const EventEmitter = require('events');
  const ioMock = jest.fn(() => {
    const s = new EventEmitter();
    s.connected = false;
    s.disconnect = jest.fn();
    const origRemoveAll = s.removeAllListeners.bind(s);
    s.removeAllListeners = jest.fn(() => origRemoveAll());
    return s;
  });
  return { io: ioMock, __ioMock: ioMock };
});

// react-native-permissions — stub the entire module; WebRTCService uses it
// for Android runtime permission checks which we bypass in tests.
jest.mock('react-native-permissions', () => ({
  PERMISSIONS: { ANDROID: { RECORD_AUDIO: 'audio', CAMERA: 'camera' } },
  RESULTS: { GRANTED: 'granted' },
  requestMultiple: jest.fn().mockResolvedValue({
    audio: 'granted',
    camera: 'granted',
  }),
}));

// react-native Platform — default to 'ios' so permission block is skipped
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Vibration: { vibrate: jest.fn(), cancel: jest.fn() },
}));

import { buildCallHarness, CallHarnessResult } from '../callHarness';
import { WebRTCService } from '../WebRTCService';

// Grab the incall-manager mock so we can assert on method calls
// eslint-disable-next-line @typescript-eslint/no-var-requires
const InCallManagerMock = require('react-native-incall-manager');

// ─── ICE servers used in tests ────────────────────────────────────────────────

const ICE_SERVERS = [{ urls: 'stun:mock.stun.test:3478' }];

// ─── Helper: flush all microtasks ─────────────────────────────────────────────

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ─── Helper: wait for a service event with timeout ───────────────────────────

function waitForServiceEvent(
  service: WebRTCService,
  event: string,
  timeoutMs = 2000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      service.off(event, handler);
      reject(new Error(`Timeout waiting for service event "${event}" after ${timeoutMs}ms`));
    }, timeoutMs);

    function handler(...args: unknown[]) {
      clearTimeout(timer);
      service.off(event, handler);
      resolve(args[0]);
    }

    service.on(event, handler);
  });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('WebRTCService — 2-client call harness', () => {
  let h: CallHarnessResult;

  beforeEach(() => {
    jest.clearAllMocks();
    h = buildCallHarness();
  });

  afterEach(() => {
    try { h.callerService.cleanup(); } catch (_) { /* ignore */ }
    try { h.calleeService.cleanup(); } catch (_) { /* ignore */ }
  });

  // ── Happy path ───────────────────────────────────────────────────────────────

  describe('Happy path: full call flow', () => {
    it('caller initiates → callee receives incoming_call', async () => {
      const calleeIncoming = h.waitForCalleeEvent('incoming_call');
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const data = await calleeIncoming;
      expect(data).toMatchObject({ sessionId: expect.any(String) });
    });

    it('caller state transitions to initiating after initiateCall', () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      expect(h.callerService.getCallState()).toBe('initiating');
    });

    it('caller receives call_initiated with sessionId and iceServers', async () => {
      const callerInitiated = h.waitForCallerEvent('call_initiated');
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const data = (await callerInitiated) as { sessionId: string; iceServers: unknown[] };
      expect(data.sessionId).toBeTruthy();
      expect(Array.isArray(data.iceServers)).toBe(true);
    });

    it('callee acceptCall → caller receives call_accepted', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      const callerAccepted = h.waitForCallerEvent('call_accepted');
      h.calleeService.acceptCall(sid);
      const data = await callerAccepted;
      expect(data).toMatchObject({ sessionId: sid });
    });

    it('after call_ended both services can transition to idle', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      const callerEnded = h.waitForCallerEvent('call_ended');
      h.deliverToCallerSocket('call_ended', { sessionId: sid });
      await callerEnded;

      h.callerService.cleanup();
      expect(h.callerService.getCallState()).toBe('idle');
    });
  });

  // ── FIX1: Offer-on-accept ─────────────────────────────────────────────────────

  describe('FIX1 (offer-on-accept): offer only sent after call_accepted', () => {
    it('createAndSendOffer is NOT called at createPeerConnection time; offerPending=false before accept', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      // Create peer connection BEFORE accept
      await h.callerService.createPeerConnection(sid, ICE_SERVERS);

      // offerPending should be false — accept has not arrived yet
      const offerPending = (h.callerService as unknown as Record<string, unknown>).offerPending;
      expect(offerPending).toBe(false);
    });

    it('createAndSendOffer is called after call_accepted arrives (PC already built)', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      // Build PC first
      await h.callerService.createPeerConnection(sid, ICE_SERVERS);

      const sendOfferSpy = jest.spyOn(
        h.callerService as unknown as { createAndSendOffer: (s: string) => Promise<void> },
        'createAndSendOffer',
      );

      const callerAccepted = h.waitForCallerEvent('call_accepted');
      h.calleeService.acceptCall(sid);
      await callerAccepted;
      await flushMicrotasks();

      expect(sendOfferSpy).toHaveBeenCalledTimes(1);
    });

    it('FIX1 offerPending: accept before createPeerConnection → offerPending=true, consumed by createPeerConnection', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      const sendOfferSpy = jest.spyOn(
        h.callerService as unknown as { createAndSendOffer: (s: string) => Promise<void> },
        'createAndSendOffer',
      );

      // Accept BEFORE creating peer connection
      const callerAccepted = h.waitForCallerEvent('call_accepted');
      h.calleeService.acceptCall(sid);
      await callerAccepted;
      await flushMicrotasks();

      // No PC yet → offer not sent yet, offerPending=true
      expect(sendOfferSpy).not.toHaveBeenCalled();
      const offerPendingBefore = (h.callerService as unknown as Record<string, unknown>).offerPending;
      expect(offerPendingBefore).toBe(true);

      // Now create PC → offerPending consumed
      await h.callerService.createPeerConnection(sid, ICE_SERVERS);
      await flushMicrotasks();

      expect(sendOfferSpy).toHaveBeenCalledTimes(1);
      const offerPendingAfter = (h.callerService as unknown as Record<string, unknown>).offerPending;
      expect(offerPendingAfter).toBe(false);
    });
  });

  // ── Cancel ────────────────────────────────────────────────────────────────────

  describe('Cancel: caller cancels before accept', () => {
    it('cancelCall → callee receives call_cancelled', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      const calleeCancelled = h.waitForCalleeEvent('call_cancelled');
      h.callerService.cancelCall(sid);
      const data = await calleeCancelled;
      expect(data).toMatchObject({ sessionId: sid });
    });

    it('cancelCall → caller state transitions to idle', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      h.callerService.cancelCall(sid);
      expect(h.callerService.getCallState()).toBe('idle');
    });
  });

  // ── Decline ───────────────────────────────────────────────────────────────────

  describe('Decline: callee declines', () => {
    it('declineCall → caller receives call_declined', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      const callerDeclined = h.waitForCallerEvent('call_declined');
      h.calleeService.declineCall(sid);
      const data = await callerDeclined;
      expect(data).toMatchObject({ sessionId: sid });
    });
  });

  // ── Timeout / Missed ──────────────────────────────────────────────────────────

  describe('Timeout / Missed', () => {
    it('call_missed delivered to caller → service emits call_missed internally', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      const missed = waitForServiceEvent(h.callerService, 'call_missed');
      h.deliverToCallerSocket('call_missed', { sessionId: sid, reason: 'No answer' });
      const data = await missed;
      expect(data).toMatchObject({ sessionId: sid });
    });

    it('call_timeout delivered to callee → service emits call_timeout internally', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      const timeout = waitForServiceEvent(h.calleeService, 'call_timeout');
      h.deliverToCalleeSocket('call_timeout', { sessionId: sid });
      const data = await timeout;
      expect(data).toMatchObject({ sessionId: sid });
    });
  });

  // ── Busy ──────────────────────────────────────────────────────────────────────

  describe('Busy', () => {
    it('call_busy delivered to caller → service emits call_busy internally', async () => {
      const busy = waitForServiceEvent(h.callerService, 'call_busy');
      h.deliverToCallerSocket('call_busy', { targetUserId: 'user-B' });
      const data = await busy;
      expect(data).toMatchObject({ targetUserId: 'user-B' });
    });
  });

  // ── FIX3: ICE buffering ───────────────────────────────────────────────────────

  describe('FIX3 (ICE buffering): candidates before remoteDescription are buffered', () => {
    it('addIceCandidate is NOT called before setRemoteDescription; candidates flush after', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      await h.callerService.createPeerConnection(sid, ICE_SERVERS);

      const pc = (h.callerService as unknown as Record<string, unknown>).peerConnection as {
        addIceCandidate: jest.Mock;
        _remoteDescriptionSet: boolean;
        setRemoteDescription: (sdp: unknown) => Promise<void>;
      };

      // Inject ICE candidate BEFORE setRemoteDescription
      await (h.callerService as unknown as {
        handleRemoteIceCandidate: (d: unknown) => Promise<void>;
      }).handleRemoteIceCandidate({ candidate: { candidate: 'cand-early', sdpMid: '0', sdpMLineIndex: 0 } });

      // addIceCandidate should NOT have been called yet
      expect(pc.addIceCandidate).not.toHaveBeenCalled();

      // pendingIceCandidates should have 1 entry
      const pending = (h.callerService as unknown as Record<string, unknown>).pendingIceCandidates as unknown[];
      expect(pending.length).toBe(1);

      // Simulate handleRemoteAnswer which calls setRemoteDescription then flushPendingIceCandidates
      await (h.callerService as unknown as {
        handleRemoteAnswer: (d: unknown) => Promise<void>;
      }).handleRemoteAnswer({ sessionId: sid, sdp: 'sdp-answer' });
      await flushMicrotasks();

      // After flush, addIceCandidate should have been called with the buffered candidate
      expect(pc.addIceCandidate).toHaveBeenCalledTimes(1);
    });
  });

  // ── FIX4: callee audio routing ────────────────────────────────────────────────

  describe('FIX4 (callee audio routing): acceptCall calls setVoiceMode', () => {
    it('acceptCall() invokes InCallManager.start (via callAudioService.setVoiceMode)', () => {
      InCallManagerMock.default.start.mockClear();

      const sid = 'test-session-audio';
      h.calleeService.acceptCall(sid);

      expect(InCallManagerMock.default.start).toHaveBeenCalledWith({ media: 'audio' });
    });
  });

  // ── Glare guard ───────────────────────────────────────────────────────────────

  describe('Glare guard: initiator ignores echoed offer', () => {
    it('handleRemoteOffer on initiator side is a no-op (setRemoteDescription not called)', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      await h.callerService.createPeerConnection(sid, ICE_SERVERS);

      const pc = (h.callerService as unknown as Record<string, unknown>).peerConnection as {
        setRemoteDescription: jest.Mock;
      };
      jest.spyOn(pc, 'setRemoteDescription');

      // Deliver a call_offer to the caller side — should be ignored (glare guard)
      await (h.callerService as unknown as {
        handleRemoteOffer: (d: unknown) => Promise<void>;
      }).handleRemoteOffer({ sessionId: sid, sdp: 'sdp-offer' });

      expect(pc.setRemoteDescription).not.toHaveBeenCalled();
    });
  });

  // ── C1: remote_stream reaches both sides (happy-path end-to-end) ────────────

  describe('C1 (remote_stream): both sides receive remote_stream after full SDP exchange', () => {
    /**
     * This test proves that the 'track' listener in WebRTCService (~line 322)
     * correctly emits 'remote_stream' for both caller and callee after the SDP
     * handshake completes end-to-end through the relay bus.
     *
     * Flow:
     *  1. Caller initiateCall → callee incoming_call
     *  2. Caller createPeerConnection (isInitiator=true)
     *  3. Callee createPeerConnection (so PC is ready before accept)
     *  4. Callee acceptCall → caller receives call_accepted
     *  5. Caller sendOfferWhenReady → createAndSendOffer → socket emits call_offer
     *  6. Bus relays call_offer → callee handleRemoteOffer → setRemoteDescription
     *     → mock fires 'track' (queueMicrotask) → callee emits 'remote_stream'
     *  7. handleRemoteOffer creates answer → socket emits call_answer
     *  8. Bus relays call_answer → caller handleRemoteAnswer → setRemoteDescription
     *     → mock fires 'track' (queueMicrotask) → caller emits 'remote_stream'
     *
     * Fail-ability: removing the 'track' addEventListener in WebRTCService
     * (~line 322) would stop 'remote_stream' from ever being emitted, causing
     * both waitForCallerEvent('remote_stream') and waitForCalleeEvent('remote_stream')
     * to time out and reject — the test would FAIL. It does NOT merely assert on
     * the mock itself.
     */
    it('callee emits remote_stream after receiving call_offer (callee side)', async () => {
      // Set up: caller initiates, both sides build peer connections
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as {
        sessionId: string;
        iceServers: { urls: string }[];
      };
      const sid = callerInitData.sessionId;
      const iceServers = callerInitData.iceServers;

      // Build PCs for both sides before accepting
      await h.callerService.createPeerConnection(sid, iceServers);
      await h.calleeService.createPeerConnection(sid, iceServers);

      // Register listener BEFORE triggering the action that will fire the event
      const calleeRemoteStream = h.waitForCalleeEvent('remote_stream');

      // Callee accepts → caller gets call_accepted → createAndSendOffer → offer relay
      h.calleeService.acceptCall(sid);
      await h.waitForCallerEvent('call_accepted');

      // Await callee's remote_stream (arrives after offer → setRemoteDescription → 'track')
      const stream = await calleeRemoteStream;
      expect(stream).toBeTruthy();
    });

    it('caller emits remote_stream after receiving call_answer (caller side)', async () => {
      // Set up: same as above, but we await CALLER's remote_stream
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as {
        sessionId: string;
        iceServers: { urls: string }[];
      };
      const sid = callerInitData.sessionId;
      const iceServers = callerInitData.iceServers;

      await h.callerService.createPeerConnection(sid, iceServers);
      await h.calleeService.createPeerConnection(sid, iceServers);

      // Register listener BEFORE triggering
      const callerRemoteStream = h.waitForCallerEvent('remote_stream');

      h.calleeService.acceptCall(sid);
      await h.waitForCallerEvent('call_accepted');

      // Await caller's remote_stream (arrives after answer → setRemoteDescription → 'track')
      const stream = await callerRemoteStream;
      expect(stream).toBeTruthy();
    });

    it('both sides receive remote_stream in a single end-to-end exchange', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as {
        sessionId: string;
        iceServers: { urls: string }[];
      };
      const sid = callerInitData.sessionId;
      const iceServers = callerInitData.iceServers;

      await h.callerService.createPeerConnection(sid, iceServers);
      await h.calleeService.createPeerConnection(sid, iceServers);

      // Register BOTH listeners before triggering anything
      const callerRemoteStream = h.waitForCallerEvent('remote_stream');
      const calleeRemoteStream = h.waitForCalleeEvent('remote_stream');

      h.calleeService.acceptCall(sid);
      await h.waitForCallerEvent('call_accepted');

      // Both sides must resolve — neither may time out
      const [callerStream, calleeStream] = await Promise.all([
        callerRemoteStream,
        calleeRemoteStream,
      ]);
      expect(callerStream).toBeTruthy();
      expect(calleeStream).toBeTruthy();
    });
  });

  // ── FIX5: callee buffers offer + ICE that race ahead of PC build ──────────────

  describe('FIX5 (callee race): offer + ICE arriving before PC is built are buffered & replayed', () => {
    /**
     * Reproduces the dead-air bug found in 2-device testing (2026-06-04):
     * the caller fires its offer (and trickles ICE) the instant call_accepted
     * reaches it, but the callee's getUserMedia + createPeerConnection are still
     * in flight. The offer hit `if (!this.peerConnection) return;` and was
     * dropped → callee never answered → no media despite perfect signaling.
     *
     * Unlike the C1 tests, the callee PC is built AFTER the offer/ICE arrive,
     * which is the real-world ordering on a slow device.
     *
     * Fail-ability: reverting handleRemoteOffer to a bare early-return (no
     * buffering) makes pendingRemoteOffer stay null and the callee never emits
     * remote_stream → the final await times out and the test FAILS.
     */
    it('offer arriving before callee PC exists is parked, then processed on createPeerConnection', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as {
        sessionId: string;
        iceServers: { urls: string }[];
      };
      const sid = callerInitData.sessionId;
      const iceServers = callerInitData.iceServers;

      await h.callerService.createPeerConnection(sid, iceServers);

      // Callee accepts but DOES NOT build its PC yet (simulating getUserMedia
      // still resolving). isInitiator=false is set by acceptCall.
      h.calleeService.acceptCall(sid);
      await h.waitForCallerEvent('call_accepted');
      // The caller's offer has now been relayed to the callee, whose PC is null.
      await flushMicrotasks();

      // Offer must be parked, not dropped; setRemoteDescription not called yet.
      const parked = (h.calleeService as unknown as Record<string, unknown>)
        .pendingRemoteOffer;
      expect(parked).not.toBeNull();

      // Now the callee finishes building its PC → parked offer is replayed →
      // setRemoteDescription fires 'track' → remote_stream emitted.
      const calleeRemoteStream = h.waitForCalleeEvent('remote_stream');
      await h.calleeService.createPeerConnection(sid, iceServers);

      const stream = await calleeRemoteStream;
      expect(stream).toBeTruthy();

      // Offer buffer drained after processing.
      const afterParked = (h.calleeService as unknown as Record<string, unknown>)
        .pendingRemoteOffer;
      expect(afterParked).toBeNull();
    });

    it('ICE candidate arriving before callee PC exists is buffered, not dropped', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as {
        sessionId: string;
      };
      const sid = callerInitData.sessionId;

      // Callee is non-initiator, no PC yet.
      h.calleeService.acceptCall(sid);

      // Deliver an ICE candidate to the callee before its PC exists.
      await (h.calleeService as unknown as {
        handleRemoteIceCandidate: (d: unknown) => Promise<void>;
      }).handleRemoteIceCandidate({
        candidate: { candidate: 'cand-pre-pc', sdpMid: '0', sdpMLineIndex: 0 },
      });

      // Must be buffered (no PC to add it to, and no remote description yet).
      const pending = (h.calleeService as unknown as Record<string, unknown>)
        .pendingIceCandidates as unknown[];
      expect(pending.length).toBe(1);
    });
  });

  // ── ICE auto-recovery bug (KNOWN BUG — skip) ──────────────────────────────────

  describe.skip('ICE auto-recovery on transient network blip (KNOWN BUG — currently broken)', () => {
    /**
     * KNOWN BUG (not yet fixed):
     *
     * Fix requires TWO separate changes, not one:
     *
     * (a) SERVICE-LEVEL STATE: The ICE restart branch checks:
     *       if (state === 'failed' && this.callState === 'active')
     *     But this.callState is NEVER set to 'active' in WebRTCService — only
     *     transition('active') would do that, and it is never called. The
     *     remote_stream listener in useWebRTC calls setCallState('active') on
     *     the React side, but that does NOT call service.transition('active').
     *     Until transition('active') is called from within WebRTCService when
     *     the remote stream arrives (~line 322-327), the ICE restart guard is
     *     permanently dead code (callState is always 'connecting', never 'active').
     *
     * (b) TEARDOWN RACE: Even if (a) is fixed, the 'connectionstatechange'
     *     listener emits 'peer_disconnected' on 'failed' | 'disconnected' (see
     *     ~line 330-336). useWebRTC maps 'peer_disconnected' directly to
     *     setState('ended'), tearing down the call UI immediately. This races
     *     against the ICE restart attempt — the UI is destroyed before the
     *     restart can succeed. The listener must be made ICE-restart-aware
     *     (e.g. suppress 'peer_disconnected' while a restart is in flight) so
     *     the recover path is not cut off by a premature teardown.
     *
     * Both (a) and (b) must be fixed together; fixing only (a) still results
     * in a broken experience because the hook tears down the UI anyway.
     *
     * Expected behavior (when fully fixed):
     *  1. Active call experiences network blip
     *  2. ICE connection state → 'failed'
     *  3. Because callState === 'active', service attempts ICE restart (up to 3x)
     *  4. 'peer_disconnected' is NOT emitted during the restart window
     *  5. ICE restart succeeds → iceConnectionState → 'connected' → iceRestartCount reset
     *  6. Call resumes without user noticing
     */
    it('ICE blip → restart attempted → recover to active (currently dead code)', async () => {
      h.callerService.initiateCall('user-B', 'conv-1', 'audio');
      const callerInitData = (await h.waitForCallerEvent('call_initiated')) as { sessionId: string };
      const sid = callerInitData.sessionId;

      await h.callerService.getLocalStream('audio');
      await h.callerService.createPeerConnection(sid, ICE_SERVERS);

      const pc = (h.callerService as unknown as Record<string, unknown>).peerConnection as {
        _fire: (event: string, data: unknown) => void;
        iceConnectionState: string;
        createOffer: jest.Mock;
      };

      const createOfferSpy = jest.spyOn(pc, 'createOffer');

      // Simulate ICE failure
      pc.iceConnectionState = 'failed';
      pc._fire('iceconnectionstatechange', undefined);
      await flushMicrotasks();

      // This assertion FAILS because callState is never 'active':
      // callState must be 'active' for the ICE restart branch to execute
      expect(createOfferSpy).toHaveBeenCalledWith({ iceRestart: true });
    });
  });

  // ── 7.6: Safe-dispose on reconnect — held disconnected socket (see tasks.md) ──

  describe('7.6 Safe reconnect: held disconnected socket is disposed before creating a new one', () => {
    it('connect(token) disposes a held disconnected socket before creating a new one', () => {
      const svc = new WebRTCService() as unknown as {
        connect: (t: string) => void;
        socket: { connected: boolean; removeAllListeners: jest.Mock; disconnect: jest.Mock } | null;
      };
      // Stub io-dispatched listeners so construction does not explode
      svc.connect('tok-1');
      const firstSocket = svc.socket!;
      firstSocket.connected = false;
      const spyRemove = firstSocket.removeAllListeners;
      const spyDisc = firstSocket.disconnect;

      svc.connect('tok-2');
      expect(spyRemove).toHaveBeenCalled();
      expect(spyDisc).toHaveBeenCalled();
      expect(svc.socket).not.toBe(firstSocket);
      // New socket has listeners attached (connected flag irrelevant — just check distinct)
      expect(typeof (svc.socket as unknown as { on: unknown }).on).toBe('function');
      // Cleanup
      (svc as unknown as { disconnect: () => void }).disconnect();
    });

    it('connect(token) early-returns when socket is already connected', () => {
      const svc = new WebRTCService() as unknown as {
        connect: (t: string) => void;
        socket: { connected: boolean; removeAllListeners: jest.Mock; disconnect: jest.Mock } | null;
      };
      svc.connect('tok-1');
      const firstSocket = svc.socket!;
      firstSocket.connected = true;
      const spyRemove = firstSocket.removeAllListeners;
      spyRemove.mockClear();
      svc.connect('tok-2');
      expect(spyRemove).not.toHaveBeenCalled();
      expect(svc.socket).toBe(firstSocket);
      (svc as unknown as { disconnect: () => void }).disconnect();
    });
  });
});
