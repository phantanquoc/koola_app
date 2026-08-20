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
      } catch (err) {
        this.logger.warn(
          `[CallCron] Failed to emit socket events for ${session.sessionId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`[CallCron] Cleaned ${cleaned.length} stale session(s)`);
  }
}
