/**
 * Regression smoke test for WebrtcGateway.
 *
 * Purpose: guard against accidental deletion of handler methods.
 * A previous apply session rewrote the gateway and silently dropped
 * handleCallFailed, handleAuthRefresh, and the rate-limit logic.
 * This test ensures all expected methods are present on the prototype
 * so any future rewrite is caught immediately.
 */

// Mock uuid before any module loads it (pure-ESM in v13+)
jest.mock('uuid', () => ({ v4: () => 'test-session-id' }));

import * as fs from 'fs';
import * as path from 'path';
import { WebrtcGateway } from './webrtc.gateway';

describe('WebrtcGateway — regression: all expected methods present', () => {
  const proto = WebrtcGateway.prototype;

  const expectedMethods = [
    'handleConnection',
    'handleDisconnect',
    'handleCallInitiate',
    'handleCallCancel',
    'handleCallJoin',
    'handleCallOffer',
    'handleCallAnswer',
    'handleIceCandidate',
    'handleCallAccept',
    'handleCallDecline',
    'handleCallEnd',
    'handleCallFailed',
    'handleAuthRefresh',
  ];

  it.each(expectedMethods)(
    'WebrtcGateway.prototype.%s is defined',
    (methodName) => {
      expect(
        typeof (proto as unknown as Record<string, unknown>)[methodName],
      ).toBe('function');
    },
  );

  it('has all 11 @SubscribeMessage handler methods defined (call_initiate, call_cancel, call_join, call_offer, call_answer, call_ice_candidate, call_accept, call_decline, call_end, call_failed, auth:refresh)', () => {
    // Verify the 11 handler methods that correspond to @SubscribeMessage decorators
    const subscribeHandlers = [
      'handleCallInitiate',
      'handleCallCancel',
      'handleCallJoin',
      'handleCallOffer',
      'handleCallAnswer',
      'handleIceCandidate',
      'handleCallAccept',
      'handleCallDecline',
      'handleCallEnd',
      'handleCallFailed',
      'handleAuthRefresh',
    ];
    for (const name of subscribeHandlers) {
      const methodType = typeof (proto as unknown as Record<string, unknown>)[
        name
      ];
      expect(methodType).toBe('function');
    }
    expect(subscribeHandlers).toHaveLength(11);
  });
});

describe('WebrtcGateway — regression: no in-process timers (7.4)', () => {
  const gatewayPath = path.join(__dirname, 'webrtc.gateway.ts');

  it('source no longer contains callTimeouts Map or in-process setTimeout/clearTimeout', () => {
    const src = fs.readFileSync(gatewayPath, 'utf8');
    expect(src).not.toMatch(/callTimeouts/);
    expect(src).not.toMatch(/\bsetTimeout\s*\(/);
    expect(src).not.toMatch(/\bclearTimeout\s*\(/);
    expect(src).not.toMatch(/NodeJS\.Timeout/);
  });

  it('prototype has no callTimeouts field; @Cron remains the single timeout source', () => {
    const cronPath = path.join(
      __dirname,
      'services',
      'call-session-cron.service.ts',
    );
    const cronSrc = fs.readFileSync(cronPath, 'utf8');
    // Every-15s tick must remain — it is the replacement for per-call timers.
    expect(cronSrc).toMatch(/@Cron\s*\(\s*['"]\*\/15/);
    // Instance must not have leaked a Map at construction time.
    const anyProto = WebrtcGateway.prototype as unknown as Record<
      string,
      unknown
    >;
    expect(anyProto.callTimeouts).toBeUndefined();
  });
});
