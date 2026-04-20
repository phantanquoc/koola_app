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

    const result = await service.hasExistingSession('user-A', 'user-B', 'conv-1');

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

    const result = await service.hasExistingSession('user-A', 'user-B', 'conv-1');

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
      conversationId: 'conv-OTHER',  // different conversation
      callType: 'audio',
      state: 'active',
      createdAt: new Date().toISOString(),
      participantCount: '2',
    });

    const result = await service.hasExistingSession('user-A', 'user-B', 'conv-1');

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

    const result = await service.hasExistingSession('user-A', 'user-B', 'conv-1');

    expect(result).toBeNull();
    expect(mockClient.smembers).toHaveBeenCalledWith('active_calls:user-A');
    expect(mockClient.hgetall).toHaveBeenCalledWith(`call:${staleSessionId}`);
    // stale entry must be cleaned up from the Set
    expect(mockClient.srem).toHaveBeenCalledWith('active_calls:user-A', staleSessionId);
  });
});
