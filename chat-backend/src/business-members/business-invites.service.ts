import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import {
  BusinessInvite,
  BusinessInviteDocument,
} from './schemas/business-invite.schema';
import {
  BusinessMember,
  BusinessMemberDocument,
} from './schemas/business-member.schema';
import { User, UserDocument } from '../users/user.schema';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { EmailService } from '../auth/email.service';
import { BusinessAuditLogsService } from './business-audit-logs.service';

/**
 * Deep-link prefix for invite emails.
 *
 * MUST stay a scheme the mobile app actually claims. `koola` is registered in
 * AndroidManifest.xml (`<data android:scheme="koola" />`) and in React
 * Navigation's `linking.prefixes` (navigation/momentsLinking.ts); the original
 * `app://` in the proposal was claimed by nothing, so those emails produced a
 * link no device could open.
 */
const INVITE_LINK_PREFIX = 'koola://invite';

/** `koola://invite?token=<jwt>` — parsed by the app's AcceptInvite route. */
function buildInviteLink(token: string): string {
  return `${INVITE_LINK_PREFIX}?token=${encodeURIComponent(token)}`;
}

@Injectable()
export class BusinessInvitesService {
  private readonly logger = new Logger(BusinessInvitesService.name);

  constructor(
    @InjectModel(BusinessInvite.name)
    private inviteModel: Model<BusinessInviteDocument>,
    @InjectModel(BusinessMember.name)
    private memberModel: Model<BusinessMemberDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private emailService: EmailService,
    @Inject(forwardRef(() => BusinessAuditLogsService))
    private readonly auditLogsService: BusinessAuditLogsService,
  ) {}

  // Task 6.2-6.4: Create invite with JWT token and send email
  async createInvite(
    businessId: string,
    dto: CreateInviteDto,
    invitedBy: string,
  ): Promise<any> {
    // Validate business exists
    const business = await this.userModel.findById(businessId);
    if (!business || business.accountType !== 'business') {
      throw new NotFoundException('Business account not found');
    }

    // Check if email is already a member
    const existingUser = await this.userModel.findOne({ email: dto.email });
    if (existingUser) {
      const existingMember = await this.memberModel.findOne({
        businessId: new Types.ObjectId(businessId),
        userId: existingUser._id,
        status: 'active',
      });
      if (existingMember) {
        throw new ConflictException('User is already a member of this business');
      }
    }

    // Check for pending invite
    const pendingInvite = await this.inviteModel.findOne({
      businessId: new Types.ObjectId(businessId),
      email: dto.email.toLowerCase(),
      status: 'pending',
    });
    if (pendingInvite) {
      throw new ConflictException(
        'Pending invite already exists for this email',
      );
    }

    // Task 6.3: Generate JWT token with 7-day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const tokenPayload = {
      businessId,
      email: dto.email.toLowerCase(),
      role: dto.role,
      invitedBy,
    };

    const token = this.jwtService.sign(tokenPayload, { expiresIn: '7d' });

    // Save invite to database
    const invite = await this.inviteModel.create({
      businessId: new Types.ObjectId(businessId),
      email: dto.email.toLowerCase(),
      role: dto.role,
      token,
      invitedBy: new Types.ObjectId(invitedBy),
      expiresAt,
      status: 'pending',
    });

    // Task 6.4: Send invite email
    try {
      const inviter = await this.userModel
        .findById(invitedBy)
        .select('displayName');
      const inviteLink = buildInviteLink(token);

      await this.emailService.sendInviteEmail(
        dto.email,
        business.displayName || 'Koola Business',
        inviter?.displayName || 'A business owner',
        dto.role,
        inviteLink,
      );

      this.logger.log(
        `[Invite] Sent to ${dto.email} for business ${businessId}`,
      );
    } catch (error) {
      this.logger.error(`[Invite] Failed to send email:`, error);
      // Don't fail the request - invite is created, email can be resent
    }

    // Task 9.7: Audit log member invitation
    await this.auditLogsService.auditLog({
      businessId,
      actorId: invitedBy,
      eventType: 'member.invited',
      resourceId: invite._id.toString(),
      metadata: {
        email: dto.email,
        role: dto.role,
      },
    });

