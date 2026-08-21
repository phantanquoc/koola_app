import { Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { WsAuthGuard } from '../gateway/guards/ws-auth.guard';
import { socketCorsOrigin } from '../common/cors';
import { MembershipService } from '../conversations/services/membership.service';
import { UsersService } from '../users/users.service';
import { CallSessionService } from './services/call-session.service';
import { TurnService } from './services/turn.service';
import { CallNotificationsService } from './services/call-notifications.service';
import { CallLogsService } from '../call-logs/call-logs.service';
import { CallLogType } from '../call-logs/call-log.schema';
import { RedisService } from '../common/redis/redis.service';
import { CallInitiateDto } from './dto/call-initiate.dto';
import { CallOfferDto } from './dto/call-offer.dto';
import { CallAnswerDto } from './dto/call-answer.dto';
import { CallIceCandidateDto } from './dto/call-ice-candidate.dto';
import { CallAcceptDto } from './dto/call-accept.dto';
import { CallCancelDto } from './dto/call-cancel.dto';
import { CallDeclineDto } from './dto/call-decline.dto';
import { CallEndDto } from './dto/call-end.dto';
import { CallFailedDto } from './dto/call-failed.dto';
import { CallJoinDto } from './dto/call-join.dto';
import { CallRingingDto } from './dto/call-ringing.dto';

interface AuthSocketData {
  user?: {
    sub: string;
    phone: string;
    actorId?: string;
    accountType?: 'personal' | 'business';
  };
}

type AuthSocket = Socket & { data: AuthSocketData };

const CALL_TIMEOUT_MS = 30_000;
/** Grace period for offline-push sessions (ms). Shorter than online timeout
 *  because the device needs time to wake from doze but we don't want to hold
 *  infra longer than necessary. */
const OFFLINE_PUSH_GRACE_MS = 25_000;
/** Maximum call_initiate attempts per user within CALL_RATE_WINDOW_SECONDS. */
const CALL_RATE_LIMIT = 10;
const CALL_RATE_WINDOW_SECONDS = 60;

@WebSocketGateway({
  namespace: '/webrtc',
  cors: { origin: socketCorsOrigin(), credentials: true },
})
export class WebrtcGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  io: Server;

  private readonly logger = new Logger(WebrtcGateway.name);

  constructor(
    private readonly membershipService: MembershipService,
    private readonly usersService: UsersService,
    private readonly callSessionService: CallSessionService,
    private readonly turnService: TurnService,
    private readonly callNotificationsService: CallNotificationsService,
    private readonly callLogsService: CallLogsService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: AuthSocket): Promise<void> {
    const token = client.handshake.query.token as string | undefined;

    if (!token) {
      client.disconnect(true);
      return;
    }

    let payload: {
      sub: string;
      phone: string;
      act?: string;
      accountType?: string;
    };
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      client.disconnect(true);
      return;
    }

    const userId = payload.sub;
    client.data.user = {
      sub: payload.sub,
      phone: payload.phone,
      actorId: payload.act ?? payload.sub,
      accountType:
        (payload.accountType as 'personal' | 'business') ?? 'personal',
    };

    this.logger.log(
      `[WebrtcGateway] Client connected: ${client.id} (user: ${userId})`,
    );
    await client.join(`user:${userId}`);

    try {
      const raw = await this.callSessionService.getPendingCall(userId);
      if (raw) {
        let payload: Record<string, unknown> | null = null;
        try {
          payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          await this.callSessionService.delPendingCall(userId);
          payload = null;
        }
        if (payload && typeof payload.sessionId === 'string') {
          const sessionId = payload.sessionId;
          const session = await this.callSessionService.getSession(sessionId);
          const deadline = session
            ? Number((session as unknown as Record<string, string>).deadlineAt)
            : 0;
          if (
            session &&
            session.state === 'initiated' &&
            deadline > Date.now()
          ) {
            client.emit('incoming_call', payload);
            await this.callSessionService.delPendingCall(userId);
            this.logger.log(
              `[WebrtcGateway] Replayed pending_call ${sessionId} to ${userId}`,
            );
          } else {
            await this.callSessionService.delPendingCall(userId);
          }
        } else if (payload) {
          await this.callSessionService.delPendingCall(userId);
        }
      }
    } catch (err) {
      this.logger.warn(
        `[WebrtcGateway] pending_call replay failed for ${userId}: ${(err as Error).message}`,
      );
    }
  }

  async handleDisconnect(client: AuthSocket): Promise<void> {
    const userId = client.data?.user?.sub;
    this.logger.log(`[WebrtcGateway] Client disconnected: ${client.id}`);

    if (!userId) return;

    // Check if user has any active call sessions and end them
    const sessionIds =
      await this.callSessionService.getActiveSessionIds(userId);
    for (const sessionId of sessionIds) {
      const session = await this.callSessionService.getSession(sessionId);
      if (!session) continue;
      if (session.state !== 'initiated' && session.state !== 'active') continue;

      // Check if user still has other connected sockets (multi-device)
      const userRoom = `user:${userId}`;
      const remaining = await this.io.in(userRoom).fetchSockets();
      if (remaining.length > 0) continue;

      // No more sockets — end the session
      await this.callSessionService.endSession(sessionId);

      // Update call log: ended (compute duration from answeredAt if active)
      const priorLog = await this.callLogsService
        .findBySessionId(sessionId)
        .catch(() => null);
      const duration = priorLog?.answeredAt
        ? Math.floor((Date.now() - priorLog.answeredAt.getTime()) / 1000)
        : 0;
      await this.callLogsService
        .updateLog(sessionId, {
          status: 'ended',
          duration,
          endedAt: new Date(),
        })
        .catch((err) =>
          this.logger.error(
            `[WebrtcGateway] updateLog (disconnect) failed: ${(err as Error).message}`,
          ),
        );

      const participants =
        await this.callSessionService.getParticipants(sessionId);
      for (const pid of participants) {
        if (pid !== userId) {
          this.io.to(`user:${pid}`).emit('call_ended', { sessionId });
        }
      }

      void this.emitCallLogUpdate(sessionId);

      this.logger.log(
        `[WebrtcGateway] Auto-ended session ${sessionId} due to disconnect`,
      );
    }
  }

  // ─── Call Initiate ──────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('call_initiate')
  async handleCallInitiate(
    @MessageBody() dto: CallInitiateDto,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const callerId = client.data.user!.sub;
    const { targetUserId, conversationId, callType } = dto;

    // Rate limit: max CALL_RATE_LIMIT initiations per user per CALL_RATE_WINDOW_SECONDS
    const rateKey = `call_rate:${callerId}`;
    const attempts = await this.redisService.incrementWithExpiry(
      rateKey,
      CALL_RATE_WINDOW_SECONDS,
    );
    if (attempts > CALL_RATE_LIMIT) {
      client.emit('error', {
        code: 429,
        message: 'Too many call attempts. Please try again in a minute.',
      });
      return;
    }

    if (callerId === targetUserId) {
      client.emit('error', { code: 400, message: 'Cannot call yourself' });
      return;
    }

    // Validate caller is conversation member
    try {
      const isMember = await this.membershipService.isMember(
        callerId,
        conversationId,
      );
      if (!isMember) {
        client.emit('error', {
          code: 403,
          message: 'Not a member of this conversation',
        });
        return;
      }
    } catch {
      client.emit('error', { code: 404, message: 'Conversation not found' });
      return;
    }

    // Check if initiator is already in a call — emit call_busy to self (spec 6.5/#526)
    const initiatorActiveSessions =
      await this.callSessionService.getActiveSessionIds(callerId);
    if (initiatorActiveSessions && initiatorActiveSessions.length > 0) {
      client.emit('call_busy', { targetUserId });
      this.logger.log(
        `[WebrtcGateway] call_busy: ${callerId} → ${targetUserId} (initiator has active session)`,
      );
      return;
    }

    // Check if target user has an active call — emit call_busy (spec 6.5/6.14)
    const targetActiveSessions =
      await this.callSessionService.getActiveSessionIds(targetUserId);
    if (targetActiveSessions && targetActiveSessions.length > 0) {
      client.emit('call_busy', { targetUserId });
      this.logger.log(
        `[WebrtcGateway] call_busy: ${callerId} → ${targetUserId} (target has active session)`,
      );
      return;
    }

    // Check for existing active session
    const existingSessionId = await this.callSessionService.hasExistingSession(
      callerId,
      targetUserId,
      conversationId,
    );
    if (existingSessionId) {
      client.emit('error', {
        code: 409,
        message: 'Active session already exists',
      });
      return;
    }

    // Check if target is online
    const targetRoom = `user:${targetUserId}`;
    const targetSockets = await this.io.in(targetRoom).fetchSockets();
    const targetOnline = targetSockets.length > 0;

    // Create session
    const session = await this.callSessionService.createSession({
      initiatorId: callerId,
      targetUserId,
      conversationId,
      callType,
    });

    // Create call log row (default status: 'missed' — updated on accept/end/etc).
    // Non-fatal: if the log write fails we still proceed with the call.
    try {
      await this.callLogsService.createLog({
        sessionId: session.sessionId,
        initiatorId: callerId,
        targetUserId,
        conversationId,
        callType: callType as CallLogType,
        status: 'missed',
      });
      // Realtime: notify both parties' SQLite so inline cards appear without REST
      void this.emitCallLogUpdate(session.sessionId);
    } catch (err) {
      this.logger.error(
        `[WebrtcGateway] createLog failed for session ${session.sessionId}: ${(err as Error).message}`,
      );
    }

    const iceServers = this.turnService.getIceServers(targetUserId);

    // Get caller + callee info for payloads
    const caller = await this.usersService.findById(callerId);
    const callerInfo = {
      userId: callerId,
      displayName: caller?.displayName ?? caller?.email ?? callerId,
      avatar: caller?.avatar,
    };
    const callee = await this.usersService.findById(targetUserId);
    const remoteUser = {
      userId: targetUserId,
      displayName: callee?.displayName ?? callee?.email ?? targetUserId,
      avatar: callee?.avatar,
    };

    if (!targetOnline) {
      // ── Offline-push branch ──────────────────────────────────────────────
      // Fetch callee to check FCM tokens.
      const target = await this.usersService.findById(targetUserId);
      const hasTokens = target?.fcmTokens && target.fcmTokens.length > 0;

      if (!hasTokens) {
        // No tokens — immediate missed (same as pre-change behavior).
        await this.callSessionService.updateSessionState(
          session.sessionId,
          'missed',
        );
        client.emit('call_missed', {
          sessionId: session.sessionId,
          reason: 'User unreachable',
        });
        this.logger.log(
          `[WebrtcGateway] call_initiate: ${callerId} → ${targetUserId} — offline, no FCM tokens (session: ${session.sessionId})`,
        );
        return;
      }

      // Callee is offline but has FCM tokens — start grace period.
      // 1. Notify caller (same payload shape as online case — Decision 5 in design.md).
      client.emit('call_initiated', {
        sessionId: session.sessionId,
        iceServers,
        targetUserId,
        callType,
        remoteUser,
      });

      // 2. Send FCM data-only push to all callee tokens.
      //    Non-blocking: errors are logged but do NOT abort the grace period.
      const expiresAt = Date.now() + OFFLINE_PUSH_GRACE_MS;
      try {
        const pushResult =
          await this.callNotificationsService.sendIncomingCallPush({
            recipientId: targetUserId,
            sessionId: session.sessionId,
            callerId,
            callerName: callerInfo.displayName,
            callerAvatar: callerInfo.avatar,
            callType: callType as 'audio' | 'video',
            conversationId,
            expiresAt,
          });
        this.logger.log(
          `[WebrtcGateway] FCM push for session ${session.sessionId}: ` +
            `${pushResult.success}/${pushResult.totalTokens} delivered`,
        );
      } catch (err: unknown) {
        // Second line of defense — sendIncomingCallPush should never throw,
        // but guard here anyway so the grace timer always starts.
        this.logger.error(
          `[WebrtcGateway] Unexpected error from sendIncomingCallPush (session ${session.sessionId}): ` +
            `${(err as Error).message}`,
        );
      }

      // 3. Mark pushSentAt in Redis for observability.
      await this.callSessionService.markPushSent(session.sessionId);

      await this.callSessionService.updateDeadlineAt(
        session.sessionId,
        Date.now() + OFFLINE_PUSH_GRACE_MS,
      );
      await this.callSessionService.setPendingCall(
        targetUserId,
        {
          sessionId: session.sessionId,
          fromUserId: callerId,
          fromUser: callerInfo,
          callType,
          conversationId,
          iceServers,
        },
        OFFLINE_PUSH_GRACE_MS,
      );

      this.logger.log(
        `[WebrtcGateway] call_initiate: ${callerId} → ${targetUserId} — offline push sent, ` +
          `grace deadline set (session: ${session.sessionId})`,
      );
      return;
    }

    // ── Online path ──────────────────────────────────────────────────────────
    // Target online — send incoming call
    this.io.to(targetRoom).emit('incoming_call', {
      sessionId: session.sessionId,
      fromUserId: callerId,
      fromUser: callerInfo,
      callType,
      conversationId,
      iceServers,
    });

    client.emit('call_initiated', {
      sessionId: session.sessionId,
      iceServers,
      targetUserId,
      callType,
      remoteUser,
    });

    await this.callSessionService.updateDeadlineAt(
      session.sessionId,
      Date.now() + CALL_TIMEOUT_MS,
    );

    this.logger.log(
      `[WebrtcGateway] call_initiate: ${callerId} → ${targetUserId} (session: ${session.sessionId})`,
    );
  }

  // ─── Call Cancel ─────────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('call_cancel')
  async handleCallCancel(
    @MessageBody() dto: CallCancelDto,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const callerId = client.data.user!.sub;
    const { sessionId } = dto;

    const session = await this.callSessionService.getSession(sessionId);
    if (!session) {
      client.emit('error', { code: 404, message: 'Session not found' });
      return;
    }
    if (session.initiatorId !== callerId) {
      client.emit('error', {
        code: 403,
        message: 'Only the initiator can cancel',
      });
      return;
    }
    if (session.state !== 'initiated') {
      client.emit('error', {
        code: 410,
        message: 'Cannot cancel — call is not in initiated state',
      });
      return;
    }

    await this.callSessionService.endSession(sessionId);
    if (session.targetUserId) {
      await this.callSessionService.delPendingCallIfMatches(
        session.targetUserId,
        sessionId,
      );
    }

    await this.callLogsService
      .updateLog(sessionId, {
        status: 'cancelled',
        duration: 0,
        endedAt: new Date(),
      })
      .catch((err) =>
        this.logger.error(
          `[WebrtcGateway] updateLog (cancel) failed: ${(err as Error).message}`,
        ),
      );

    // Notify callee (covers both online and offline-push cases)
    if (session.targetUserId) {
      this.io
        .to(`user:${session.targetUserId}`)
        .emit('call_cancelled', { sessionId });
    }

    void this.emitCallLogUpdate(sessionId);

    this.logger.log(
      `[WebrtcGateway] call_cancel: session ${sessionId} by ${callerId}`,
    );
  }

  // ─── Call Ringing ─────────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('call_ringing')
  async handleCallRinging(
    @MessageBody() dto: CallRingingDto,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const { sessionId } = dto;

    const session = await this.callSessionService.getSession(sessionId);
    if (!session) {
      this.logger.debug(
        `[WebrtcGateway] call_ringing: session ${sessionId} not found — ignoring`,
      );
      return;
    }

    this.io
      .to(`user:${session.initiatorId}`)
      .emit('call_ringing', { sessionId });

    this.logger.log(
      `[WebrtcGateway] call_ringing: session ${sessionId} → initiator ${session.initiatorId}`,
    );
  }

  // ─── Call Join (group calls) ─────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('call_join')
  async handleCallJoin(
    @MessageBody() dto: CallJoinDto,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = client.data.user!.sub;
    const { sessionId } = dto;

    const session = await this.callSessionService.getSession(sessionId);
    if (!session) {
      client.emit('error', { code: 404, message: 'Session not found' });
      return;
    }

    if (session.state !== 'initiated' && session.state !== 'active') {
      client.emit('error', { code: 410, message: 'Session has ended' });
      return;
    }

    const added = await this.callSessionService.addParticipant(
      sessionId,
      userId,
    );
    if (!added) {
      client.emit('error', {
        code: 403,
        message: 'Call is full (max 8 participants)',
      });
      return;
    }

    const participants =
      await this.callSessionService.getParticipants(sessionId);
    const iceServers = this.turnService.getIceServers(userId);

    client.emit('call_joined', { sessionId, participants, iceServers });

    // Notify others in the call
    const user = await this.usersService.findById(userId);
    const userInfo = {
      userId,
      displayName: user?.displayName ?? user?.email ?? userId,
      avatar: user?.avatar,
    };
    for (const pid of participants) {
      if (pid !== userId) {
        this.io
          .to(`user:${pid}`)
          .emit('participant_joined', { sessionId, user: userInfo });
      }
    }

    // If 2+ participants, mark active and cancel timeout
    if (participants.length >= 2 && session.state === 'initiated') {
      await this.callSessionService.updateSessionState(sessionId, 'active');
    }
  }

  // ─── SDP Exchange ────────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('call_offer')
  async handleCallOffer(
    @MessageBody() dto: CallOfferDto,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const { sessionId, sdp } = dto;
    const senderId = client.data.user!.sub;

    const valid = await this.validateParticipant(sessionId, senderId);
    if (!valid) {
      client.emit('error', {
        code: 410,
        message: 'Session has ended or you are no longer a participant',
      });
      return;
    }

    const session = await this.callSessionService.getSession(sessionId);
    if (!session) return;

    const targetId =
      senderId === session.initiatorId
        ? session.targetUserId
        : session.initiatorId;

    if (targetId) {
      this.io
        .to(`user:${targetId}`)
        .emit('call_offer', { sessionId, fromUserId: senderId, sdp });
    }
  }

  @UseGuards(WsAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('call_answer')
  async handleCallAnswer(
    @MessageBody() dto: CallAnswerDto,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const { sessionId, sdp } = dto;
    const senderId = client.data.user!.sub;

    const valid = await this.validateParticipant(sessionId, senderId);
    if (!valid) {
      client.emit('error', {
        code: 410,
        message: 'Session has ended or you are no longer a participant',
      });
      return;
    }

    const session = await this.callSessionService.getSession(sessionId);
    if (!session) return;

    // Mark active if still initiated
    if (session.state === 'initiated') {
      await this.callSessionService.updateSessionState(sessionId, 'active');
    }

    const targetId = session.initiatorId;
    this.io
      .to(`user:${targetId}`)
      .emit('call_answer', { sessionId, fromUserId: senderId, sdp });
  }

  // ─── ICE Candidate Exchange ──────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('call_ice_candidate')
  async handleIceCandidate(
    @MessageBody() dto: CallIceCandidateDto,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const { sessionId, candidate } = dto;
    const senderId = client.data.user!.sub;

    const valid = await this.validateParticipant(sessionId, senderId);
    if (!valid) {
      client.emit('error', {
        code: 410,
        message: 'Session has ended or you are no longer a participant',
      });
      return;
    }

    const participants =
      await this.callSessionService.getParticipants(sessionId);
    for (const pid of participants) {
      if (pid !== senderId) {
        this.io.to(`user:${pid}`).emit('call_ice_candidate', {
          sessionId,
          fromUserId: senderId,
          candidate,
        });
      }
    }
  }

  // ─── Call State ──────────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('call_accept')
  async handleCallAccept(
    @MessageBody() dto: CallAcceptDto,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = client.data.user!.sub;
    const { sessionId } = dto;

    const session = await this.callSessionService.getSession(sessionId);
    if (!session) {
      client.emit('error', { code: 404, message: 'Session not found' });
      return;
    }
    if (session.targetUserId !== userId) {
      client.emit('error', { code: 403, message: 'Not the call target' });
      return;
    }
    if (session.state !== 'initiated') {
      client.emit('error', {
        code: 410,
        message: 'Session not in initiated state',
      });
      return;
    }

    // Register the callee as a session participant. createSession only adds the
    // initiator; without this the callee fails validateParticipant in
    // handleCallAnswer / handleIceCandidate, so its SDP answer and ICE
    // candidates are silently dropped and the call never reaches 'active'.
    // Must run BEFORE 'call_accepted' is emitted so the caller's offer (sent on
    // accept) has a valid relay target by the time the answer comes back.
    await this.callSessionService.addParticipant(sessionId, userId);

    await this.callSessionService.updateSessionState(sessionId, 'active');
    if (session.targetUserId) {
      await this.callSessionService.delPendingCallIfMatches(
        session.targetUserId,
        sessionId,
      );
    }

    // Update call log: answered
    await this.callLogsService
      .updateLog(sessionId, {
        status: 'answered',
        answeredAt: new Date(),
      })
      .catch((err) =>
        this.logger.error(
          `[WebrtcGateway] updateLog (accept) failed: ${(err as Error).message}`,
        ),
      );

    // Cancel the ringing on the callee's OTHER devices (multi-device)
    this.io
      .in(`user:${userId}`)
      .except(client.id)
      .emit('call_cancelled', { sessionId });

    this.io
      .to(`user:${session.initiatorId}`)
      .emit('call_accepted', { sessionId });

    void this.emitCallLogUpdate(sessionId);

    this.logger.log(`[WebrtcGateway] call_accepted: session ${sessionId}`);
  }

  @UseGuards(WsAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('call_decline')
  async handleCallDecline(
    @MessageBody() dto: CallDeclineDto,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = client.data.user!.sub;
    const { sessionId } = dto;

    const session = await this.callSessionService.getSession(sessionId);
    if (!session) {
      client.emit('error', { code: 404, message: 'Session not found' });
      return;
    }
    if (session.targetUserId !== userId) {
      client.emit('error', { code: 403, message: 'Not the call target' });
      return;
    }
    if (session.state !== 'initiated') {
      client.emit('error', {
        code: 410,
        message: 'Session not in initiated state',
      });
      return;
    }

    await this.callSessionService.updateSessionState(sessionId, 'declined');
    if (session.targetUserId) {
      await this.callSessionService.delPendingCallIfMatches(
        session.targetUserId,
        sessionId,
      );
    }

    await this.callLogsService
      .updateLog(sessionId, {
        status: 'declined',
        duration: 0,
        endedAt: new Date(),
      })
      .catch((err) =>
        this.logger.error(
          `[WebrtcGateway] updateLog (decline) failed: ${(err as Error).message}`,
        ),
      );

    this.io.to(`user:${session.initiatorId}`).emit('call_declined', {
      sessionId,
      reason: 'User declined',
    });

    void this.emitCallLogUpdate(sessionId);

    this.logger.log(`[WebrtcGateway] call_declined: session ${sessionId}`);
  }

  @UseGuards(WsAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('call_end')
  async handleCallEnd(
    @MessageBody() dto: CallEndDto,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = client.data.user!.sub;
    const { sessionId } = dto;

    const session = await this.callSessionService.getSession(sessionId);
    if (!session) {
      client.emit('error', { code: 404, message: 'Session not found' });
      return;
    }

    const participants =
      await this.callSessionService.getParticipants(sessionId);
    if (!participants.includes(userId)) {
      client.emit('error', { code: 403, message: 'Not a participant' });
      return;
    }

    await this.callSessionService.endSession(sessionId);
    if (session.targetUserId) {
      await this.callSessionService.delPendingCallIfMatches(
        session.targetUserId,
        sessionId,
      );
    }

    // Compute duration from answeredAt if the call was ever active
    const priorLog = await this.callLogsService.findBySessionId(sessionId);
    const duration = priorLog?.answeredAt
      ? Math.floor((Date.now() - priorLog.answeredAt.getTime()) / 1000)
      : 0;

    await this.callLogsService
      .updateLog(sessionId, {
        status: 'ended',
        duration,
        endedAt: new Date(),
      })
      .catch((err) =>
        this.logger.error(
          `[WebrtcGateway] updateLog (end) failed: ${(err as Error).message}`,
        ),
      );

    for (const pid of participants) {
      this.io.to(`user:${pid}`).emit('call_ended', { sessionId });
    }

    void this.emitCallLogUpdate(sessionId);

    this.logger.log(`[WebrtcGateway] call_ended: session ${sessionId}`);
  }

  // ─── Call Failed ─────────────────────────────────────────────────────────────

  @UseGuards(WsAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('call_failed')
  async handleCallFailed(
    @MessageBody() dto: CallFailedDto,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const userId = client.data.user?.sub;
    if (!userId) {
      client.emit('error', { code: 401, message: 'Unauthorized' });
      return;
    }

    const { sessionId } = dto;

    const session = await this.callSessionService.getSession(sessionId);
    if (!session) {
      client.emit('error', { code: 404, message: 'Session not found' });
      return;
    }

    // Validate that the caller is a participant (initiator or target)
    const participants =
      await this.callSessionService.getParticipants(sessionId);
    const allPartyIds = new Set([
      ...participants,
      session.initiatorId,
      ...(session.targetUserId ? [session.targetUserId] : []),
    ]);
    if (!allPartyIds.has(userId)) {
      client.emit('error', { code: 403, message: 'Not a participant' });
      return;
    }

    await this.callSessionService.endSession(sessionId);
    if (session.targetUserId) {
      await this.callSessionService.delPendingCallIfMatches(
        session.targetUserId,
        sessionId,
      );
    }

    // Compute duration from answeredAt if the call was ever active
    const log = await this.callLogsService.findBySessionId(sessionId);
    const duration = log?.answeredAt
      ? Math.floor((Date.now() - log.answeredAt.getTime()) / 1000)
      : 0;

    await this.callLogsService.updateLog(sessionId, {
      status: 'failed',
      endedAt: new Date(),
      duration,
    });

    // Notify all parties
    for (const pid of allPartyIds) {
      this.io.to(`user:${pid}`).emit('call_ended', { sessionId });
    }

    void this.emitCallLogUpdate(sessionId);

    this.logger.log(
      `[WebrtcGateway] call_failed: session ${sessionId} by ${userId}`,
    );
  }

  // ─── Auth Refresh ─────────────────────────────────────────────────────────────

  @SubscribeMessage('auth:refresh')
  handleAuthRefresh(
    @MessageBody() dto: { token: string },
    @ConnectedSocket() client: AuthSocket,
  ): void {
    const newToken = dto?.token;
    if (!newToken || typeof newToken !== 'string') {
      client.emit('auth:rejected', {
        code: 400,
        message: 'Missing or invalid token',
      });
      return;
    }
    try {
      const payload: {
        sub?: string;
        phone?: string;
        act?: string;
        accountType?: string;
      } = this.jwtService.verify(newToken);
      const sub = payload?.sub;
      const phone = payload?.phone;
      const newActorId = payload?.act ?? sub;
      if (!sub) {
        client.emit('auth:rejected', {
          code: 401,
          message: 'Invalid token payload',
        });
        return;
      }

      const currentSub = client.data.user?.sub;
      const currentActorId = client.data.user?.actorId ?? currentSub;

      // Accept when:
      //  (a) same sub as before (no switch), OR
      //  (b) new token's actor matches the current actor — same human, switching
      //      to an account they own (D6: same-root-owned account switch is valid).
      // Reject when a token from a completely different human arrives.
      const sameIdentity = currentSub === sub;
      const sameRoot =
        currentActorId && newActorId && currentActorId === newActorId;
      if (currentSub && !sameIdentity && !sameRoot) {
        client.emit('auth:rejected', {
          code: 403,
          message: 'Token user mismatch',
        });
        return;
      }

      client.data.user = {
        sub,
        phone: phone ?? undefined,
        actorId: newActorId,
        accountType:
          (payload.accountType as 'personal' | 'business') ?? 'personal',
      };
      client.emit('auth:refreshed', { userId: sub });
      this.logger.log('[WebrtcGateway] Socket auth refreshed', { userId: sub });
    } catch {
      client.emit('auth:rejected', {
        code: 401,
        message: 'Invalid or expired token',
      });
    }
  }


  private async emitCallLogUpdate(sessionId: string): Promise<void> {
    try {
      const log = await this.callLogsService.findBySessionId(sessionId);
      if (!log) return;
      const raw = (log as unknown as Record<string, unknown>);
      const payload: Record<string, unknown> =
        typeof (log as unknown as { toObject?: () => Record<string, unknown> }).toObject === 'function'
          ? (log as unknown as { toObject: () => Record<string, unknown> }).toObject()
          : { ...raw };
      // Normalize _id for client (ObjectId → string)
      if (payload._id != null && typeof payload._id !== 'string') {
        payload._id = String(payload._id);
      }
      if (payload.sessionId == null && (raw as Record<string, unknown>).sessionId) {
        payload.sessionId = (raw as Record<string, unknown>).sessionId;
      }
      // Emit on /webrtc namespace to user rooms (SocketService is on /chat,
      // but WebRTCService is on /webrtc — see socketEventRouter wiring).
      // Also emit conversation:-scoped for future ChatGateway bridging.
      const initiatorId = String((payload.initiatorId as string) ?? (raw.initiatorId as string) ?? '');
      const targetId = String((payload.targetUserId as string) ?? (raw.targetUserId as string) ?? '');
      const conversationId = String((payload.conversationId as string) ?? (raw.conversationId as string) ?? '');
      if (initiatorId) {
        try { this.io.to(`user:${initiatorId}`).emit('call_log_updated', payload); } catch {}
      }
      if (targetId) {
        try { this.io.to(`user:${targetId}`).emit('call_log_updated', payload); } catch {}
      }
      if (conversationId) {
        try { this.io.to(`conversation:${conversationId}`).emit('call_log_updated', payload); } catch {}
      }
      // Back-compat: also emit call_log_created for clients that distinguish create vs update
      if (initiatorId) {
        try { this.io.to(`user:${initiatorId}`).emit('call_log_created', payload); } catch {}
      }
      if (targetId) {
        try { this.io.to(`user:${targetId}`).emit('call_log_created', payload); } catch {}
      }
    } catch (err) {
      this.logger.warn('[WebrtcGateway] emitCallLogUpdate failed: ' + (err as Error).message);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async validateParticipant(
    sessionId: string,
    userId: string,
  ): Promise<boolean> {
    const session = await this.callSessionService.getSession(sessionId);
    if (!session) {
      return false;
    }
    const participants =
      await this.callSessionService.getParticipants(sessionId);
    if (!participants.includes(userId)) {
      return false;
    }
    return true;
  }
}
