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
import { WsAuthGuard } from '../gateway/guards/ws-auth.guard';
import { MembershipService } from '../conversations/services/membership.service';
import { UsersService } from '../users/users.service';
import { CallSessionService } from './services/call-session.service';
import { TurnService } from './services/turn.service';
import { CallInitiateDto, CallType } from './dto/call-initiate.dto';
import { CallOfferDto } from './dto/call-offer.dto';
import { CallAnswerDto } from './dto/call-answer.dto';
import { CallIceCandidateDto } from './dto/call-ice-candidate.dto';
import { CallAcceptDto } from './dto/call-accept.dto';
import { CallDeclineDto } from './dto/call-decline.dto';
import { CallEndDto } from './dto/call-end.dto';
import { CallJoinDto } from './dto/call-join.dto';

interface AuthSocketData {
  user?: { sub: string; phone: string };
}

type AuthSocket = Socket & { data: AuthSocketData };

@WebSocketGateway({ namespace: '/webrtc', cors: true })
export class WebrtcGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  io: Server;

  private readonly logger = new Logger(WebrtcGateway.name);

  constructor(
    private readonly membershipService: MembershipService,
    private readonly usersService: UsersService,
    private readonly callSessionService: CallSessionService,
    private readonly turnService: TurnService,
  ) {}

  async handleConnection(client: AuthSocket): Promise<void> {
    const userId = client.data?.user?.sub;
    if (userId) {
      this.logger.log(`[WebrtcGateway] Client connected: ${client.id} (user: ${userId})`);
      await client.join(`user:${userId}`);
    }
  }

  async handleDisconnect(client: AuthSocket): Promise<void> {
    const userId = client.data?.user?.sub;
    this.logger.log(`[WebrtcGateway] Client disconnected: ${client.id}`);
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
        client.emit('error', { code: 403, message: 'Not a member of this conversation' });
        return;
      }
    } catch {
      client.emit('error', { code: 404, message: 'Conversation not found' });
      return;
    }

    // Check for existing active session
    const existingSessionId = await this.callSessionService.hasExistingSession(
      callerId,
      targetUserId,
      conversationId,
    );
    if (existingSessionId) {
      client.emit('error', { code: 409, message: 'Active session already exists' });
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

    const iceServers = this.turnService.getIceServers(targetUserId);

    // Get caller info
    const caller = await this.usersService.findById(callerId);
    const callerInfo = {
      userId: callerId,
      displayName: caller?.displayName ?? caller?.phone ?? caller?.email ?? callerId,
      avatar: caller?.avatar,
    };

    if (!targetOnline) {
      // Target offline — mark missed immediately
      await this.callSessionService.updateSessionState(session.sessionId, 'missed');
      client.emit('call_missed', {
        sessionId: session.sessionId,
        reason: 'User is offline',
      });
      return;
    }

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
    });

    this.logger.log(`[WebrtcGateway] call_initiate: ${callerId} → ${targetUserId} (session: ${session.sessionId})`);
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

    const added = await this.callSessionService.addParticipant(sessionId, userId);
    if (!added) {
      client.emit('error', { code: 403, message: 'Call is full (max 8 participants)' });
      return;
    }

    const participants = await this.callSessionService.getParticipants(sessionId);
    const iceServers = this.turnService.getIceServers(userId);

    client.emit('call_joined', { sessionId, participants, iceServers });

    // Notify others in the call
    const user = await this.usersService.findById(userId);
    const userInfo = {
      userId,
      displayName: user?.displayName ?? user?.phone ?? user?.email ?? userId,
      avatar: user?.avatar,
    };
    for (const pid of participants) {
      if (pid !== userId) {
        this.io.to(`user:${pid}`).emit('participant_joined', { sessionId, user: userInfo });
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
    if (!valid) return;

    const session = await this.callSessionService.getSession(sessionId);
    if (!session) return;

    const targetId = senderId === session.initiatorId
      ? session.targetUserId
      : session.initiatorId;

    if (targetId) {
      this.io.to(`user:${targetId}`).emit('call_offer', { sessionId, fromUserId: senderId, sdp });
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
    if (!valid) return;

    const session = await this.callSessionService.getSession(sessionId);
    if (!session) return;

    // Mark active if still initiated
    if (session.state === 'initiated') {
      await this.callSessionService.updateSessionState(sessionId, 'active');
    }

    const targetId = session.initiatorId;
    this.io.to(`user:${targetId}`).emit('call_answer', { sessionId, fromUserId: senderId, sdp });
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
    if (!valid) return;

    const participants = await this.callSessionService.getParticipants(sessionId);
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
      client.emit('error', { code: 410, message: 'Session not in initiated state' });
      return;
    }

    await this.callSessionService.updateSessionState(sessionId, 'active');
    this.io.to(`user:${session.initiatorId}`).emit('call_accepted', { sessionId });

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
      client.emit('error', { code: 410, message: 'Session not in initiated state' });
      return;
    }

    await this.callSessionService.updateSessionState(sessionId, 'declined');
    this.io.to(`user:${session.initiatorId}`).emit('call_declined', {
      sessionId,
      reason: 'User declined',
    });

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

    const participants = await this.callSessionService.getParticipants(sessionId);
    if (!participants.includes(userId)) {
      client.emit('error', { code: 403, message: 'Not a participant' });
      return;
    }

    await this.callSessionService.endSession(sessionId);

    for (const pid of participants) {
      this.io.to(`user:${pid}`).emit('call_ended', { sessionId });
    }

    this.logger.log(`[WebrtcGateway] call_ended: session ${sessionId}`);
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
    const participants = await this.callSessionService.getParticipants(sessionId);
    if (!participants.includes(userId)) {
      return false;
    }
    return true;
  }
}
