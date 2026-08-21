import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CallSessionService } from './call-session.service';
import { CallLogsService } from '../../call-logs/call-logs.service';
import { WebrtcGateway } from '../webrtc.gateway';

@Injectable()
export class CallSessionCronService {
  private readonly logger = new Logger(CallSessionCronService.name);

  constructor(
    private readonly callSessionService: CallSessionService,
    private readonly callLogsService: CallLogsService,
    private readonly webrtcGateway: WebrtcGateway,
  ) {}

  @Cron('*/15 * * * * *') // Every 15 seconds (6-field: seconds minutes hours dom month dow)
  async cleanupStaleSessions(): Promise<void> {
    let cleaned: Awaited<
      ReturnType<CallSessionService['cleanupStaleSessions']>
    >;
    try {
      cleaned = await this.callSessionService.cleanupStaleSessions(Date.now());
    } catch (err) {
      // Redis may be reconnecting — skip this tick silently
      this.logger.debug(
        `[CallCron] Skipped cleanup (Redis unavailable): ${(err as Error).message}`,
      );
      return;
    }

    if (cleaned.length === 0) return;

    for (const session of cleaned) {
      await this.callLogsService
        .updateLog(session.sessionId, {
          status: 'missed',
          endedAt: new Date(),
          duration: 0,
        })
        .catch((err) => {
          this.logger.warn(
            `[CallCron] Failed to update log for ${session.sessionId}: ${err.message}`,
          );
        });

      // Clean pending_call for this target if it references this session
      if (session.targetUserId) {
        try {
          await this.callSessionService.delPendingCallIfMatches(
            session.targetUserId,
            session.sessionId,
          );
        } catch {
          // non-fatal
        }
      }

      try {
        this.webrtcGateway.io
          .to(`user:${session.initiatorId}`)
          .emit('call_missed', {
            sessionId: session.sessionId,
            reason: 'No answer',
          });

        if (session.targetUserId) {
          this.webrtcGateway.io
            .to(`user:${session.targetUserId}`)
            .emit('call_timeout', { sessionId: session.sessionId });
        }

        // Realtime sync: missed timeout should also update inline cards via SQLite
        try {
          const log = await this.callLogsService.findBySessionId(session.sessionId);
          if (log) {
            const raw = log as unknown as Record<string, unknown>;
            const payload: Record<string, unknown> =
              typeof (log as unknown as { toObject?: () => Record<string, unknown> }).toObject === 'function'
                ? (log as unknown as { toObject: () => Record<string, unknown> }).toObject()
                : { ...raw };
            if (payload._id != null && typeof payload._id !== 'string') payload._id = String(payload._id);
            const initiatorId = String((payload.initiatorId as string) ?? (raw.initiatorId as string) ?? '');
            const targetId = String((payload.targetUserId as string) ?? (raw.targetUserId as string) ?? '');
            if (initiatorId) { try { this.webrtcGateway.io.to(`user:${initiatorId}`).emit('call_log_updated', payload); } catch {} }
            if (targetId) { try { this.webrtcGateway.io.to(`user:${targetId}`).emit('call_log_updated', payload); } catch {} }
            try { this.webrtcGateway.io.to(`conversation:${String((payload.conversationId as string) ?? (raw.conversationId as string) ?? '')}`).emit('call_log_updated', payload); } catch {}
            if (initiatorId) { try { this.webrtcGateway.io.to(`user:${initiatorId}`).emit('call_log_created', payload); } catch {} }
            if (targetId) { try { this.webrtcGateway.io.to(`user:${targetId}`).emit('call_log_created', payload); } catch {} }
          }
        } catch {}
      } catch (err) {
        this.logger.warn(
          `[CallCron] Failed to emit socket events for ${session.sessionId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`[CallCron] Cleaned ${cleaned.length} stale session(s)`);
  }
}
