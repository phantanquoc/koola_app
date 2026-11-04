import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { BusinessSessionsService } from '../../business-members/business-sessions.service';

/**
 * Task 8.8 — refresh `business_sessions.lastActiveAt` on every business API call.
 *
 * Registered globally (app.module) rather than per-controller: "every business
 * API call" is the contract, and a per-route decorator would silently miss new
 * routes. Cheap because it is a no-op for the common case — a personal session
 * carries no business context and returns before touching Mongo.
 *
 * Ordering: runs AFTER the response is produced (`tap`) so a failed/rejected
 * request never looks like member activity, and a slow write can never delay
 * the response. The update is fire-and-forget: session bookkeeping must not
 * fail a request that already succeeded.
 */
@Injectable()
export class BusinessSessionActivityInterceptor implements NestInterceptor {
  constructor(private readonly sessions: BusinessSessionsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Non-HTTP contexts (the Socket.IO gateways) have no request to read.
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<{
      user?: { userId?: string; actorId?: string; accountType?: string };
    }>();

    return next.handle().pipe(
      tap(() => {
        const user = request.user;
        // `userId` is the ACTIVE account (the business), `actorId` the human
        // behind it — the session row is keyed by both.
        if (!user || user.accountType !== 'business') return;
        const businessId = user.userId;
        const actorId = user.actorId;
        if (!businessId || !actorId) return;

        void this.sessions
          .updateActivity(businessId, actorId)
          .catch(() => undefined);
      }),
    );
  }
}
