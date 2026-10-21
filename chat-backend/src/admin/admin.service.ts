import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../auth/refresh-token.schema';
import { MediaService } from '../media/media.service';
import { SellerVisibilityService } from '../commerce/seller-visibility/seller-visibility.service';
import { ListUsersDto } from './dto/list-users.dto';
import { ListPendingBusinessesDto } from './dto/list-pending-businesses.dto';
import { PaginationDto } from './dto/pagination.dto';
import { escapeRegExp } from '../common/utils/escape-regexp';

/**
 * Safe projection — NEVER exposes passwordHash, fcmTokens, or refresh tokens.
 * Applied on every user-returning query in this service.
 */
const SAFE_PROJECTION = '-passwordHash -fcmTokens' as const;

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly mediaService: MediaService,
    // commerce-catalog D1: every verification/ban mutator re-syncs the
    // denormalized `CommerceProduct.sellerActive` flag of the affected seller(s).
    private readonly sellerVisibility: SellerVisibilityService,
  ) {}

  // ─── GET /admin/me ──────────────────────────────────────────────────────────

  async getMe(actorId: string): Promise<UserDocument> {
    const user = await this.userModel
      .findById(actorId)
      .select(SAFE_PROJECTION)
      .lean();
    if (!user) {
      throw new NotFoundException('Admin user not found');
    }
    return user as UserDocument;
  }

  // ─── GET /admin/stats ───────────────────────────────────────────────────────

  async getStats(): Promise<{
    totalPersonal: number;
    totalBusiness: number;
    pendingVerification: number;
    verifiedBusinesses: number;
    rejectedBusinesses: number;
    bannedUsers: number;
  }> {
    const [
      totalPersonal,
      totalBusiness,
      pendingVerification,
      verifiedBusinesses,
      rejectedBusinesses,
      bannedUsers,
    ] = await Promise.all([
      this.userModel.countDocuments({ accountType: 'personal' }),
      this.userModel.countDocuments({ accountType: 'business' }),
      this.userModel.countDocuments({
        accountType: 'business',
        verificationStatus: 'pending',
      }),
      this.userModel.countDocuments({
        accountType: 'business',
        verificationStatus: 'verified',
      }),
      this.userModel.countDocuments({
        accountType: 'business',
        verificationStatus: 'rejected',
      }),
      this.userModel.countDocuments({ isBanned: true }),
    ]);

    return {
      totalPersonal,
      totalBusiness,
      pendingVerification,
      verifiedBusinesses,
      rejectedBusinesses,
      bannedUsers,
    };
  }

  // ─── GET /admin/businesses/pending ─────────────────────────────────────────

  async listPendingBusinesses(dto: ListPendingBusinessesDto): Promise<{
    data: (UserDocument & { licenseImageUrl: string | null })[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    // ponytail: 'all' omits the status filter; 'expiring' = verified + license due within 30d
    const filter: QueryFilter<UserDocument> = {
      accountType: 'business',
      deletedAt: null,
    };

    if (dto.status === 'expiring') {
      (filter as Record<string, unknown>).verificationStatus = 'verified';
      (filter as Record<string, unknown>).licenseExpiresAt = {
        $gte: new Date(),
        $lte: new Date(Date.now() + 30 * 24 * 3_600_000),
      };
    } else if (dto.status && dto.status !== 'all') {
      (filter as Record<string, unknown>).verificationStatus = dto.status;
    } else if (!dto.status) {
      (filter as Record<string, unknown>).verificationStatus = 'pending';
    }

    if (dto.category?.trim()) {
      (filter as Record<string, unknown>).businessCategory = dto.category.trim();
    }
    if (dto.province?.trim()) {
      (filter as Record<string, unknown>).province = dto.province.trim();
    }
    if (dto.assignee?.trim()) {
      (filter as Record<string, unknown>).assignee = dto.assignee.trim();
    }

    if (dto.search && dto.search.trim().length > 0) {
      const q = dto.search.trim();
      const escaped = escapeRegExp(q);
      const regex = new RegExp(escaped, 'i');
      const or: Record<string, unknown>[] = [
        { displayName: regex },
        { email: regex },
        { contactPhone: regex },
      ];
      if (Types.ObjectId.isValid(q)) or.push({ _id: new Types.ObjectId(q) });
      (filter as Record<string, unknown>).$or = or;
    }

    // ponytail: whitelist keeps sort injection-proof; extend list if UI needs more keys
    const ALLOWED_SORT = new Set(['createdAt', 'displayName']);
    let sort: Record<string, 1 | -1> = { createdAt: 1 };
    if (dto.sort) {
      const [field, dir] = dto.sort.split(':');
      if (ALLOWED_SORT.has(field)) sort = { [field]: dir === 'desc' ? -1 : 1 };
    }

    const [docs, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select(SAFE_PROJECTION)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    // Enrich with presigned URL for license image (D5: null when no key)
    const data = await Promise.all(
      docs.map(async (doc) => {
        let licenseImageUrl: string | null = null;
        if (doc.licenseImageKey) {
          try {
            licenseImageUrl = await this.mediaService.generatePresignedGetUrl(
              doc.licenseImageKey,
            );
          } catch {
            licenseImageUrl = null;
          }
        }
        return { ...doc, licenseImageUrl } as unknown as UserDocument & {
          licenseImageUrl: string | null;
        };
      }),
    );

    return { data, total, page, limit };
  }

  // ─── POST /admin/businesses/:id/approve ────────────────────────────────────

  async approveBusiness(id: string, actorId?: string): Promise<UserDocument> {
    const business = await this.userModel
      .findOneAndUpdate(
        { _id: id, accountType: 'business', verificationStatus: 'pending' },
        {
          $set: { verificationStatus: 'verified' },
          $unset: { rejectionReason: '' },
          $push: {
            verificationHistory: {
              status: 'verified',
              at: new Date(),
              ...(actorId ? { actorId } : {}),
            },
          },
        },
        { new: true },
      )
      .select(SAFE_PROJECTION);

    if (!business) {
      await this.throwNotFoundOrConflict(id);
      throw new NotFoundException('Business account not found');
    }
    await this.sellerVisibility.syncSellers([id]);
    return business;
  }

  // ─── POST /admin/businesses/:id/reject ─────────────────────────────────────

  async rejectBusiness(
    id: string,
    rejectionReason: string,
    actorId?: string,
  ): Promise<UserDocument> {
    if (!rejectionReason || rejectionReason.trim().length === 0) {
      throw new BadRequestException('rejectionReason is required');
    }

    const reason = rejectionReason.trim();
    const business = await this.userModel
      .findOneAndUpdate(
        { _id: id, accountType: 'business', verificationStatus: 'pending' },
        {
          $set: {
            verificationStatus: 'rejected',
            rejectionReason: reason,
          },
          $push: {
            verificationHistory: {
              status: 'rejected',
              at: new Date(),
              reason,
              ...(actorId ? { actorId } : {}),
            },
          },
        },
        { new: true },
      )
      .select(SAFE_PROJECTION);

    if (!business) {
      await this.throwNotFoundOrConflict(id);
      throw new NotFoundException('Business account not found');
    }
    await this.sellerVisibility.syncSellers([id]);
    return business;
  }

  // Shared 404-vs-409 discriminator for approve/reject.
  private async throwNotFoundOrConflict(id: string): Promise<never> {
    const exists = await this.userModel.exists({ _id: id });
    if (exists) throw new ConflictException('already processed');
    throw new NotFoundException('Business account not found');
  }

  // ─── GET /admin/businesses/:id ─────────────────────────────────────────────

  async getBusiness(
    id: string,
  ): Promise<UserDocument & { licenseImageUrl: string | null }> {
    const business = await this.userModel
      .findOne({ _id: id, accountType: 'business' })
      .select(SAFE_PROJECTION)
      .lean();
    if (!business) {
      throw new NotFoundException('Business account not found');
    }
    let licenseImageUrl: string | null = null;
    if (business.licenseImageKey) {
      try {
        licenseImageUrl = await this.mediaService.generatePresignedGetUrl(
          business.licenseImageKey,
        );
      } catch {
        licenseImageUrl = null;
      }
    }
    return { ...business, licenseImageUrl } as unknown as UserDocument & {
      licenseImageUrl: string | null;
    };
  }

  // ─── GET /admin/users ───────────────────────────────────────────────────────

  async listUsers(dto: ListUsersDto): Promise<{
    data: UserDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const filterParts: Record<string, unknown> = {};

    if (dto.accountType) {
      filterParts.accountType = dto.accountType;
    }

    if (dto.search && dto.search.trim().length > 0) {
      const escaped = escapeRegExp(dto.search.trim());
      const regex = new RegExp(escaped, 'i');
      filterParts.$or = [
        { displayName: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const filter = filterParts as QueryFilter<UserDocument>;

    const [docs, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select(SAFE_PROJECTION)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return { data: docs as UserDocument[], total, page, limit };
  }

  // ─── GET /admin/users/:id ───────────────────────────────────────────────────

  async getUserById(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findById(id)
      .select(SAFE_PROJECTION)
      .lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user as UserDocument;
  }

  // ─── POST /admin/users/:id/ban ──────────────────────────────────────────────

  async banUser(
    id: string,
    opts?: { reason?: string; durationDays?: number },
  ): Promise<{ message: string }> {
    const update: Record<string, unknown> = { isBanned: true };
    if (opts?.reason) update['banReason'] = opts.reason;
    if (opts?.durationDays && opts.durationDays > 0) {
      update['bannedUntil'] = new Date(
        Date.now() + opts.durationDays * 24 * 60 * 60 * 1000,
      );
    }
    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .select('_id accountType');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Revoke ALL refresh tokens for this user (D4)
    await this.refreshTokenModel.updateMany(
      { userId: id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );

    // A banned business's products must disappear from the public catalog.
    if (user.accountType === 'business') {
      await this.sellerVisibility.syncSellers([id]);
    }

    return { message: 'User banned and all refresh tokens revoked' };
  }

  // ─── POST /admin/users/:id/unban ────────────────────────────────────────────

  async unbanUser(id: string): Promise<{ message: string }> {
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          $set: { isBanned: false },
          $unset: { bannedUntil: '', banReason: '' },
        },
        { new: true },
      )
      .select('_id accountType');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // An unbanned verified business's products become publicly visible again.
    if (user.accountType === 'business') {
      await this.sellerVisibility.syncSellers([id]);
    }

    return { message: 'User unbanned' };
  }

  async bulkApproveBusiness(
    ids: string[],
  ): Promise<{ modified: number; results: { id: string; ok: boolean; error?: string }[] }> {
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        await this.approveBusiness(id);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: (e as Error).message });
      }
    }
    await this.sellerVisibility.syncSellers(ids);
    return { modified: results.filter((r) => r.ok).length, results };
  }

  async bulkRejectBusiness(
    ids: string[],
    reason: string,
  ): Promise<{ modified: number; results: { id: string; ok: boolean; error?: string }[] }> {
    if (!reason || reason.trim().length === 0)
      throw new BadRequestException('rejectionReason is required');
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        await this.rejectBusiness(id, reason);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: (e as Error).message });
      }
    }
    await this.sellerVisibility.syncSellers(ids);
    return { modified: results.filter((r) => r.ok).length, results };
  }

  // ─── GET /admin/businesses/:id/duplicates ──────────────────────────────────

  async findDuplicates(id: string): Promise<UserDocument[]> {
    const self = await this.userModel
      .findOne({ _id: id, accountType: 'business' })
      .select('taxCode contactPhone licenseImageKey')
      .lean();
    if (!self) throw new NotFoundException('Business account not found');
    // ponytail: O(1) $or scan capped at 10; dedicated compound index if this gets hot
    const or: Record<string, unknown>[] = [];
    if (self.taxCode) or.push({ taxCode: self.taxCode });
    if (self.contactPhone) or.push({ contactPhone: self.contactPhone });
    if (self.licenseImageKey) or.push({ licenseImageKey: self.licenseImageKey });
    if (or.length === 0) return [];
    const docs = await this.userModel
      .find({
        accountType: 'business',
        _id: { $ne: self._id },
        $or: or,
      })
      .select(SAFE_PROJECTION)
      .limit(10)
      .lean();
    return docs as UserDocument[];
  }

  // Whitelisted patch keys — never allow verificationStatus/isBanned via PATCH.
  static readonly BUSINESS_PATCH_KEYS = [
    'businessCategory',
    'province',
    'address',
    'website',
    'tagline',
    'description',
    'contactEmail',
    'contactPhone',
    'taxCode',
    'licenseExpiresAt',
    'internalNote',
    'assignee',
  ] as const;

  async updateBusiness(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<UserDocument> {
    const set: Record<string, unknown> = {};
    for (const k of AdminService.BUSINESS_PATCH_KEYS) {
      if (patch[k] !== undefined) set[k] = patch[k];
    }
    if (Object.keys(set).length === 0) {
      throw new BadRequestException('No updatable fields provided');
    }
    const business = await this.userModel
      .findOneAndUpdate(
        { _id: id, accountType: 'business', deletedAt: null },
        { $set: set },
        { new: true },
      )
      .select(SAFE_PROJECTION);
    if (!business) throw new NotFoundException('Business account not found');
    return business;
  }

  async setSuspended(id: string, suspended: boolean): Promise<UserDocument> {
    const business = await this.userModel
      .findOneAndUpdate(
        { _id: id, accountType: 'business', deletedAt: null },
        {
          $set: { suspended },
          $push: {
            verificationHistory: {
              status: suspended ? 'suspended' : 'unsuspended',
              at: new Date(),
            },
          },
        },
        { new: true },
      )
      .select(SAFE_PROJECTION);
    if (!business) throw new NotFoundException('Business account not found');
    await this.sellerVisibility.syncSellers([id]);
    return business;
  }

  async softDeleteBusiness(id: string): Promise<{ message: string }> {
    const business = await this.userModel
      .findOneAndUpdate(
        { _id: id, accountType: 'business', deletedAt: null },
        {
          $set: { deletedAt: new Date(), verificationStatus: 'rejected' },
          $push: {
            verificationHistory: { status: 'deleted', at: new Date() },
          },
        },
        { new: true },
      )
      .select('_id accountType');
    if (!business) throw new NotFoundException('Business account not found');
    await this.sellerVisibility.syncSellers([id]);
    return { message: 'Business soft-deleted' };
  }

  // ─── POST /admin/businesses/:id/reopen ─────────────────────────────────────
  // Đưa hồ sơ đã duyệt/từ chối về pending (hoàn tác duyệt nhầm trong 10s).

  async reopenBusiness(id: string): Promise<UserDocument> {
    const business = await this.userModel
      .findOneAndUpdate(
        { _id: id, accountType: 'business', deletedAt: null },
        {
          $set: { verificationStatus: 'pending' },
          $unset: { rejectionReason: '' },
          $push: {
            verificationHistory: { status: 'reopened', at: new Date() },
          },
        },
        { new: true },
      )
      .select(SAFE_PROJECTION);
    if (!business) throw new NotFoundException('Business account not found');
    await this.sellerVisibility.syncSellers([id]);
    return business;
  }

  async createBusiness(data: {
    displayName: string;
    contactEmail?: string;
    contactPhone?: string;
    businessCategory?: string;
    province?: string;
  }): Promise<UserDocument> {
    if (!data.displayName?.trim()) {
      throw new BadRequestException('displayName is required');
    }
    const doc = await this.userModel.create({
      accountType: 'business',
      displayName: data.displayName.trim(),
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      businessCategory: data.businessCategory,
      province: data.province,
      verificationStatus: 'pending',
    });
    return (await this.userModel
      .findById(doc._id)
      .select(SAFE_PROJECTION)
      .lean()) as UserDocument;
  }
}
