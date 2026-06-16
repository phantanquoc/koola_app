/**
 * callHarness.ts
 *
 * In-memory relay bus simulating the /webrtc namespace for 2-client 1-1 call tests.
 *
 * This harness models the relay rules of WebrtcGateway for the 1-1 call path.
 *
 * KEY DESIGN: Outbound vs Inbound separation
 *  - Outbound events (service → server): intercepted by wrapping socket.emit
 *    with a jest.fn mock that calls the original AND calls the relay handler.
 *  - Inbound events (server → service): delivered by calling EventEmitter.prototype.emit
 *    DIRECTLY on the socket's EventEmitter base, bypassing the outbound interceptor.
 *  This prevents the infinite loop where a delivered (inbound) event would be
 *  re-intercepted as an outbound event and re-relayed back.
 *
 * IMPORTANT: This is a simplified simulation of the relay rules, NOT a test of
 * the gateway itself. The backend sequence spec (webrtc.gateway.sequence.spec.ts)
 * is the authoritative test that the real gateway honours this contract.
 */

import { EventEmitter } from 'events';
import { WebRTCService } from './WebRTCService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FakeSocket extends EventEmitter {
  emit: (event: string, ...args: unknown[]) => boolean;
  connected: boolean;
  id: string;
}

export interface CallHarnessResult {
  callerService: WebRTCService;
  calleeService: WebRTCService;
  callerSocket: FakeSocket;
  calleeSocket: FakeSocket;
  /** Wait for a specific event on the caller service */
  waitForCallerEvent: (event: string, timeoutMs?: number) => Promise<unknown>;
  /** Wait for a specific event on the callee service */
  waitForCalleeEvent: (event: string, timeoutMs?: number) => Promise<unknown>;
  /** Directly simulate a server→client event on the caller socket (inbound) */
  deliverToCallerSocket: (event: string, data: unknown) => void;
  /** Directly simulate a server→client event on the callee socket (inbound) */
  deliverToCalleeSocket: (event: string, data: unknown) => void;
}

// ─── Session state tracked by the bus ────────────────────────────────────────

interface BusSession {
  sessionId: string;
  initiatorId: string;
  targetUserId: string;
  callType: string;
  participants: Set<string>;
}

// ─── Relay bus ────────────────────────────────────────────────────────────────