    return {
      id: invite._id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt,
    };
  }

  // Task 6.5: Verify invite token without accepting
  async verifyInvite(token: string): Promise<any> {
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch (error) {
      throw new BadRequestException('Invalid or expired invite token');
    }

    const invite = await this.inviteModel
      .findOne({ token, status: 'pending' })
      .populate('businessId', 'displayName logoKey')
      .populate('invitedBy', 'displayName');

    if (!invite) {
      throw new NotFoundException(
        'Invite not found or already accepted/revoked',
      );
    }

    if (new Date() > invite.expiresAt) {
      throw new BadRequestException('Invite has expired');
    }

    return {
      businessId: invite.businessId,
      email: invite.email,
      role: invite.role,
      invitedBy: invite.invitedBy,
      expiresAt: invite.expiresAt,
    };
  }

  // Task 6.6: Accept invite and create membership
  async acceptInvite(dto: AcceptInviteDto, userId: string): Promise<any> {
    // Verify token and get invite
    const inviteData = await this.verifyInvite(dto.token);

    const invite = await this.inviteModel.findOne({
      token: dto.token,
      status: 'pending',
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    // Verify user email matches invite
    const user = await this.userModel.findById(userId).select('email');
    if (user?.email?.toLowerCase() !== invite.email) {
      throw new ForbiddenException(
        'This invite is for a different email address',
      );
    }

    // Check if already a member (race condition guard)
    const existingMember = await this.memberModel.findOne({
      businessId: invite.businessId,
      userId: new Types.ObjectId(userId),
    });

    if (existingMember) {
      // Mark invite accepted anyway
      invite.status = 'accepted';
      await invite.save();
      return { alreadyMember: true };
    }

    // Create membership
    await this.memberModel.create({
      businessId: invite.businessId,
      userId: new Types.ObjectId(userId),
      role: invite.role,
      invitedBy: invite.invitedBy,
      joinedAt: new Date(),
      status: 'active',
    });

    // Mark invite as accepted
    invite.status = 'accepted';
    await invite.save();

    this.logger.log(
      `[Invite] Accepted by user ${userId} for business ${invite.businessId}`,
    );

    return {
      success: true,
      businessId: invite.businessId,
      role: invite.role,
    };
  }

  // Task 6.7: List pending invites for a business
  async listInvites(businessId: string): Promise<any[]> {
    const invites = await this.inviteModel
      .find({
        businessId: new Types.ObjectId(businessId),
        status: 'pending',
      })
      .populate('invitedBy', 'displayName')
      .sort({ createdAt: -1 });

    return invites.map((inv) => ({
      id: inv._id,
      email: inv.email,
      role: inv.role,
      invitedBy: inv.invitedBy,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      status: inv.status,
    }));
  }

  // Task 6.8: Revoke invite
  async revokeInvite(inviteId: string, businessId: string): Promise<void> {
    const invite = await this.inviteModel.findOne({
      _id: new Types.ObjectId(inviteId),
      businessId: new Types.ObjectId(businessId),
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.status === 'accepted') {
      throw new BadRequestException('Cannot revoke an accepted invite');
    }

    invite.status = 'revoked';
    await invite.save();
  }

  // Task 6.9: Resend invite email
  async resendInvite(inviteId: string, businessId: string): Promise<void> {
    const invite = await this.inviteModel
      .findOne({
        _id: new Types.ObjectId(inviteId),
        businessId: new Types.ObjectId(businessId),
      })
      .populate('businessId', 'displayName')
      .populate('invitedBy', 'displayName');

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.status !== 'pending') {
      throw new BadRequestException(
        'Can only resend pending invites',
      );
    }

    if (new Date() > invite.expiresAt) {
      throw new BadRequestException('Invite has expired');
    }

    const inviteLink = buildInviteLink(invite.token);
    const business = invite.businessId as any;
    const inviter = invite.invitedBy as any;

    await this.emailService.sendInviteEmail(
      invite.email,
      business.displayName || 'Koola Business',
      inviter.displayName || 'A business owner',
      invite.role,
      inviteLink,
    );

    this.logger.log(`[Invite] Resent to ${invite.email}`);
  }
}
