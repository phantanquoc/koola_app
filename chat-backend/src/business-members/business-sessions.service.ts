import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BusinessSession,
  BusinessSessionDocument,
} from './schemas/business-session.schema';
import { User, UserDocument } from '../users/user.schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BusinessSessionsService {
  private readonly logger = new Logger(BusinessSessionsService.name);

  constructor(
    @InjectModel(BusinessSession.name)
    private sessionModel: Model<BusinessSessionDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Task 8.2-8.3: Create or replace session (enforce 1 device limit)
  async createOrReplaceSession(
    businessId: string,
    userId: string,
    deviceId: string,
    deviceMetadata?: {
      deviceModel?: string;
      osVersion?: string;
      appVersion?: string;
    },
  ): Promise<{ forcedLogout: boolean; oldDeviceId?: string }> {
    // Check for existing session
    const existingSession = await this.sessionModel.findOne({
      businessId: new Types.ObjectId(businessId),
      userId: new Types.ObjectId(userId),
    });

    let forcedLogout = false;
    let oldDeviceId: string | undefined;

    if (existingSession && existingSession.deviceId !== deviceId) {
      // Different device - force logout old device
      oldDeviceId = existingSession.deviceId;
      forcedLogout = true;

      this.logger.log(
        `[Session] Force logout device ${oldDeviceId} for user ${userId} in business ${businessId}`,
      );

      // Delete old session
      await this.sessionModel.deleteOne({ _id: existingSession._id });

      // Task 8.5: tell the evicted device why it lost the session. Sent from
      // here (not the caller) so every eviction path notifies — the switch
      // endpoint and any future one. Awaited but never fatal: a push failure
      // must not block the new device from signing in.
      await this.notifyForcedLogout({
        userId,
        businessId,
        evictedDeviceId: oldDeviceId,
        newDeviceModel: deviceMetadata?.deviceModel,
      });
    }

    // Create new session (or update if same device)
    await this.sessionModel.findOneAndUpdate(
      {
        businessId: new Types.ObjectId(businessId),
        userId: new Types.ObjectId(userId),
      },
      {
        deviceId,
        deviceModel: deviceMetadata?.deviceModel,
        osVersion: deviceMetadata?.osVersion,
        appVersion: deviceMetadata?.appVersion,
        lastActiveAt: new Date(),
      },
      { upsert: true },
    );

    return { forcedLogout, oldDeviceId };
  }

  /**
   * Task 8.5: push "signed in on another device" to the evicted device.
   *
   * The business display name is resolved here so the notification names the
   * business rather than an id. Any failure (missing business, FCM down) is
   * logged and swallowed — eviction already happened and must not be undone.
   */
  private async notifyForcedLogout(params: {
    userId: string;
    businessId: string;
    evictedDeviceId?: string;
    newDeviceModel?: string;
  }): Promise<void> {
    try {
      const business = await this.userModel
        .findById(params.businessId)
        .select('displayName')
        .lean();

      await this.notificationsService.sendForcedLogoutPush({
        userId: params.userId,
        businessId: params.businessId,
        businessName: business?.displayName || 'tài khoản kinh doanh',
        newDeviceModel: params.newDeviceModel,
        evictedDeviceId: params.evictedDeviceId,
      });
    } catch (err) {
      this.logger.error('[Session] Forced-logout push failed:', err);
    }
  }

  // Task 8.6: List active sessions for a business
  async listSessions(businessId: string): Promise<any[]> {
    const sessions = await this.sessionModel
      .find({ businessId: new Types.ObjectId(businessId) })
      .populate('userId', 'displayName avatar')
      .sort({ lastActiveAt: -1 })
      .lean();

    return sessions.map((s: any) => ({
      id: s._id,
      userId: s.userId,
      deviceId: s.deviceId,
      deviceModel: s.deviceModel,
      osVersion: s.osVersion,
      appVersion: s.appVersion,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
    }));
  }

  /**
   * Task 8.7: Force logout a session.
   *
   * @param callerUserId When given, the caller's own session is protected —
   *   an admin cannot sign themselves out through the admin surface (404 would
   *   be a lie, so it is a 400 naming the reason).
   */
  async forceLogout(
    sessionId: string,
    businessId: string,
    callerUserId?: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('Session not found');
    }

    const session = await this.sessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      businessId: new Types.ObjectId(businessId),
    });

    // 404 rather than a silent success: the caller asked to end a specific
    // session, and "it was already gone" is information the UI should show.
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (callerUserId && session.userId?.toString() === callerUserId) {
      throw new BadRequestException(
        'Cannot force logout your own session — use logout instead',
      );
    }

    await this.sessionModel.deleteOne({ _id: session._id });
    this.logger.log(`[Session] Admin force logout session ${sessionId}`);
  }

  // Task 8.8: Update session activity
  async updateActivity(businessId: string, userId: string): Promise<void> {
    await this.sessionModel.updateOne(
      {
        businessId: new Types.ObjectId(businessId),
        userId: new Types.ObjectId(userId),
      },
      { lastActiveAt: new Date() },
    );
  }

  // Task 8.9: Delete session on logout
  async deleteSession(businessId: string, userId: string): Promise<void> {
    await this.sessionModel.deleteOne({
      businessId: new Types.ObjectId(businessId),
      userId: new Types.ObjectId(userId),
    });

    this.logger.log(
      `[Session] User ${userId} logged out from business ${businessId}`,
    );
  }

  // Helper: Delete all sessions for a user (when member removed)
  async deleteUserSessions(businessId: string, userId: string): Promise<void> {
    await this.sessionModel.deleteMany({
      businessId: new Types.ObjectId(businessId),
      userId: new Types.ObjectId(userId),
    });
  }
}
