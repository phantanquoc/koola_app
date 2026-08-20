import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import { CallType } from '../dto/call-initiate.dto';
import { v4 as uuidv4 } from 'uuid';

export type CallState =
  | 'initiated'
  | 'active'
  | 'ended'
  | 'missed'
  | 'declined';

export interface CallSession {
  sessionId: string;
  initiatorId: string;
  targetUserId: string | null;
  conversationId: string;
  callType: CallType;
  state: CallState;
  createdAt: string;
  participantCount: number;
  /** ISO timestamp set when an FCM incoming-call push was sent for this session */
  pushSentAt?: string;
  /** Epoch millis after which the session is eligible for missed timeout */
  deadlineAt?: string;
}

const SESSION_TTL = 3600; // seconds
const TIMEOUT_TTL = 60; // seconds
const MAX_PARTICIPANTS = 8;
const INITIATED_SESSIONS_KEY = 'initiated_sessions';

export const CALL_TIMEOUT_MS = 30_000;
export const OFFLINE_PUSH_GRACE_MS = 25_000;

@Injectable()
export class CallSessionService {
  private readonly logger = new Logger(CallSessionService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Adds sessionId to the active_calls Set for both the initiator and target,
   * then sets the TTL on both Sets in a pipeline.
   */
  async createActiveCallIndex(
    initiatorId: string,
    targetId: string,
    sessionId: string,
    ttlSeconds: number,
  ): Promise<void> {
    const pipeline = this.redis.getClient().pipeline();
    pipeline.sadd(`active_calls:${initiatorId}`, sessionId);
    pipeline.expire(`active_calls:${initiatorId}`, ttlSeconds);
    pipeline.sadd(`active_calls:${targetId}`, sessionId);
    pipeline.expire(`active_calls:${targetId}`, ttlSeconds);
    await pipeline.exec();
  }

  /**
   * Removes sessionId from the active_calls Set for both the initiator and target.
   */
  async removeActiveCallIndex(
    initiatorId: string,
    targetId: string,
    sessionId: string,
  ): Promise<void> {
    await Promise.all([
      this.redis.getClient().srem(`active_calls:${initiatorId}`, sessionId),
      this.redis.getClient().srem(`active_calls:${targetId}`, sessionId),
    ]);
  }

  async createSession(params: {
    initiatorId: string;
    targetUserId: string | null;
    conversationId: string;
    callType: CallType;
    deadlineAt?: number;
  }): Promise<CallSession> {
    const sessionId = uuidv4();
    const now = Date.now();
    const deadlineAt = params.deadlineAt ?? now + CALL_TIMEOUT_MS;
    const session: CallSession = {
      sessionId,
      initiatorId: params.initiatorId,
      targetUserId: params.targetUserId,
      conversationId: params.conversationId,
      callType: params.callType,
      state: 'initiated',
      createdAt: new Date().toISOString(),
      participantCount: 1,
      deadlineAt: String(deadlineAt),
    };

    const key = `call:${sessionId}`;
    const timeoutKey = `call_timeout:${sessionId}`;
    const participantsKey = `call_participants:${sessionId}`;

    await Promise.all([
      this.redis
        .getClient()
        .hset(key, session as unknown as Record<string, string>),
      this.redis.getClient().expire(key, SESSION_TTL),
      this.redis.getClient().set(timeoutKey, 'pending', 'EX', TIMEOUT_TTL),
      this.redis.getClient().sadd(participantsKey, params.initiatorId),
      this.redis.getClient().expire(participantsKey, SESSION_TTL),
      this.redis
        .getClient()
        .zadd(INITIATED_SESSIONS_KEY, deadlineAt, sessionId),
    ]);

    // Index both users so hasExistingSession can find this session without KEYS/SCAN
    if (params.targetUserId) {
      await this.createActiveCallIndex(
        params.initiatorId,
        params.targetUserId,
        sessionId,
        SESSION_TTL,
      );
    }

    this.logger.log(`[CallSession] Created session ${sessionId}`);
    return session;
  }

  async getSession(sessionId: string): Promise<CallSession | null> {
    const data = await this.redis.getClient().hgetall(`call:${sessionId}`);
    if (!data || Object.keys(data).length === 0) return null;
    return data as unknown as CallSession;
  }

  async updateDeadlineAt(sessionId: string, deadlineAt: number): Promise<void> {
    const key = `call:${sessionId}`;
    await Promise.all([
      this.redis.getClient().hset(key, 'deadlineAt', String(deadlineAt)),
      this.redis
        .getClient()
        .zadd(INITIATED_SESSIONS_KEY, deadlineAt, sessionId),
    ]);
  }

  async setPendingCall(
    targetUserId: string,
    payload: Record<string, unknown>,
    ttlMs: number,
  ): Promise<void> {
    const key = `pending_call:${targetUserId}`;
    await this.redis.getClient().set(key, JSON.stringify(payload), 'PX', ttlMs);
  }

  async getPendingCall(targetUserId: string): Promise<string | null> {
    return this.redis.getClient().get(`pending_call:${targetUserId}`);
  }

  async delPendingCall(targetUserId: string): Promise<void> {
    await this.redis.getClient().del(`pending_call:${targetUserId}`);
  }

  async delPendingCallIfMatches(
    targetUserId: string,
    sessionId: string,
  ): Promise<void> {
    const raw = await this.getPendingCall(targetUserId);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { sessionId?: string };
      if (parsed.sessionId === sessionId) {
        await this.delPendingCall(targetUserId);
      }
    } catch {
      await this.delPendingCall(targetUserId);
    }
  }

