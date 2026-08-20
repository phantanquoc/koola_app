// uuid v13 is pure-ESM and cannot be loaded by Jest's CommonJS runtime.
// Mock it before any module under test loads it.
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { Test, TestingModule } from '@nestjs/testing';
import { CallSessionService } from './call-session.service';
import { RedisService } from '../../common/redis/redis.service';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake ioredis-style pipeline whose exec() resolves immediately.
 * Individual queued commands (sadd, expire) are no-ops that return the pipeline.
 */
function makeMockPipeline() {
  const pipeline = {
    sadd: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };
  return pipeline;
}

/**
 * Build a minimal mock of the ioredis Redis client.
 */
function makeMockRedisClient(overrides: Record<string, jest.Mock> = {}) {
  return {
    pipeline: jest.fn().mockReturnValue(makeMockPipeline()),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    hgetall: jest.fn().mockResolvedValue({}),
    hset: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue('OK'),
    scard: jest.fn().mockResolvedValue(0),
    hincrby: jest.fn().mockResolvedValue(1),
    zrem: jest.fn().mockResolvedValue(1),
    zadd: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    eval: jest.fn().mockResolvedValue(1),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('CallSessionService — hasExistingSession', () => {
  let service: CallSessionService;
  let mockClient: ReturnType<typeof makeMockRedisClient>;

  beforeEach(async () => {
    mockClient = makeMockRedisClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallSessionService,
        {
          provide: RedisService,
          useValue: {
            getClient: () => mockClient,
          },
        },
      ],
    }).compile();

    service = module.get<CallSessionService>(CallSessionService);
  });

  // ── Case 1: empty Set ────────────────────────────────────────────────────

  it('returns null when the active_calls Set is empty', async () => {
    // smembers returns [] — no sessions indexed for this user
    mockClient.smembers.mockResolvedValue([]);

    const result = await service.hasExistingSession(
      'user-A',
      'user-B',
      'conv-1',
    );

    expect(result).toBeNull();
    expect(mockClient.smembers).toHaveBeenCalledWith('active_calls:user-A');
    // hgetall must NOT have been called — no sessions to look up
    expect(mockClient.hgetall).not.toHaveBeenCalled();
  });

  // ── Case 2: matching session ─────────────────────────────────────────────

  it('returns sessionId when a matching active session exists', async () => {
    const sessionId = 'sess-abc';
    mockClient.smembers.mockResolvedValue([sessionId]);
    mockClient.hgetall.mockResolvedValue({
      sessionId,
      initiatorId: 'user-A',
      targetUserId: 'user-B',
      conversationId: 'conv-1',
      callType: 'video',
      state: 'initiated',
      createdAt: new Date().toISOString(),
      participantCount: '1',
    });

    const result = await service.hasExistingSession(
      'user-A',
      'user-B',
      'conv-1',
    );

    expect(result).toBe(sessionId);
    expect(mockClient.smembers).toHaveBeenCalledWith('active_calls:user-A');
    expect(mockClient.hgetall).toHaveBeenCalledWith(`call:${sessionId}`);
    // srem must NOT have been called — hash was found (not stale)
    expect(mockClient.srem).not.toHaveBeenCalled();
  });

  // ── Case 3: non-matching session — same user, different conversation ──────

  it('returns null when Set has a session but for a different conversation', async () => {
    const sessionId = 'sess-xyz';
    mockClient.smembers.mockResolvedValue([sessionId]);
    mockClient.hgetall.mockResolvedValue({
      sessionId,
      initiatorId: 'user-A',
      targetUserId: 'user-B',
      conversationId: 'conv-OTHER', // different conversation
      callType: 'audio',
      state: 'active',
      createdAt: new Date().toISOString(),
      participantCount: '2',
    });

    const result = await service.hasExistingSession(
      'user-A',
      'user-B',
      'conv-1',
    );

    expect(result).toBeNull();
    expect(mockClient.smembers).toHaveBeenCalledWith('active_calls:user-A');
    expect(mockClient.hgetall).toHaveBeenCalledWith(`call:${sessionId}`);
    // srem must NOT have been called — hash exists, just does not match
    expect(mockClient.srem).not.toHaveBeenCalled();
  });

  // ── Case 4: stale hash — key expired, still in Set ──────────────────────

  it('gracefully returns null and removes stale entry when hash is missing', async () => {
    const staleSessionId = 'sess-stale';
    mockClient.smembers.mockResolvedValue([staleSessionId]);
    // hgetall returns {} — the hash key has expired in Redis
    mockClient.hgetall.mockResolvedValue({});

    const result = await service.hasExistingSession(
      'user-A',
      'user-B',
      'conv-1',
    );

    expect(result).toBeNull();
    expect(mockClient.smembers).toHaveBeenCalledWith('active_calls:user-A');
    expect(mockClient.hgetall).toHaveBeenCalledWith(`call:${staleSessionId}`);
    // stale entry must be cleaned up from the Set
    expect(mockClient.srem).toHaveBeenCalledWith(
      'active_calls:user-A',
      staleSessionId,
    );
  });
});

