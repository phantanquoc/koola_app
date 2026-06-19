import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';
import { AuthService } from '../auth/auth.service';
import { CreateBusinessAccountDto } from './dto/create-business-account.dto';

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
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly authService: AuthService,
  ) {}

  // ─── List accounts ──────────────────────────────────────────────────────────

  /**
   * Returns the root personal account plus all business accounts owned by
   * the root user.
   */
  async listAccounts(actorId: string): Promise<UserDocument[]> {
    // The root is always the personal-account user (actorId = act ?? sub).
    const root = await this.userModel
      .findById(actorId)
      .select('_id displayName avatar accountType verificationStatus logoKey');
    if (!root) throw new NotFoundException('Root account not found');

    const businesses = await this.userModel
      .find({ ownerUserId: new Types.ObjectId(actorId) })
      .select('_id displayName avatar accountType verificationStatus logoKey');

    return [root, ...businesses];
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
   *
   * @param actorId  The human actor (root = act ?? sub from the current token)
   * @param targetAccountId  The account to switch into
   * @returns A new short-lived access token
   */
  async switchAccount(
    actorId: string,
    targetAccountId: string,
  ): Promise<{ accessToken: string }> {
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

    const ownerId = target.ownerUserId?.toString();
    if (!ownerId || ownerId !== actorId) {
      throw new ForbiddenException('You do not own this account');
    }

    if (target.isBanned) {
      throw new ForbiddenException('This account has been banned');
    }

    const token = this.authService.mintAccessToken({
      sub: targetAccountId,
      act: actorId,
      accountType: 'business',
    });
    return { accessToken: token };
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
    const safeLimit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20;
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
