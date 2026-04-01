import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import { CallType } from '../dto/call-initiate.dto';
import { v4 as uuidv4 } from 'uuid';

export type CallState = 'initiated' | 'active' | 'ended' | 'missed' | 'declined';

export interface CallSession {
  sessionId: string;
  initiatorId: string;
  targetUserId: string | null;
  conversationId: string;
  callType: CallType;
  state: CallState;
  createdAt: string;
  participantCount: number;
}

const SESSION_TTL = 3600; // seconds
const TIMEOUT_TTL = 60; // seconds
const MAX_PARTICIPANTS = 8;

@Injectable()
export class CallSessionService {
  private readonly logger = new Logger(CallSessionService.name);

  constructor(private readonly redis: RedisService) {}

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
      this.redis.getClient().hset(key, session as unknown as Record<string, string>),
      this.redis.getClient().expire(key, SESSION_TTL),
      this.redis.getClient().set(timeoutKey, 'pending', 'EX', TIMEOUT_TTL),
      this.redis.getClient().sadd(participantsKey, params.initiatorId),
      this.redis.getClient().expire(participantsKey, SESSION_TTL),
    ]);

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

    if (state === 'active' || state === 'declined' || state === 'missed' || state === 'ended') {
      await this.redis.getClient().del(`call_timeout:${sessionId}`);
    }

    this.logger.log(`[CallSession] Session ${sessionId} → ${state}`);
  }

  async addParticipant(sessionId: string, userId: string): Promise<boolean> {
    const participantsKey = `call_participants:${sessionId}`;
    const count = await this.redis.getClient().scard(participantsKey);
    if (count >= MAX_PARTICIPANTS) return false;

    await Promise.all([
      this.redis.getClient().sadd(participantsKey, userId),
      this.redis.getClient().hincrby(`call:${sessionId}`, 'participantCount', 1),
    ]);
    return true;
  }

  async getParticipants(sessionId: string): Promise<string[]> {
    return this.redis.getClient().smembers(`call_participants:${sessionId}`);
  }

  async endSession(sessionId: string): Promise<void> {
    await Promise.all([
      this.updateSessionState(sessionId, 'ended'),
      this.redis.getClient().del(`call_participants:${sessionId}`),
    ]);
    this.logger.log(`[CallSession] Session ${sessionId} ended`);
  }

  async isActive(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    return session?.state === 'initiated' || session?.state === 'active';
  }

  async hasExistingSession(
    initiatorId: string,
    targetUserId: string,
    conversationId: string,
  ): Promise<string | null> {
    // Scan all session keys — acceptable for MVP scale (hundreds of sessions)
    const keys = await this.redis.getClient().keys('call:*');
    for (const key of keys) {
      const data = await this.redis.getClient().hgetall(key);
      if (
        (data as unknown as CallSession).initiatorId === initiatorId &&
        (data as unknown as CallSession).targetUserId === targetUserId &&
        (data as unknown as CallSession).conversationId === conversationId &&
        ((data as unknown as CallSession).state === 'initiated' || (data as unknown as CallSession).state === 'active')
      ) {
        return key.replace('call:', '');
      }
    }
    return null;
  }
}