// ---------------------------------------------------------------------------
// Phantom-busy regression: getActiveSessionIds must only report GENUINELY
// live sessions and self-heal ghost index entries (declined/missed/ended or
// expired hash left behind in active_calls).
// ---------------------------------------------------------------------------

describe('CallSessionService — getActiveSessionIds (phantom-busy guard)', () => {
  let service: CallSessionService;
  let mockClient: ReturnType<typeof makeMockRedisClient>;

  beforeEach(async () => {
    mockClient = makeMockRedisClient();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallSessionService,
        { provide: RedisService, useValue: { getClient: () => mockClient } },
      ],
    }).compile();
    service = module.get<CallSessionService>(CallSessionService);
  });

  const sessionHash = (id: string, state: string) => ({
    sessionId: id,
    initiatorId: 'user-A',
    targetUserId: 'user-B',
    conversationId: 'conv-1',
    callType: 'video',
    state,
    createdAt: new Date().toISOString(),
    participantCount: '1',
  });

  it('returns empty without lookups when the index is empty', async () => {
    mockClient.smembers.mockResolvedValue([]);
    const result = await service.getActiveSessionIds('user-A');
    expect(result).toEqual([]);
    expect(mockClient.hgetall).not.toHaveBeenCalled();
    expect(mockClient.srem).not.toHaveBeenCalled();
  });

  it('returns live (initiated/active) sessions and does not prune them', async () => {
    mockClient.smembers.mockResolvedValue(['live-1', 'live-2']);
    mockClient.hgetall
      .mockResolvedValueOnce(sessionHash('live-1', 'initiated'))
      .mockResolvedValueOnce(sessionHash('live-2', 'active'));

    const result = await service.getActiveSessionIds('user-A');

    expect(result).toEqual(['live-1', 'live-2']);
    expect(mockClient.srem).not.toHaveBeenCalled();
  });

  it('drops a declined ghost from the result AND prunes it from the index', async () => {
    mockClient.smembers.mockResolvedValue(['ghost-declined', 'live-1']);
    mockClient.hgetall
      .mockResolvedValueOnce(sessionHash('ghost-declined', 'declined'))
      .mockResolvedValueOnce(sessionHash('live-1', 'initiated'));

    const result = await service.getActiveSessionIds('user-A');

    // Only the genuinely live session is reported busy.
    expect(result).toEqual(['live-1']);
    // Ghost is self-healed out of the index.
    expect(mockClient.srem).toHaveBeenCalledWith(
      'active_calls:user-A',
      'ghost-declined',
    );
  });

  it('prunes an expired-hash ghost (hgetall empty) and reports not-busy', async () => {
    mockClient.smembers.mockResolvedValue(['ghost-expired']);
    mockClient.hgetall.mockResolvedValue({});

    const result = await service.getActiveSessionIds('user-A');

    expect(result).toEqual([]);
    expect(mockClient.srem).toHaveBeenCalledWith(
      'active_calls:user-A',
      'ghost-expired',
    );
  });
});

