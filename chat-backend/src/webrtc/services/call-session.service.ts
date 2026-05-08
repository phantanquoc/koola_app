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
}

const SESSION_TTL = 3600; // seconds
const TIMEOUT_TTL = 60; // seconds
const MAX_PARTICIPANTS = 8;
const INITIATED_SESSIONS_KEY = 'initiated_sessions';

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
  }): Promise<CallSession> {
    const sessionId = uuidv4();
    const session: CallSession = {
      sessionId,
      initiatorId: params.initiatorId,
      targetUserId: params.targetUserId,
      conversationId: params.conversationId,
      callType: params.callType,
      state: 'initiated',
      createdAt: new Date().toISOString(),
      participantCount: 1,
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
        .zadd(INITIATED_SESSIONS_KEY, Date.now(), sessionId),
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

  async updateSessionState(sessionId: string, state: CallState): Promise<void> {
    const key = `call:${sessionId}`;
    await this.redis.getClient().hset(key, 'state', state);

    if (
      state === 'active' ||
      state === 'declined' ||
      state === 'missed' ||
      state === 'ended'
    ) {
      await Promise.all([
        this.redis.getClient().del(`call_timeout:${sessionId}`),
        this.redis.getClient().zrem(INITIATED_SESSIONS_KEY, sessionId),
      ]);
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
   * Returns all sessionIds from the active_calls index for a given user.
   */
  async getActiveSessionIds(userId: string): Promise<string[]> {
    return this.redis.getClient().smembers(`active_calls:${userId}`);
  }

  /**
   * Finds sessions that have been in 'initiated' state beyond the timeout threshold
   * and marks them as 'missed'. Returns the sessions that were cleaned up.
   * Used by CallSessionCronService as a safety-net for server-restart scenarios.
   */
  async cleanupStaleSessions(): Promise<CallSession[]> {
    const cutoff = Date.now() - TIMEOUT_TTL * 1000;
    const staleSessionIds = await this.redis
      .getClient()
      .zrangebyscore(INITIATED_SESSIONS_KEY, 0, cutoff);

    const cleaned: CallSession[] = [];

    for (const sessionId of staleSessionIds) {
      const session = await this.getSession(sessionId);

      // Session expired from Redis or already transitioned
      if (!session || session.state !== 'initiated') {
        await this.redis.getClient().zrem(INITIATED_SESSIONS_KEY, sessionId);
        continue;
      }

      await this.updateSessionState(sessionId, 'missed');
      if (session.initiatorId && session.targetUserId) {
        await this.removeActiveCallIndex(
          session.initiatorId,
          session.targetUserId,
          sessionId,
        );
      }
      cleaned.push(session);
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