export function buildCallHarness(): CallHarnessResult {
  // Create raw EventEmitter sockets
  const callerSocket = new EventEmitter() as FakeSocket;
  callerSocket.connected = true;
  callerSocket.id = 'socket-caller';

  const calleeSocket = new EventEmitter() as FakeSocket;
  calleeSocket.connected = true;
  calleeSocket.id = 'socket-callee';

  let session: BusSession | null = null;

  const fakeIceServers = [{ urls: 'stun:mock.stun.test:3478' }];

  /**
   * Deliver an inbound event (server → client) directly to the socket's
   * EventEmitter listeners, bypassing the outbound interceptor.
   * Async (queueMicrotask) so tests can register listeners after triggering actions.
   */
  function deliverToCaller(event: string, data: unknown): void {
    queueMicrotask(() => {
      EventEmitter.prototype.emit.call(callerSocket, event, data);
    });
  }

  function deliverToCallee(event: string, data: unknown): void {
    queueMicrotask(() => {
      EventEmitter.prototype.emit.call(calleeSocket, event, data);
    });
  }

  /**
   * Route an outbound event (emitted BY the service via socket.emit).
   * This is called by the intercepted emit function.
   */
  function routeOutbound(
    fromUserId: string,
    event: string,
    data: unknown,
    selfDelivery: (e: string, d: unknown) => void,
    otherDelivery: (e: string, d: unknown) => void,
  ): void {
    if (event === 'call_initiate') {
      const d = data as { targetUserId: string; conversationId: string; callType: string };
      const sessionId = `session-${Date.now()}`;
      session = {
        sessionId,
        initiatorId: fromUserId,
        targetUserId: d.targetUserId,
        callType: d.callType,
        participants: new Set([fromUserId]),
      };
      selfDelivery('call_initiated', {
        sessionId,
        iceServers: fakeIceServers,
        targetUserId: d.targetUserId,
        callType: d.callType,
        remoteUser: { userId: d.targetUserId, displayName: 'Callee' },
      });
      otherDelivery('incoming_call', {
        sessionId,
        fromUserId,
        fromUser: { userId: fromUserId, displayName: 'Caller' },
        callType: d.callType,
        conversationId: d.conversationId,
        iceServers: fakeIceServers,
      });
    } else if (event === 'call_accept') {
      const d = data as { sessionId: string };
      if (!session || session.sessionId !== d.sessionId) return;
      session.participants.add(fromUserId);
      otherDelivery('call_accepted', { sessionId: d.sessionId });
    } else if (event === 'call_cancel') {
      const d = data as { sessionId: string };
      otherDelivery('call_cancelled', { sessionId: d.sessionId });
      session = null;
    } else if (event === 'call_decline') {
      const d = data as { sessionId: string };
      otherDelivery('call_declined', { sessionId: d.sessionId, reason: 'User declined' });
      session = null;
    } else if (event === 'call_end') {
      const d = data as { sessionId: string };
      selfDelivery('call_ended', { sessionId: d.sessionId });
      otherDelivery('call_ended', { sessionId: d.sessionId });
      session = null;
    } else if (event === 'call_offer') {
      // Offer goes to the OTHER party only
      otherDelivery('call_offer', data);
    } else if (event === 'call_answer') {
      otherDelivery('call_answer', data);
    } else if (event === 'call_ice_candidate') {
      otherDelivery('call_ice_candidate', data);
    } else if (event === 'call_ringing') {
      otherDelivery('call_ringing', data);
    } else if (event === 'call_failed') {
      otherDelivery('call_failed', data);
      selfDelivery('call_ended', data);
      session = null;
    }
  }

  // Build intercepted emit functions for each socket.
  // The intercepted emit only calls routeOutbound — it does NOT fire local socket
  // listeners because the service does not need to hear its own outbound events.
  // Inbound events (server → service) are delivered via deliverToCaller/deliverToCallee
  // which call EventEmitter.prototype.emit directly, bypassing this interceptor.
  //
  // NOTE: We deliberately do NOT call callerOriginalEmit here because some events
  // share names in both directions (e.g. call_offer, call_answer, call_ringing) and
  // firing the outbound emit locally would trigger the service's inbound listener,
  // causing an infinite relay loop.

  callerSocket.emit = jest.fn((event: string, ...args: unknown[]): boolean => {
    routeOutbound('user-A', event, args[0], deliverToCaller, deliverToCallee);
    return true;
  }) as typeof callerSocket.emit;

  calleeSocket.emit = jest.fn((event: string, ...args: unknown[]): boolean => {
    routeOutbound('user-B', event, args[0], deliverToCallee, deliverToCaller);
    return true;
  }) as typeof calleeSocket.emit;

  // Create two independent WebRTCService instances
  const callerService = new WebRTCService();
  const calleeService = new WebRTCService();

  // Inject fake sockets into services
  (callerService as unknown as Record<string, unknown>).socket = callerSocket;
  (calleeService as unknown as Record<string, unknown>).socket = calleeSocket;

  // Wire up socket listeners (private method, accessed via cast)
  (callerService as unknown as { setupSocketListeners: () => void }).setupSocketListeners();
  (calleeService as unknown as { setupSocketListeners: () => void }).setupSocketListeners();

  // ─── Utility: wait for a service-level event ─────────────────────────────────

  function waitForServiceEvent(
    service: WebRTCService,
    event: string,
    timeoutMs = 2000,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        service.off(event, handler);
        reject(new Error(`Timeout waiting for service event "${event}"`));
      }, timeoutMs);

      function handler(...args: unknown[]) {
        clearTimeout(timer);
        service.off(event, handler);
        resolve(args[0]);
      }

      service.on(event, handler);
    });
  }

  return {
    callerService,
    calleeService,
    callerSocket,
    calleeSocket,
    waitForCallerEvent: (event, timeoutMs) =>
      waitForServiceEvent(callerService, event, timeoutMs),
    waitForCalleeEvent: (event, timeoutMs) =>
      waitForServiceEvent(calleeService, event, timeoutMs),
    deliverToCallerSocket: deliverToCaller,
    deliverToCalleeSocket: deliverToCallee,
  };
}