  async tryClaimMissed(sessionId: string, now: number): Promise<boolean> {
    const script = [
      "local state = redis.call('HGET', KEYS[1], 'state')",
      "local deadline = redis.call('HGET', KEYS[1], 'deadlineAt')",
      "if state ~= 'initiated' then return 0 end",
      'if not deadline then return 0 end',
      'if tonumber(deadline) > tonumber(ARGV[1]) then return 0 end',
      "redis.call('HSET', KEYS[1], 'state', 'missed')",
      "redis.call('ZREM', KEYS[2], ARGV[2])",
      "redis.call('DEL', KEYS[3])",
      'return 1',
    ].join('\n');
    const result = await this.redis
      .getClient()
      .eval(
        script,
        3,
        `call:${sessionId}`,
        INITIATED_SESSIONS_KEY,
        `call_timeout:${sessionId}`,
        String(now),
        sessionId,
      );
    return result === 1;
  }

  async updateSessionState(sessionId: string, state: CallState): Promise<void> {
    const key = `call:${sessionId}`;

    // Terminal states no longer belong in the "waiting" structures.
    // 'declined' | 'missed' | 'ended' are the terminal CallState values;
    // 'active' means the call connected so it's no longer a pending invite.
    // (Cancel/failed paths transition via endSession, which already prunes the
    // active_calls index, so they don't reach here.)
    const isTerminal =
      state === 'declined' || state === 'missed' || state === 'ended';

    // Fetch BEFORE mutating so we still have initiatorId/targetUserId for the
    // active_calls index removal below.
    const session = isTerminal ? await this.getSession(sessionId) : null;

    await this.redis.getClient().hset(key, 'state', state);

    if (state === 'active' || isTerminal) {
      await Promise.all([
        this.redis.getClient().del(`call_timeout:${sessionId}`),
        this.redis.getClient().zrem(INITIATED_SESSIONS_KEY, sessionId),
      ]);
    }

    // Terminal states must also leave the active_calls index, otherwise the
    // entry lingers until SESSION_TTL and falsely marks the user "busy" for
    // every subsequent call (the phantom-busy bug). decline/missed transition
    // via updateSessionState directly (no endSession), so cover them here.
    if (isTerminal && session?.initiatorId && session?.targetUserId) {
      await this.removeActiveCallIndex(
        session.initiatorId,
        session.targetUserId,
        sessionId,
      );
    }

    this.logger.log(`[CallSession] Session ${sessionId} → ${state}`);
  }

  async addParticipant(sessionId: string, userId: string): Promise<boolean> {
    const participantsKey = `call_participants:${sessionId}`;
    const count = await this.redis.getClient().scard(participantsKey);
    if (count >= MAX_PARTICIPANTS) return false;

    await Promise.all([
      this.redis.getClient().sadd(participantsKey, userId),
      this.redis
        .getClient()
        .hincrby(`call:${sessionId}`, 'participantCount', 1),
    ]);
    return true;
  }

  async getParticipants(sessionId: string): Promise<string[]> {
    return this.redis.getClient().smembers(`call_participants:${sessionId}`);
  }

  async endSession(sessionId: string): Promise<void> {
    // Fetch session before state change so we have initiatorId / targetUserId
    const session = await this.getSession(sessionId);

    await Promise.all([
      this.updateSessionState(sessionId, 'ended'),
      this.redis.getClient().del(`call_participants:${sessionId}`),
    ]);

    if (session && session.initiatorId && session.targetUserId) {
      await this.removeActiveCallIndex(
        session.initiatorId,
        session.targetUserId,
        sessionId,
      );
    }

    this.logger.log(`[CallSession] Session ${sessionId} ended`);
  }

  /**
   * Records that an FCM incoming-call push was sent for this session.
   * Sets pushSentAt to the current ISO timestamp on the session hash.
   * Used for observability — not for control flow.
   */
  async markPushSent(sessionId: string): Promise<void> {
    const key = `call:${sessionId}`;
    await this.redis
      .getClient()
      .hset(key, 'pushSentAt', new Date().toISOString());
    this.logger.debug(`[CallSession] pushSentAt set for session ${sessionId}`);
  }

