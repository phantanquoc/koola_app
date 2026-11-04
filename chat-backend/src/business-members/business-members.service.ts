import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BusinessMember,
  BusinessMemberDocument,
} from './schemas/business-member.schema';
import { User, UserDocument } from '../users/user.schema';
import { ChangeRoleDto } from './dto/change-role.dto';
import { BusinessSessionsService } from './business-sessions.service';
import { BusinessAuditLogsService } from './business-audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BusinessMembersService {
  private readonly logger = new Logger(BusinessMembersService.name);

  constructor(
    @InjectModel(BusinessMember.name)
    private memberModel: Model<BusinessMemberDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => BusinessSessionsService))
    private readonly businessSessionsService: BusinessSessionsService,
    @Inject(forwardRef(() => BusinessAuditLogsService))
    private readonly auditLogsService: BusinessAuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Task 2.1-2.6: Lazy migration - ensure owner membership exists
  async ensureOwnerMembership(businessId: string): Promise<void> {
    const business = await this.userModel
      .findById(businessId)
      .select('ownerUserId');
    if (!business || !business.ownerUserId) {
      return; // Not a business account or no owner
    }

    try {
      await this.memberModel.create({
        businessId: new Types.ObjectId(businessId),
        userId: business.ownerUserId,
        role: 'owner',
        status: 'active',
        joinedAt: new Date(),
      });
    } catch (error) {
      // Duplicate key error (11000) means membership already exists - this is fine (idempotent)
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  // Task 5.2: List members
  async listMembers(businessId: string): Promise<any[]> {
    const members = await this.memberModel
      .find({
        businessId: new Types.ObjectId(businessId),
        status: 'active',
      })
      .populate('userId', 'displayName avatar email')
      .populate('invitedBy', 'displayName')
      .sort({ joinedAt: 1 });

    return members.map((m) => ({
      _id: m._id,
      userId: m.userId,
      role: m.role,
      invitedBy: m.invitedBy,
      joinedAt: m.joinedAt,
      lastActiveAt: m.lastActiveAt,
      status: m.status,
    }));
  }

  // Task 5.3: Change member role
  async changeMemberRole(
    businessId: string,
    targetUserId: string,
    dto: ChangeRoleDto,
    actorId: string,
  ): Promise<void> {
    // Prevent self-role-change
    if (targetUserId === actorId) {
      throw new BadRequestException('Cannot change your own role');
    }

    // Check if target is a member
    const targetMember = await this.memberModel.findOne({
      businessId: new Types.ObjectId(businessId),
      userId: new Types.ObjectId(targetUserId),
      status: 'active',
    });

    if (!targetMember) {
      throw new NotFoundException('Member not found');
    }

    const oldRole = targetMember.role;

    // Check if demoting last owner
    if (targetMember.role === 'owner' && dto.role !== 'owner') {
      const ownerCount = await this.memberModel.countDocuments({
        businessId: new Types.ObjectId(businessId),
        role: 'owner',
        status: 'active',
      });

      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Business must have at least one owner',
        );
      }
    }

    await this.memberModel.updateOne(
      { _id: targetMember._id },
      { role: dto.role },
    );

    // Task 9.7: Audit log member role change
    await this.auditLogsService.auditLog({
      businessId,
      actorId,
      eventType: 'member.role_changed',
      resourceId: targetUserId,
      changes: {
        before: { role: oldRole },
        after: { role: dto.role },
      },
    });

    // Task 9.11: only a promotion TO owner is owner-notifying — that hands over
    // full control (including deleting the business). Routine role changes are
    // in the audit log and would be push noise.
    if (dto.role === 'owner' && oldRole !== 'owner') {
      const target = await this.userModel
        .findById(targetUserId)
        .select('displayName')
        .lean();
      await this.notifyOwnersOfSensitiveEvent({
        businessId,
        actorId,
        eventType: 'member.role_changed',
        resourceId: targetUserId,
        title: 'Thành viên được nâng quyền chủ sở hữu',
        body: `${target?.displayName || 'Một thành viên'} giờ là chủ sở hữu và có toàn quyền.`,
      });
    }
  }

  /**
   * Task 9.11: push a sensitive membership event to every OTHER owner.
   *
   * "Other" matters: the owner who performed the action already knows, and a
   * push telling you what you just did is noise. Owners are read from the
   * membership rows (not `User.ownerUserId`) so a business with co-owners
   * notifies all of them.
   *
   * Never throws — the membership change is already committed.
   */
  private async notifyOwnersOfSensitiveEvent(params: {
    businessId: string;
    actorId: string;
    eventType: string;
    title: string;
    body: string;
    resourceId?: string;
  }): Promise<void> {
    try {
      const [owners, business] = await Promise.all([
        this.memberModel
          .find({
            businessId: new Types.ObjectId(params.businessId),
            role: 'owner',
            status: 'active',
          })
          .select('userId')
          .lean(),
        this.userModel
          .findById(params.businessId)
          .select('displayName')
          .lean(),
      ]);

      const businessName = business?.displayName || 'Tài khoản kinh doanh';
      const recipients = owners
        .map((o: any) => String(o.userId))
        .filter((id) => id && id !== params.actorId);

      await Promise.all(
        recipients.map((ownerUserId) =>
          this.notificationsService.sendBusinessSensitiveEventPush({
            ownerUserId,
            businessId: params.businessId,
            businessName,
            title: params.title || businessName,
            body: params.body,
            eventType: params.eventType,
            resourceId: params.resourceId,
          }),
        ),
      );
    } catch (err) {
      this.logger.error('[Members] Sensitive-event push failed:', err);
    }
  }

  // Task 5.4: Remove member
  async removeMember(
    businessId: string,
    targetUserId: string,
    actorId: string,
  ): Promise<void> {
    // Prevent self-removal
    if (targetUserId === actorId) {
      throw new BadRequestException(
        'Cannot remove yourself, transfer ownership first',
      );
    }

    const targetMember = await this.memberModel.findOne({
      businessId: new Types.ObjectId(businessId),
      userId: new Types.ObjectId(targetUserId),
      status: 'active',
    });

    if (!targetMember) {
      throw new NotFoundException('Member not found');
    }

    // Check if removing last owner
    if (targetMember.role === 'owner') {
      const ownerCount = await this.memberModel.countDocuments({
        businessId: new Types.ObjectId(businessId),
        role: 'owner',
        status: 'active',
      });

      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot remove last owner');
      }
    }

    // Task 5.5: Delete membership and invalidate sessions
    await this.memberModel.deleteOne({ _id: targetMember._id });

    // Task 5.5: Invalidate removed member's sessions
    await this.businessSessionsService.deleteUserSessions(
      businessId,
      targetUserId,
    );

    // Task 9.7: Audit log member removal
    await this.auditLogsService.auditLog({
      businessId,
      actorId,
      eventType: 'member.removed',
      resourceId: targetUserId,
      metadata: {
        removedRole: targetMember.role,
      },
    });

    // Task 9.11: a removal revokes someone's access — every other owner should
    // learn about it without opening the audit log.
    const removed = await this.userModel
      .findById(targetUserId)
      .select('displayName')
      .lean();
    await this.notifyOwnersOfSensitiveEvent({
      businessId,
      actorId,
      eventType: 'member.removed',
      resourceId: targetUserId,
      title: 'Thành viên đã bị xoá',
      body: `${removed?.displayName || 'Một thành viên'} (${targetMember.role}) đã bị xoá khỏi tài khoản kinh doanh.`,
    });
  }

  // Helper: Check if user is member of business
  async isMemberOf(businessId: string, userId: string): Promise<boolean> {
    const member = await this.memberModel.findOne({
      businessId: new Types.ObjectId(businessId),
      userId: new Types.ObjectId(userId),
      status: 'active',
    });
    return !!member;
  }

  // Helper: Get member role
  async getMemberRole(
    businessId: string,
    userId: string,
  ): Promise<string | null> {
    const member = await this.memberModel.findOne({
      businessId: new Types.ObjectId(businessId),
      userId: new Types.ObjectId(userId),
      status: 'active',
    });
    return member?.role || null;
  }

  // Task 7.1: Get all memberships for a user
  async getMembershipsForUser(userId: string): Promise<any[]> {
    const memberships = await this.memberModel
      .find({
        userId: new Types.ObjectId(userId),
        status: 'active',
      })
      .select('businessId role')
      .lean();

    return memberships;
  }

  /**
   * Task 13.5: active member count per business, in ONE grouped query.
   *
   * Used by the account switcher ("3 thành viên" on each owned business), so it
   * must not be a per-row lookup. Businesses with no membership rows yet (owner
   * not lazily migrated) are absent from the map — callers treat that as 1, the
   * owner alone.
   */
  async countActiveMembers(businessIds: string[]): Promise<Map<string, number>> {
    const ids = businessIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return new Map();

    const rows = await this.memberModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: { businessId: { $in: ids }, status: 'active' } },
      { $group: { _id: '$businessId', count: { $sum: 1 } } },
    ]);

    return new Map(rows.map((r) => [r._id.toString(), r.count]));
  }
}
