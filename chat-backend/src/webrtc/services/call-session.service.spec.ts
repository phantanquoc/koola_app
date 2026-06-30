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
    expect(mockClient.srem).toHaveBeenCalledWith('active_calls:user-A', 'sess-1');
    expect(mockClient.srem).toHaveBeenCalledWith('active_calls:user-B', 'sess-1');
  });

  it('removes the active_calls index on missed and ended', async () => {
    mockClient.hgetall.mockResolvedValue(hashFor('initiated'));

    await service.updateSessionState('sess-1', 'missed');
    expect(mockClient.srem).toHaveBeenCalledWith('active_calls:user-A', 'sess-1');

    mockClient.srem.mockClear();
    await service.updateSessionState('sess-1', 'ended');
    expect(mockClient.srem).toHaveBeenCalledWith('active_calls:user-B', 'sess-1');
  });

  it('does NOT touch the active_calls index for non-terminal active state', async () => {
    await service.updateSessionState('sess-1', 'active');
    // active still clears timeout/initiated-zset but must not srem the index
    // (and must not even fetch the session to do so).
    expect(mockClient.srem).not.toHaveBeenCalled();
  });
});