  /**
   * Hard-deletes all Redis keys for a session and removes it from the active-call index.
   * Intended for forced cleanup (e.g., disconnect events or admin operations).
   */
  async cleanupSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);

    await Promise.all([
      this.redis.getClient().del(`call:${sessionId}`),
      this.redis.getClient().del(`call_participants:${sessionId}`),
      this.redis.getClient().del(`call_timeout:${sessionId}`),
    ]);

    if (session && session.initiatorId && session.targetUserId) {
      await this.removeActiveCallIndex(
        session.initiatorId,
        session.targetUserId,
        sessionId,
      );
    }

    this.logger.log(`[CallSession] Session ${sessionId} cleaned up`);
  }

  async isActive(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    return session?.state === 'initiated' || session?.state === 'active';
  }

  /**
   * Returns sessionIds from the active_calls index for a user, filtered to
   * those that are GENUINELY still live (state 'initiated' or 'active').
   *
   * The index can accumulate ghost entries: a session that reached a terminal
   * state (declined/missed/ended/cancelled/failed) but whose handler updated
   * state without removing the index, or whose `call:<id>` hash already expired
   * via TTL. A ghost entry would otherwise make the busy-check (6.5/6.14) reject
   * every new call to that user for up to SESSION_TTL — the "phantom busy" bug.
   *
   * So we read each candidate's session and drop (srem) any that no longer
   * exists or is not active, self-healing the index as a side effect.
   */
  async getActiveSessionIds(userId: string): Promise<string[]> {
    const key = `active_calls:${userId}`;
    const candidates = await this.redis.getClient().smembers(key);
    if (candidates.length === 0) return candidates;

    const live: string[] = [];
    const dead: string[] = [];
    for (const sessionId of candidates) {
      const session = await this.getSession(sessionId);
      if (
        session &&
        (session.state === 'initiated' || session.state === 'active')
      ) {
        live.push(sessionId);
      } else {
        dead.push(sessionId);
      }
    }

    if (dead.length > 0) {
      await this.redis.getClient().srem(key, ...dead);
      this.logger.log(
        `[CallSession] Pruned ${dead.length} stale active_calls entr${
          dead.length === 1 ? 'y' : 'ies'
        } for user ${userId}`,
      );
    }

    return live;
  }

  /**
   * Finds sessions that have been in 'initiated' state beyond the timeout threshold
   * and marks them as 'missed'. Returns the sessions that were cleaned up.
   * Used by CallSessionCronService as a safety-net for server-restart scenarios.
   */
  async cleanupStaleSessions(now?: number): Promise<CallSession[]> {
    const nowMs = now ?? Date.now();
    const candidateIds = await this.redis
      .getClient()
      .zrangebyscore(INITIATED_SESSIONS_KEY, 0, nowMs);

    const cleaned: CallSession[] = [];

    for (const sessionId of candidateIds) {
      const session = await this.getSession(sessionId);

      if (!session) {
        await this.redis.getClient().zrem(INITIATED_SESSIONS_KEY, sessionId);
        continue;
      }
      if (session.state !== 'initiated') {
        await this.redis.getClient().zrem(INITIATED_SESSIONS_KEY, sessionId);
        continue;
      }
      const deadline = Number(
        (session as unknown as Record<string, string>).deadlineAt,
      );
      if (!deadline || deadline > nowMs) {
        continue;
      }
      const claimed = await this.tryClaimMissed(sessionId, nowMs);
      if (!claimed) continue;
      const updated = await this.getSession(sessionId);
      const missedSession = updated ?? {
        ...session,
        state: 'missed' as CallState,
      };
      if (missedSession.initiatorId && missedSession.targetUserId) {
        await this.removeActiveCallIndex(
          missedSession.initiatorId,
          missedSession.targetUserId,
          sessionId,
        );
      }
      cleaned.push(missedSession);
    }

    return cleaned;
  }

  /**
   * Returns the sessionId of an active/initiated session between initiatorId and targetUserId
   * for the given conversationId, or null if none exists.
   *
   * Uses SMEMBERS active_calls:{userId} + HGETALL per session — no KEYS/SCAN.
   * Stale entries (hash expired but still in Set) are cleaned up automatically.
   */
  async hasExistingSession(
    initiatorId: string,
    targetUserId: string,
    conversationId: string,
  ): Promise<string | null> {
    const sessionIds = await this.redis
      .getClient()
      .smembers(`active_calls:${initiatorId}`);

    for (const sessionId of sessionIds) {
      const data = await this.redis.getClient().hgetall(`call:${sessionId}`);

      // Stale entry: hash has expired but sessionId is still in the Set
      if (!data || Object.keys(data).length === 0) {
        await this.redis
          .getClient()
          .srem(`active_calls:${initiatorId}`, sessionId);
        continue;
      }

      const session = data as unknown as CallSession;
      if (
        session.initiatorId === initiatorId &&
        session.targetUserId === targetUserId &&
        session.conversationId === conversationId &&
        (session.state === 'initiated' || session.state === 'active')
      ) {
        return sessionId;
      }
    }

    return null;
  }
}
