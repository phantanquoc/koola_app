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
import { ExportBusinessesDto } from './dto/export-businesses.dto';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
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
    slaOver72: number;
    slaDay1_3: number;
    slaFresh: number;
    expiringSoon: number;
  }> {
    const now = Date.now();
    const h72 = new Date(now - 72 * 3_600_000);
    const h24 = new Date(now - 24 * 3_600_000);
    const pendingBase = {
      accountType: 'business',
      verificationStatus: 'pending',
    };
    const [
      totalPersonal,
      totalBusiness,
      pendingVerification,
      verifiedBusinesses,
      rejectedBusinesses,
      bannedUsers,
      slaOver72,
      slaDay1_3,
      slaFresh,
      expiringSoon,
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
      this.userModel.countDocuments({ ...pendingBase, createdAt: { $lt: h72 } }),
      this.userModel.countDocuments({
        ...pendingBase,
        createdAt: { $gte: h72, $lt: h24 },
      }),
      this.userModel.countDocuments({ ...pendingBase, createdAt: { $gte: h24 } }),
      // Tab "Sắp hết hạn": verified + licenseExpiresAt trong 30 ngày tới
      this.userModel.countDocuments({
        accountType: 'business',
        verificationStatus: 'verified',
        deletedAt: null,
        licenseExpiresAt: {
          $gte: new Date(now),
          $lte: new Date(now + 30 * 24 * 3_600_000),
        },
      }),
    ]);

    return {
      totalPersonal,
      totalBusiness,
      pendingVerification,
      verifiedBusinesses,
      rejectedBusinesses,
      bannedUsers,
      slaOver72,
      slaDay1_3,
      slaFresh,
      expiringSoon,
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
    return this.queryBusinesses(dto, page, limit);
  }

  /**
   * Export: cùng bộ lọc với list nhưng cap riêng 500 dòng (list thường cap 100
   * để bảo vệ API — export qua endpoint list sẽ 400 vì limit vượt Max).
   */
  async exportBusinesses(dto: ExportBusinessesDto): Promise<{
    data: (UserDocument & { licenseImageUrl: string | null })[];
    total: number;
    page: number;
    limit: number;
    truncated: boolean;
  }> {
    const result = await this.queryBusinesses(dto, 1, 500);
    return { ...result, truncated: result.total > result.data.length };
  }

  private async queryBusinesses(
    dto: ListPendingBusinessesDto | ExportBusinessesDto,
    page: number,
    limit: number,
  ): Promise<{
    data: (UserDocument & { licenseImageUrl: string | null })[];
    total: number;
    page: number;
    limit: number;
  }> {
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
    if (dto.relationshipType) {
      (filter as Record<string, unknown>).relationshipType =
        dto.relationshipType;
    }
    if (dto.banned === 'true') {
      (filter as Record<string, unknown>).isBanned = true;
    } else if (dto.banned === 'false') {
      (filter as Record<string, unknown>).isBanned = { $ne: true };
    }

    // ponytail: SLA bucket theo tuổi createdAt — chỉ có nghĩa khi duyệt pending
    if (dto.sla) {
      const now = Date.now();
      const h72 = new Date(now - 72 * 3_600_000);
      const h24 = new Date(now - 24 * 3_600_000);
      (filter as Record<string, unknown>).createdAt =
        dto.sla === 'over72'
          ? { $lt: h72 }
          : dto.sla === 'day1_3'
            ? { $gte: h72, $lt: h24 }
            : { $gte: h24 };
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
    const ALLOWED_SORT = new Set([
      'createdAt',
      'displayName',
      'province',
      'businessCategory',
      'relationshipType',
    ]);
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

  async getBusiness(id: string): Promise<
    UserDocument & {
      licenseImageUrl: string | null;
      logoUrl: string | null;
      coverUrl: string | null;
      owner: {
        _id: string;
        displayName: string;
        email?: string;
      } | null;
      ownerBusinessCount: number;
    }
  > {
    const business = await this.userModel
      .findOne({ _id: id, accountType: 'business', deletedAt: null })
      .select(SAFE_PROJECTION)
      .lean();
    if (!business) {
      throw new NotFoundException('Business account not found');
    }

    // Presign chỉ ở detail (URL hết hạn sau 1h + payload). Presign là HMAC cục
    // bộ, không round-trip MinIO, nên 3 key song song là rẻ.
    const presign = async (key?: string): Promise<string | null> => {
      if (!key) return null;
      try {
        return await this.mediaService.generatePresignedGetUrl(key);
      } catch {
        return null;
      }
    };
    const [licenseImageUrl, logoUrl, coverUrl] = await Promise.all([
      presign(business.licenseImageKey),
      presign(business.logoKey),
      presign(business.coverKey),
    ]);

    // Chủ tài khoản (chỉ có khi business do user tự tạo qua app) + số business
    // cùng chủ — tín hiệu phát hiện farm tài khoản (giới hạn 10/owner).
    let owner: { _id: string; displayName: string; email?: string } | null = null;
    let ownerBusinessCount = 0;
    const ownerId = business.ownerUserId
      ? String(business.ownerUserId)
      : undefined;
    if (ownerId) {
      const [ownerDoc, count] = await Promise.all([
        this.userModel
          .findById(ownerId)
          .select('displayName email')
          .lean(),
        this.userModel.countDocuments({
          ownerUserId: business.ownerUserId,
          accountType: 'business',
          deletedAt: null,
        }),
      ]);
      ownerBusinessCount = count;
      if (ownerDoc) {
        owner = {
          _id: ownerId,
          displayName: ownerDoc.displayName,
          ...(ownerDoc.email ? { email: ownerDoc.email } : {}),
        };
      }
    }

    return {
      ...business,
      licenseImageUrl,
      logoUrl,
      coverUrl,
      owner,
      ownerBusinessCount,
    } as unknown as UserDocument & {
      licenseImageUrl: string | null;
      logoUrl: string | null;
      coverUrl: string | null;
      owner: { _id: string; displayName: string; email?: string } | null;
      ownerBusinessCount: number;
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
      const q = dto.search.trim();
      const escaped = escapeRegExp(q);
      const regex = new RegExp(escaped, 'i');
      const or: Record<string, unknown>[] = [
        { displayName: regex },
        { email: regex },
        { phone: regex },
      ];
      // Link /users?search=<id> (từ ReportDrawer, owner của business) chỉ hoạt
      // động khi search match _id — trước đây thiếu nhánh này.
      if (Types.ObjectId.isValid(q)) or.push({ _id: new Types.ObjectId(q) });
      filterParts.$or = or;
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
  ): Promise<{ message: string; accountType: string }> {
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

    return {
      message: 'User banned and all refresh tokens revoked',
      accountType: user.accountType,
    };
  }

  // ─── POST /admin/users/:id/unban ────────────────────────────────────────────

  async unbanUser(id: string): Promise<{ message: string; accountType: string }> {
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

    return { message: 'User unbanned', accountType: user.accountType };
  }

  async bulkApproveBusiness(
    ids: string[],
    actorId?: string,
  ): Promise<{ modified: number; results: { id: string; ok: boolean; error?: string }[] }> {
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        await this.approveBusiness(id, actorId);
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
    actorId?: string,
  ): Promise<{ modified: number; results: { id: string; ok: boolean; error?: string }[] }> {
    if (!reason || reason.trim().length === 0)
      throw new BadRequestException('rejectionReason is required');
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        await this.rejectBusiness(id, reason, actorId);
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
      .select('taxCode contactPhone contactEmail licenseImageKey')
      .lean();
    if (!self) throw new NotFoundException('Business account not found');
    // ponytail: O(1) $or scan capped at 10; dedicated compound index if this gets hot
    const or: Record<string, unknown>[] = [];
    if (self.taxCode) or.push({ taxCode: self.taxCode });
    if (self.contactPhone) or.push({ contactPhone: self.contactPhone });
    if (self.contactEmail) or.push({ contactEmail: self.contactEmail });
    if (self.licenseImageKey) or.push({ licenseImageKey: self.licenseImageKey });
    if (or.length === 0) return [];
    const docs = await this.userModel
      .find({
        accountType: 'business',
        deletedAt: null,
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
    'displayName',
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
    patch: UpdateBusinessDto,
  ): Promise<UserDocument> {
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    for (const k of AdminService.BUSINESS_PATCH_KEYS) {
      const raw = (patch as Record<string, unknown>)[k];
      if (raw === undefined) continue;

      if (k === 'licenseExpiresAt') {
        const s = String(raw).trim();
        if (!s) {
          // Chuỗi rỗng = xoá ngày. Trước đây '' được $set thẳng → CastError 500.
          unset.licenseExpiresAt = '';
          continue;
        }
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException('licenseExpiresAt is not a valid date');
        }
        set[k] = d;
        continue;
      }

      set[k] = typeof raw === 'string' ? raw.trim() : raw;
    }
    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
      throw new BadRequestException('No updatable fields provided');
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;

    const business = await this.userModel
      .findOneAndUpdate(
        { _id: id, accountType: 'business', deletedAt: null },
        update,
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

  async createBusiness(
    data: CreateBusinessDto,
    actorId?: string,
  ): Promise<UserDocument> {
    if (!data.displayName?.trim()) {
      throw new BadRequestException('displayName is required');
    }
    const email = data.contactEmail?.trim().toLowerCase();
    if (email) {
      // Kiểm ĐÚNG field sẽ lưu (contactEmail), không phải `email` — business
      // account không có `email` nên check cũ không bao giờ bắt được trùng.
      const taken = await this.userModel.exists({
        accountType: 'business',
        deletedAt: null,
        $or: [{ contactEmail: email }, { email }],
      });
      if (taken) {
        throw new ConflictException('Email này đã được dùng cho tài khoản khác');
      }
    }
    const doc = await this.userModel.create({
      accountType: 'business',
      displayName: data.displayName.trim(),
      ...(email ? { contactEmail: email } : {}),
      ...(data.contactPhone?.trim()
        ? { contactPhone: data.contactPhone.trim() }
        : {}),
      ...(data.businessCategory
        ? { businessCategory: data.businessCategory }
        : {}),
      ...(data.province ? { province: data.province } : {}),
      ...(data.address?.trim() ? { address: data.address.trim() } : {}),
      ...(data.taxCode ? { taxCode: data.taxCode } : {}),
      ...(data.licenseExpiresAt
        ? { licenseExpiresAt: new Date(data.licenseExpiresAt) }
        : {}),
      ...(data.internalNote?.trim()
        ? { internalNote: data.internalNote.trim() }
        : {}),
      verificationStatus: 'pending',
      verificationHistory: [
        {
          status: 'pending',
          at: new Date(),
          ...(actorId ? { actorId } : {}),
        },
      ],
    });
    return (await this.userModel
      .findById(doc._id)
      .select(SAFE_PROJECTION)
      .lean()) as UserDocument;
  }
}
