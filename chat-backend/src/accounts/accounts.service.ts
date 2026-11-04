import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';
import { AuthService } from '../auth/auth.service';
import { CreateBusinessAccountDto } from './dto/create-business-account.dto';
import { BusinessMembersService } from '../business-members/business-members.service';
import { BusinessSessionsService } from '../business-members/business-sessions.service';

/** Soft per-owner limit for business accounts. Raise via env or code as needed. */
export const MAX_BUSINESS_ACCOUNTS_PER_OWNER = 10;

/**
 * Escape user input destined for a MongoDB $regex operator. Without this a
 * caller can craft a pattern that triggers catastrophic backtracking or fails
 * to compile, surfacing as a 500 from a public-facing search endpoint.
 */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly authService: AuthService,
    @Inject(forwardRef(() => BusinessMembersService))
    private readonly businessMembersService: BusinessMembersService,
    @Inject(forwardRef(() => BusinessSessionsService))
    private readonly businessSessionsService: BusinessSessionsService,
  ) {}

  // ─── List accounts ──────────────────────────────────────────────────────────

  /**
   * Returns the root personal account plus all business accounts accessible by
   * the root user (owned + member businesses).
   * Task 7.1-7.3: Include member businesses with role + owner info
   */
  async listAccounts(actorId: string): Promise<any[]> {
    // The root is always the personal-account user (actorId = act ?? sub).
    const root = await this.userModel
      .findById(actorId)
      .select('_id displayName avatar accountType verificationStatus logoKey');
    if (!root) throw new NotFoundException('Root account not found');

    // Owned businesses + the caller's memberships are independent — fetch together.
    const [ownedBusinesses, memberships] = await Promise.all([
      this.userModel
        .find({ ownerUserId: new Types.ObjectId(actorId) })
        .select(
          '_id displayName avatar accountType verificationStatus logoKey businessCategory',
        )
        .lean(),
      // Task 7.1-7.2: Query business_members for member businesses
      this.businessMembersService.getMembershipsForUser(actorId),
    ]);

    const ownedIds = new Set(ownedBusinesses.map((b) => String(b._id)));

    // Lazy migration (task 2.1) writes an `owner` membership row for every owned
    // business the first time its owner switches in, so `memberships` contains
    // owned businesses too. Drop them here — otherwise an owned business shows
    // twice in the switcher (once under "your accounts", once under "member").
    const joined = (memberships as Array<{ businessId: unknown; role: string }>)
      .filter((m) => !ownedIds.has(String(m.businessId)));
    const roleByBusiness = new Map(joined.map((m) => [String(m.businessId), m.role]));

    // Task 7.3 — batched: ONE query for every joined business, ONE for their
    // owners, ONE grouped count for owned-business member counts (task 13.5).
    // The previous per-membership findById pair was an N+1 on the switcher.
    const [joinedBusinesses, memberCounts] = await Promise.all([
      roleByBusiness.size
        ? this.userModel
            .find({
              _id: {
                $in: [...roleByBusiness.keys()].map((id) => new Types.ObjectId(id)),
              },
            })
            .select(
              '_id displayName avatar accountType verificationStatus logoKey businessCategory ownerUserId',
            )
            .lean()
        : Promise.resolve([] as Array<Record<string, any>>),
      this.businessMembersService.countActiveMembers([...ownedIds]),
    ]);

    const ownerIds = [
      ...new Set(
        joinedBusinesses
          .map((b: any) => b.ownerUserId?.toString())
          .filter((id): id is string => !!id),
      ),
    ];
    const owners = ownerIds.length
      ? await this.userModel
          .find({ _id: { $in: ownerIds.map((id) => new Types.ObjectId(id)) } })
          .select('_id displayName')
          .lean()
      : [];
    const ownerName = new Map(
      owners.map((o: any) => [String(o._id), o.displayName as string]),
    );

    const memberBusinesses = joinedBusinesses.map((business: any) => ({
      ...business,
      role: roleByBusiness.get(String(business._id)),
      ownerDisplayName:
        ownerName.get(business.ownerUserId?.toString() ?? '') || 'Unknown',
      isMember: true,
    }));

    // Return root + owned businesses + member businesses
    return [
      typeof (root as any).toObject === 'function' ? root.toObject() : root,
      ...ownedBusinesses.map((b) => ({
        ...b,
        role: 'owner',
        isMember: false,
        // No membership rows yet = owner not migrated yet = the owner alone.
        memberCount: memberCounts.get(String(b._id)) ?? 1,
      })),
      ...memberBusinesses,
    ];
  }

  // ─── Create business account ────────────────────────────────────────────────

  async createBusinessAccount(
    actorId: string,
    dto: CreateBusinessAccountDto,
  ): Promise<UserDocument> {
    // Enforce soft limit
    const existingCount = await this.userModel.countDocuments({
      ownerUserId: new Types.ObjectId(actorId),
      accountType: 'business',
    });
    if (existingCount >= MAX_BUSINESS_ACCOUNTS_PER_OWNER) {
      throw new ConflictException(
        `Maximum ${MAX_BUSINESS_ACCOUNTS_PER_OWNER} business accounts per owner`,
      );
    }

    const business = await this.userModel.create({
      displayName: dto.displayName,
      accountType: 'business',
      ownerUserId: new Types.ObjectId(actorId),
      verificationStatus: 'pending',
      isBanned: false,
      businessCategory: dto.businessCategory,
      province: dto.province,
      relationshipType: dto.relationshipType,
      licenseImageKey: dto.licenseImageKey,
      tagline: dto.tagline,
      description: dto.description,
      address: dto.address,
      website: dto.website,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      logoKey: dto.logoKey,
    });

    return business;
  }

  // ─── Switch account ─────────────────────────────────────────────────────────

  /**
   * Ownership-checks the target, then mints a delegated access token.
   * The root refresh token is never touched here.
   * Task 2.2: Call ensureOwnerMembership before issuing token
   * Task 7: Support member businesses (not just owned)
   * Task 8.2: Create/replace session for business accounts
   *
   * @param actorId  The human actor (root = act ?? sub from the current token)
   * @param targetAccountId  The account to switch into
   * @param deviceId Optional device ID for session tracking
   * @param deviceMetadata Optional device metadata
   * @returns A new short-lived access token
   */
  async switchAccount(
    actorId: string,
    targetAccountId: string,
    deviceId?: string,
    deviceMetadata?: {
      deviceModel?: string;
      osVersion?: string;
      appVersion?: string;
    },
  ): Promise<{ accessToken: string; forcedLogout?: boolean }> {
    // Switching back to personal (target === root) is always allowed.
    if (targetAccountId === actorId) {
      const root = await this.userModel.findById(actorId).select('_id');
      if (!root) throw new NotFoundException('Account not found');

      // Personal switch-back: no `act` claim — structurally identical to a login token.
      const token = this.authService.mintAccessToken({
        sub: actorId,
        accountType: 'personal',
      });
      return { accessToken: token };
    }

    // Load the target and verify ownership + ban status
    const target = await this.userModel
      .findById(targetAccountId)
      .select('_id accountType ownerUserId isBanned');
    if (!target) throw new NotFoundException('Target account not found');

    if (target.isBanned) {
      throw new ForbiddenException('This account has been banned');
    }

    // Task 2.2: Ensure owner membership exists (lazy migration)
    await this.businessMembersService.ensureOwnerMembership(targetAccountId);

    const ownerId = target.ownerUserId?.toString();
    let userRole: string | null = null;

    // Check if user owns the account
    if (ownerId && ownerId === actorId) {
      userRole = 'owner';
    } else {
      // Task 7.4-7.5: Check if user is a member of the business
      userRole = await this.businessMembersService.getMemberRole(
        targetAccountId,
        actorId,
      );
    }

    if (!userRole) {
      throw new ForbiddenException('You do not have access to this account');
    }

    // Task 8.2: Create or replace session if deviceId provided
    let forcedLogout = false;
    if (deviceId) {
      const sessionResult = await this.businessSessionsService.createOrReplaceSession(
        targetAccountId,
        actorId,
        deviceId,
        deviceMetadata,
      );
      forcedLogout = sessionResult.forcedLogout;

      // TODO Task 8.5: Send push notification if forcedLogout
      if (forcedLogout && sessionResult.oldDeviceId) {
        this.logger.log(
          `[Switch] Device ${sessionResult.oldDeviceId} force logged out`,
        );
      }
    }

    const token = this.authService.mintAccessToken({
      sub: targetAccountId,
      act: actorId,
      accountType: 'business',
      role: userRole,
    });

    return { accessToken: token, forcedLogout };
  }

  // ─── Discovery (used by ConnectController) ──────────────────────────────────

  async discoverBusinesses(params: {
    relationshipType?: string;
    province?: string;
    businessCategory?: string;
    q?: string;
    sort?: string;
    cursor?: string;
    limit?: number;
    /** Caller's actorId — used to hide their own owned businesses from the list */
    actorId?: string;
  }): Promise<{
    items: UserDocument[];
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const rawLimit = params.limit ?? 20;
    const safeLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20;
    const limit = Math.min(safeLimit, 50);
    const filter: Record<string, unknown> = {
      accountType: 'business',
      verificationStatus: 'verified',
      isBanned: false,
    };

    if (params.relationshipType && params.relationshipType !== 'all') {
      filter.relationshipType = params.relationshipType;
    }
    if (params.province) {
      filter.province = params.province;
    }
    if (params.businessCategory && params.businessCategory !== 'all') {
      filter.businessCategory = params.businessCategory;
    }
    if (params.q) {
      filter.displayName = {
        $regex: escapeRegex(params.q),
        $options: 'i',
      };
    }
    // Hide the caller's own owned businesses so they cannot self-message via
    // the discovery surface (POST /conversations/direct/:self → 400).
    if (params.actorId && Types.ObjectId.isValid(params.actorId)) {
      filter.ownerUserId = { $ne: new Types.ObjectId(params.actorId) };
    }
    if (params.cursor && Types.ObjectId.isValid(params.cursor)) {
      filter._id = { $lt: new Types.ObjectId(params.cursor) };
    }

    // Sort — default newest first; 'name' = alphabetical on displayName
    let sortQuery: Record<string, 1 | -1> = { _id: -1 };
    if (params.sort === 'name') {
      sortQuery = { displayName: 1, _id: -1 };
    }

    const items = await this.userModel
      .find(filter)
      .sort(sortQuery)
      .limit(limit + 1)
      .select(
        '_id displayName avatar accountType verificationStatus logoKey tagline ' +
          'relationshipType province businessCategory',
      );

    const hasMore = items.length > limit;
    if (hasMore) items.pop();

    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1]._id.toString()
        : null;

    return { items, hasMore, nextCursor };
  }

  // ─── Discovery — single profile ─────────────────────────────────────────────

  async discoverById(accountId: string): Promise<UserDocument> {
    const account = await this.userModel
      .findOne({
        _id: new Types.ObjectId(accountId),
        accountType: 'business',
        verificationStatus: 'verified',
        isBanned: false,
      })
      .select(
        '_id displayName avatar accountType verificationStatus logoKey tagline description ' +
          'relationshipType province businessCategory address website contactEmail contactPhone',
      );

    if (!account) {
      throw new NotFoundException('Business account not found');
    }
    return account;
  }
}