// ---------------------------------------------------------------------------
// Terminal-state cleanup: updateSessionState must remove the active_calls
// index for declined/missed/ended (decline/missed don't go through
// endSession), so a terminal call never leaves a phantom-busy entry.
// ---------------------------------------------------------------------------

describe('CallSessionService — updateSessionState index cleanup', () => {
  let service: CallSessionService;
  let mockClient: ReturnType<typeof makeMockRedisClient>;

  beforeEach(async () => {
    mockClient = makeMockRedisClient();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallSessionService,
        { provide: RedisService, useValue: { getClient: () => mockClient } },
      ],
    }).compile();
    service = module.get<CallSessionService>(CallSessionService);
  });

  const hashFor = (state: string) => ({
    sessionId: 'sess-1',
    initiatorId: 'user-A',
    targetUserId: 'user-B',
    conversationId: 'conv-1',
    callType: 'video',
    state,
    createdAt: new Date().toISOString(),
    participantCount: '1',
  });

  it('removes the active_calls index for BOTH parties on decline', async () => {
    mockClient.hgetall.mockResolvedValue(hashFor('initiated'));

    await service.updateSessionState('sess-1', 'declined');

    expect(mockClient.hset).toHaveBeenCalledWith(
      'call:sess-1',
      'state',
      'declined',
    );
    expect(mockClient.srem).toHaveBeenCalledWith(
      'active_calls:user-A',
      'sess-1',
    );
    expect(mockClient.srem).toHaveBeenCalledWith(
      'active_calls:user-B',
      'sess-1',
    );
  });

  it('removes the active_calls index on missed and ended', async () => {
    mockClient.hgetall.mockResolvedValue(hashFor('initiated'));

    await service.updateSessionState('sess-1', 'missed');
    expect(mockClient.srem).toHaveBeenCalledWith(
      'active_calls:user-A',
      'sess-1',
    );

    mockClient.srem.mockClear();
    await service.updateSessionState('sess-1', 'ended');
    expect(mockClient.srem).toHaveBeenCalledWith(
      'active_calls:user-B',
      'sess-1',
    );
  });

  it('does NOT touch the active_calls index for non-terminal active state', async () => {
    await service.updateSessionState('sess-1', 'active');
    // active still clears timeout/initiated-zset but must not srem the index
    // (and must not even fetch the session to do so).
    expect(mockClient.srem).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7.5: deadlineAt / pending_call / cleanupStaleSessions (new surface)
// ---------------------------------------------------------------------------

describe('CallSessionService — deadlineAt + pending_call + cleanupStaleSessions', () => {
  let service: CallSessionService;
  let mockClient: ReturnType<typeof makeMockRedisClient>;

  beforeEach(async () => {
    mockClient = makeMockRedisClient({
      get: jest.fn().mockResolvedValue(null),
      eval: jest.fn().mockResolvedValue(1),
      zrangebyscore: jest.fn().mockResolvedValue([]),
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallSessionService,
        { provide: RedisService, useValue: { getClient: () => mockClient } },
      ],
    }).compile();
    service = module.get<CallSessionService>(CallSessionService);
  });

  describe('createSession deadlineAt', () => {
    it('sets deadlineAt ~30s in the future by default', async () => {
      mockClient.hgetall.mockResolvedValue({});
      const before = Date.now();
      await service.createSession({
        initiatorId: 'u1',
        targetUserId: 'u2',
        conversationId: 'conv-1',
        callType: 'audio' as never,
      });
      const after = Date.now();
      // hset was called with the hash containing deadlineAt
      const hsetCalls = mockClient.hset.mock.calls as unknown as Array<
        [string, Record<string, string>]
      >;
      const sessionArg = hsetCalls.find((c) => c[0] === 'call:mock-uuid');
      expect(sessionArg).toBeDefined();
      const deadline = Number(sessionArg![1].deadlineAt);
      expect(deadline).toBeGreaterThanOrEqual(before + 29_000);
      expect(deadline).toBeLessThanOrEqual(after + 31_000);
      // Initiated zset scored by same deadline
      expect(mockClient.zadd).toHaveBeenCalledWith(
        'initiated_sessions',
        deadline,
        'mock-uuid',
      );
    });

    it('honors explicit deadlineAt param', async () => {
      const custom = Date.now() + 25_000;
      await service.createSession({
        initiatorId: 'u1',
        targetUserId: 'u2',
        conversationId: 'conv-1',
        callType: 'audio' as never,
        deadlineAt: custom,
      });
      const hsetCalls = mockClient.hset.mock.calls as unknown as Array<
        [string, Record<string, string>]
      >;
      const sessionArg = hsetCalls.find((c) => c[0] === 'call:mock-uuid');
      expect(Number(sessionArg![1].deadlineAt)).toBe(custom);
    });
  });

  describe('updateDeadlineAt', () => {
    it('HSET deadlineAt + ZADD initiated_sessions with same score', async () => {
      const d = Date.now() + 30_000;
      await service.updateDeadlineAt('sess-1', d);
      expect(mockClient.hset).toHaveBeenCalledWith(
        'call:sess-1',
        'deadlineAt',
        String(d),
      );
      expect(mockClient.zadd).toHaveBeenCalledWith(
        'initiated_sessions',
        d,
        'sess-1',
      );
    });
  });

  describe('pending_call helpers', () => {
    it('setPendingCall stores JSON with PX TTL', async () => {
      const payload = { sessionId: 's1' };
      await service.setPendingCall('user-B', payload as never, 25_000);
      expect(mockClient.set).toHaveBeenCalledWith(
        'pending_call:user-B',
        JSON.stringify(payload),
        'PX',
        25_000,
      );
    });

    it('getPendingCall / delPendingCall delegate to correct keys', async () => {
      mockClient.get.mockResolvedValue('{"sessionId":"s1"}');
      await expect(service.getPendingCall('user-B')).resolves.toBe(
        '{"sessionId":"s1"}',
      );
      expect(mockClient.get).toHaveBeenCalledWith('pending_call:user-B');
      await service.delPendingCall('user-B');
      expect(mockClient.del).toHaveBeenCalledWith('pending_call:user-B');
    });

    it('delPendingCallIfMatches deletes only when stored sessionId matches', async () => {
      mockClient.get.mockResolvedValue(JSON.stringify({ sessionId: 's1' }));
      await service.delPendingCallIfMatches('user-B', 's1');
      expect(mockClient.del).toHaveBeenCalledWith('pending_call:user-B');
      mockClient.del.mockClear();
      mockClient.get.mockResolvedValue(JSON.stringify({ sessionId: 'other' }));
      await service.delPendingCallIfMatches('user-B', 's1');
      expect(mockClient.del).not.toHaveBeenCalled();
    });

    it('delPendingCallIfMatches deletes on malformed JSON (self-heal)', async () => {
      mockClient.get.mockResolvedValue('not-json');
      await service.delPendingCallIfMatches('user-B', 's1');
      expect(mockClient.del).toHaveBeenCalledWith('pending_call:user-B');
    });
  });

  describe('tryClaimMissed (Lua atomic)', () => {
    it('returns true when Lua returns 1, false when 0', async () => {
      mockClient.eval.mockResolvedValue(1);
      await expect(service.tryClaimMissed('sess-1', Date.now())).resolves.toBe(
        true,
      );
      expect(mockClient.eval).toHaveBeenCalled();
      mockClient.eval.mockResolvedValue(0);
      await expect(service.tryClaimMissed('sess-1', Date.now())).resolves.toBe(
        false,
      );
    });
  });

  describe('cleanupStaleSessions filtering + claim', () => {
    it('claims only initiated sessions whose deadlineAt <= now', async () => {
      const now = Date.now();
      mockClient.zrangebyscore.mockResolvedValue(['past', 'future', 'active']);
      // past: initiated, deadline in the past → should be claimed
      // future: initiated, deadline in the future → skip
      // active: active state → skip (zrem but no claim)
      mockClient.hgetall
        .mockResolvedValueOnce({
          sessionId: 'past',
          initiatorId: 'u1',
          targetUserId: 'u2',
          state: 'initiated',
          deadlineAt: String(now - 1000),
        } as never)
        // re-fetch after successful claim for 'past'
        .mockResolvedValueOnce({
          sessionId: 'past',
          initiatorId: 'u1',
          targetUserId: 'u2',
          state: 'missed',
          deadlineAt: String(now - 1000),
        } as never)
        .mockResolvedValueOnce({
          sessionId: 'future',
          initiatorId: 'u1',
          targetUserId: 'u2',
          state: 'initiated',
          deadlineAt: String(now + 60_000),
        } as never)
        .mockResolvedValueOnce({
          sessionId: 'active',
          initiatorId: 'u1',
          targetUserId: 'u2',
          state: 'active',
          deadlineAt: String(now - 1000),
        } as never);
      mockClient.eval.mockResolvedValue(1);

      const cleaned = await service.cleanupStaleSessions(now);
      expect(cleaned.map((s) => s.sessionId)).toEqual(['past']);
      expect(mockClient.eval).toHaveBeenCalledTimes(1);
    });

    it('zrem stale candidates whose hash is missing', async () => {
      const now = Date.now();
      mockClient.zrangebyscore.mockResolvedValue(['ghost']);
      mockClient.hgetall.mockResolvedValue({} as never);
      const cleaned = await service.cleanupStaleSessions(now);
      expect(cleaned).toEqual([]);
      expect(mockClient.zrem).toHaveBeenCalledWith(
        'initiated_sessions',
        'ghost',
      );
    });

    it('skips a candidate when atomic claim loses the race (Lua returns 0)', async () => {
      const now = Date.now();
      mockClient.zrangebyscore.mockResolvedValue(['raced']);
      mockClient.hgetall.mockResolvedValue({
        sessionId: 'raced',
        initiatorId: 'u1',
        targetUserId: 'u2',
        state: 'initiated',
        deadlineAt: String(now - 1000),
      } as never);
      mockClient.eval.mockResolvedValue(0);
      const cleaned = await service.cleanupStaleSessions(now);
      expect(cleaned).toEqual([]);
    });

    it('simulated double-tick on the same session claims it exactly once (7.4 atomic-claim invariant)', async () => {
      const now = Date.now();
      // Both ticks observe the same candidate in the zset.
      mockClient.zrangebyscore.mockResolvedValue(['dup']);
      // First tick reads initiated; after the Lua claim flips state, the
      // second tick's re-read sees 'missed' and must skip.
      mockClient.hgetall
        .mockResolvedValueOnce({
          sessionId: 'dup',
          initiatorId: 'u1',
          targetUserId: 'u2',
          state: 'initiated',
          deadlineAt: String(now - 1000),
        } as never)
        .mockResolvedValueOnce({
          sessionId: 'dup',
          initiatorId: 'u1',
          targetUserId: 'u2',
          state: 'missed',
          deadlineAt: String(now - 1000),
        } as never);
      mockClient.eval.mockResolvedValue(1);

      const first = await service.cleanupStaleSessions(now);
      const second = await service.cleanupStaleSessions(now);

      expect(first.map((s) => s.sessionId)).toEqual(['dup']);
      expect(second).toEqual([]);
      // Exactly one Lua claim across both ticks — single emit downstream.
      expect(mockClient.eval).toHaveBeenCalledTimes(1);
    });

    it('zrem candidates with non-initiated state', async () => {
      const now = Date.now();
      mockClient.zrangebyscore.mockResolvedValue(['ended']);
      mockClient.hgetall.mockResolvedValue({
        sessionId: 'ended',
        initiatorId: 'u1',
        targetUserId: 'u2',
        state: 'ended',
        deadlineAt: String(now - 1000),
      } as never);
      const cleaned = await service.cleanupStaleSessions(now);
      expect(cleaned).toEqual([]);
      expect(mockClient.zrem).toHaveBeenCalledWith(
        'initiated_sessions',
        'ended',
      );
    });
  });
});
