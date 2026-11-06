import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BusinessSession,
  BusinessSessionDocument,
} from '../../business-members/schemas/business-session.schema';
import { SKIP_BUSINESS_SESSION_KEY } from '../decorators/skip-business-session.decorator';

/**
 * Message the mobile app matches to show "Phiên của bạn đã kết thúc" instead of
 * a generic re-login (business-members task 17.1). Keep in sync with
 * `SESSION_ENDED_MESSAGE` in ChatApp/src/services/api/apiService.ts.
 */
export const BUSINESS_SESSION_ENDED = 'BUSINESS_SESSION_ENDED';

/**
 * Enforces the one-device-per-member rule on every business request
 * (business-members tasks 8.3, 17.1).
 *
 * Without this, eviction was cosmetic: `createOrReplaceSession` deleted the old
 * row, but nothing ever read it, so the evicted device kept working with a
 * valid JWT until the token expired — and its next refresh would re-claim the
 * session and evict the new device, ping-ponging between the two.
 *
 * The check is deliberately narrow — it rejects ONLY when the session row names
 * a different device:
 *  - personal sessions: not applicable, pass;
 *  - no `X-Device-ID` header: the client does not participate in device
 *    tracking (older build, server-to-server call), pass;
 *  - no session row at all: nothing has claimed this business for this member
 *    (e.g. switched in before device tracking shipped), pass — it is not
 *    evidence of eviction;
 *  - row exists with a different deviceId: this device was replaced → 401.
 *
 * Cost is one indexed lookup (`(businessId, userId)` unique) per business
 * request.
 */
@Injectable()
export class BusinessSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(BusinessSession.name)
    private readonly sessionModel: Model<BusinessSessionDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_BUSINESS_SESSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: { userId?: string; actorId?: string; accountType?: string };
    }>();

    const user = request.user;
    if (!user || user.accountType !== 'business') return true;

    const businessId = user.userId;
    const actorId = user.actorId;
    if (!businessId || !actorId) return true;
    if (!Types.ObjectId.isValid(businessId) || !Types.ObjectId.isValid(actorId)) {
      return true;
    }

    const raw = request.headers['x-device-id'];
    const deviceId = Array.isArray(raw) ? raw[0] : raw;
    if (!deviceId) return true;

    const session = await this.sessionModel
      .findOne({
        businessId: new Types.ObjectId(businessId),
        userId: new Types.ObjectId(actorId),
      })
      .select('deviceId')
      .lean();

    // No row: never claimed (or already released by logout) — not eviction.
    if (!session) return true;

    if (session.deviceId !== deviceId) {
      throw new UnauthorizedException(BUSINESS_SESSION_ENDED);
    }

    return true;
  }
}
