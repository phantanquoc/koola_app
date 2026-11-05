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
import { UpdateUserDto } from './dto/update-user.dto';
import { ExportUsersDto } from './dto/export-users.dto';
import { PaginationDto } from './dto/pagination.dto';
import { escapeRegExp } from '../common/utils/escape-regexp';

/**
 * Safe projection — NEVER exposes passwordHash, fcmTokens, refresh tokens or
 * the 2FA secret/recovery codes. Applied on every user-returning query.
 */
const SAFE_PROJECTION =
  '-passwordHash -fcmTokens -twoFactorSecret -twoFactorRecoveryCodes' as const;

/** Tóm tắt business sở hữu bởi một tài khoản cá nhân (GET /admin/users/:id). */
export interface OwnedBusinessSummary {
  _id: string;
  displayName: string;
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  isBanned?: boolean;
  suspended?: boolean;
  deletedAt?: Date | null;
}

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
    platformAdmins: number;
    archivedUsers: number;
    slaOver72: number;
    slaDay1_3: number;
    slaFresh: number;
    expiringSoon: number;
    archivedBusinesses: number;
  }> {
    const now = Date.now();
    const h72 = new Date(now - 72 * 3_600_000);
    const h24 = new Date(now - 24 * 3_600_000);
    // Mọi count phải loại hồ sơ đã xóa mềm — nếu không, số trên tab lớn hơn
    // danh sách thật (list luôn lọc deletedAt: null) và luôn dư một hồ sơ ma.
    const liveBase = { accountType: 'business', deletedAt: null };
    const pendingBase = { ...liveBase, verificationStatus: 'pending' };
    const [
      totalPersonal,
      totalBusiness,
      pendingVerification,
      verifiedBusinesses,
      rejectedBusinesses,
      bannedUsers,
      platformAdmins,
      archivedUsers,
      slaOver72,
      slaDay1_3,
      slaFresh,
      expiringSoon,
      archivedBusinesses,
    ] = await Promise.all([
      this.userModel.countDocuments({ accountType: 'personal', deletedAt: null }),
      this.userModel.countDocuments(liveBase),
      this.userModel.countDocuments({ ...liveBase, verificationStatus: 'pending' }),
      this.userModel.countDocuments({ ...liveBase, verificationStatus: 'verified' }),
      this.userModel.countDocuments({ ...liveBase, verificationStatus: 'rejected' }),
      // Bị cấm nhưng không còn trong hệ thống (doanh nghiệp đã xoá mềm) không
      // tính — tab "Bị cấm" của trang Người dùng lọc deletedAt: null.
      this.userModel.countDocuments({ isBanned: true, deletedAt: null }),
      this.userModel.countDocuments({ isPlatformAdmin: true, deletedAt: null }),
      // Tab Lưu trữ của trang Người dùng: tài khoản bị xoá mềm, khôi phục được.
      this.userModel.countDocuments({ deletedAt: { $ne: null } }),
      this.userModel.countDocuments({ ...pendingBase, createdAt: { $lt: h72 } }),
      this.userModel.countDocuments({
        ...pendingBase,
        createdAt: { $gte: h72, $lt: h24 },
      }),
      this.userModel.countDocuments({ ...pendingBase, createdAt: { $gte: h24 } }),
      // Tab "Giấy phép": verified + licenseExpiresAt trong 30 ngày tới HOẶC đã
      // quá hạn. Hết hạn mà không hiện ở đâu = doanh nghiệp mất pháp lý vẫn bán.
      this.userModel.countDocuments({
        ...liveBase,
        verificationStatus: 'verified',
        licenseExpiresAt: { $lte: new Date(now + 30 * 24 * 3_600_000) },
      }),
      this.userModel.countDocuments({
        accountType: 'business',
        deletedAt: { $ne: null },
      }),
    ]);

    return {
      totalPersonal,
      totalBusiness,
      pendingVerification,
      verifiedBusinesses,
      rejectedBusinesses,
      bannedUsers,
      platformAdmins,
      archivedUsers,
      slaOver72,
      slaDay1_3,
      slaFresh,
      expiringSoon,
      archivedBusinesses,
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

    // ponytail: 'all' omits the status filter; 'expiring' = verified + license
    // quá hạn HOẶC còn ≤30 ngày — hết hạn rồi mà bị ẩn thì không ai đi gia hạn.
    // 'archived' = hồ sơ đã xoá mềm: trước đây xoá xong là mất dấu hoàn toàn,
    // không xem lại được để khôi phục nhầm.
    const archived = dto.status === 'archived';
    const filter: QueryFilter<UserDocument> = {
      accountType: 'business',
      deletedAt: archived ? { $ne: null } : null,
    };

    if (archived) {
      // giữ nguyên: cột Trạng thái vẫn đọc verificationStatus (đã set 'rejected')
    } else if (dto.status === 'expiring') {
      (filter as Record<string, unknown>).verificationStatus = 'verified';
      (filter as Record<string, unknown>).licenseExpiresAt = {
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
    // "Đang tạm ngưng bán" — hồ sơ verified nhưng sản phẩm đang bị ẩn.
    // Trước đây không lọc được nên moderator không tìm ra ai đang bị ngưng.
    if (dto.suspended === 'true') {
      (filter as Record<string, unknown>).suspended = true;
    } else if (dto.suspended === 'false') {
      (filter as Record<string, unknown>).suspended = { $ne: true };
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
        { contactEmail: regex },
        { contactPhone: regex },
        // Moderator tra hồ sơ theo MST khi đối chiếu giấy phép — trước đây
        // gõ MST vào ô tìm kiếm không ra gì.
        { taxCode: regex },
      ];
      // Link từ hồ sơ người dùng ("doanh nghiệp sở hữu") và từ báo cáo đều dán
      // một id vào ô tìm kiếm — không match `_id`/`ownerUserId` thì link chết.
      if (Types.ObjectId.isValid(q)) {
        const oid = new Types.ObjectId(q);
        or.push({ _id: oid }, { ownerUserId: oid });
      }
      (filter as Record<string, unknown>).$or = or;
    }

    // ponytail: whitelist keeps sort injection-proof; extend list if UI needs more keys
    const ALLOWED_SORT = new Set([
      'createdAt',
      // Tab Lưu trữ hiển thị cột "Xoá lúc" — thiếu field này thì bấm sort
      // không có tác dụng (header vẫn đổi mũi tên, dữ liệu không đổi).
      'deletedAt',
      'displayName',
      'province',
      'businessCategory',
      'relationshipType',
      'licenseExpiresAt',
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

  /**
   * @param opts.includeDeleted đọc được hồ sơ đã xoá mềm — chỉ dùng khi mở từ
   * tab Lưu trữ để khôi phục nhầm. Mặc định vẫn ẩn.
   */
  async getBusiness(
    id: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<
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
      .findOne({
        _id: id,
        accountType: 'business',
        ...(opts.includeDeleted ? {} : { deletedAt: null }),
      })
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
    const filter = this.buildUsersFilter(dto);

    const [docs, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select(SAFE_PROJECTION)
        .sort(this.buildUsersSort(dto.sort))
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return { data: docs as UserDocument[], total, page, limit };
  }

  /**
   * GET /admin/users/export — cùng bộ lọc với list, cap 500.
   *
   * Dùng CHUNG `buildUsersFilter` với list: nếu export tự dựng filter riêng thì
   * filter mới thêm cho list (banned/archived/verificationStatus) sẽ lặng lẽ
   * không áp dụng cho file CSV — moderator tưởng đã xuất đúng tập.
   */
  async exportUsers(dto: ExportUsersDto): Promise<{
    data: UserDocument[];
    total: number;
    limit: number;
    truncated: boolean;
  }> {
    const limit = 500;
    const filter = this.buildUsersFilter(dto);
    const [docs, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select(SAFE_PROJECTION)
        .sort(this.buildUsersSort(dto.sort))
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);
    return {
      data: docs as UserDocument[],
      total,
      limit,
      truncated: total > docs.length,
    };
  }

  /** Filter dùng chung cho list + export (tránh lệch giữa hai đường). */
  private buildUsersFilter(
    dto: ListUsersDto | ExportUsersDto,
  ): QueryFilter<UserDocument> {
    const archived = dto.status === 'archived';
    const filterParts: Record<string, unknown> = {
      // Tab Lưu trữ hiện hồ sơ đã xoá mềm; mọi tab khác chỉ hiện bản ghi sống.
      deletedAt: archived ? { $ne: null } : null,
    };

    if (dto.accountType) {
      filterParts.accountType = dto.accountType;
    }

    if (dto.verificationStatus) {
      filterParts.verificationStatus = dto.verificationStatus;
    }

    // Tab trạng thái. `all`/`live` = không thêm điều kiện.
    if (dto.status === 'banned') {
      filterParts.isBanned = true;
    } else if (dto.status === 'admin') {
      filterParts.isPlatformAdmin = true;
    }

    if (dto.search && dto.search.trim().length > 0) {
      const q = dto.search.trim();
      const escaped = escapeRegExp(q);
      const regex = new RegExp(escaped, 'i');
      const or: Record<string, unknown>[] = [
        { displayName: regex },
        { email: regex },
        { phone: regex },
        { username: regex },
        // Tài khoản doanh nghiệp để liên hệ ở contactEmail/contactPhone chứ
        // không phải email/phone gốc — tra bằng thông tin trên giấy phép không ra.
        { contactEmail: regex },
        { contactPhone: regex },
      ];
      // Link /users?search=<id> (từ báo cáo, chủ sở hữu doanh nghiệp) chỉ hoạt
      // động khi search match _id.
      if (Types.ObjectId.isValid(q)) or.push({ _id: new Types.ObjectId(q) });
      filterParts.$or = or;
    }

    return filterParts as QueryFilter<UserDocument>;
  }

  /**
   * Whitelist sort — chặn injection và chỉ cho field UI thật sự hiển thị
   * (mỗi cột sort được phải có nút trên header).
   */
  private buildUsersSort(raw?: string): Record<string, 1 | -1> {
    const ALLOWED_SORT = new Set(['createdAt', 'displayName', 'deletedAt']);
    if (raw) {
      const [field, dir] = raw.split(':');
      if (ALLOWED_SORT.has(field)) return { [field]: dir === 'desc' ? -1 : 1 };
    }
    return { createdAt: -1 };
  }

  // ─── GET /admin/users/:id ───────────────────────────────────────────────────

  /**
   * Chi tiết một tài khoản + quan hệ sở hữu hai chiều.
   *
   * Tài khoản cá nhân là chủ của các tài khoản doanh nghiệp (`ownerUserId`), nên
   * moderator mở hồ sơ một người cần thấy ngay họ đang sở hữu doanh nghiệp nào —
   * trước đây thông tin đó chỉ tồn tại ở chiều ngược (drawer doanh nghiệp hiện
   * "sở hữu N doanh nghiệp") và không có đường xem tiếp.
   */
  async getUserById(id: string): Promise<
    UserDocument & {
      ownedBusinesses: OwnedBusinessSummary[];
      owner: { _id: string; displayName: string; email?: string } | null;
    }
  > {
    // Id sai định dạng → Mongoose CastError → 500 lộ stack. UI chỉ cần 404.
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('User not found');
    // Cố tình không lọc `deletedAt`: tab Lưu trữ mở được chi tiết tài khoản đã
    // xoá mềm để đối soát trước khi khôi phục.
    const user = await this.userModel
      .findById(id)
      .select(SAFE_PROJECTION)
      .lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [ownedBusinesses, owner] = await Promise.all([
      // Danh sách business cùng chủ. Giữ cả hồ sơ đã xoá mềm — câu hỏi "người
      // này sở hữu những gì" không được trả lời thiếu, nhưng UI phải đánh dấu.
      this.userModel
        .find({ ownerUserId: new Types.ObjectId(id), accountType: 'business' })
        .select('displayName verificationStatus isBanned suspended deletedAt')
        .sort({ createdAt: 1 })
        .lean<OwnedBusinessSummary[]>(),
      // Chiều ngược: business do user tạo qua app có chủ sở hữu. Trả tên thay vì
      // chỉ id để UI link thẳng, không bắt moderator dán ObjectId đi tra.
      user.ownerUserId
        ? this.userModel
            .findById(user.ownerUserId)
            .select('displayName email')
            .lean()
            .then((doc) =>
              doc
                ? {
                    _id: String(doc._id),
                    displayName: doc.displayName,
                    ...(doc.email ? { email: doc.email } : {}),
                  }
                : null,
            )
        : Promise.resolve(null),
    ]);

    return { ...user, ownedBusinesses, owner } as unknown as UserDocument & {
      ownedBusinesses: OwnedBusinessSummary[];
      owner: { _id: string; displayName: string; email?: string } | null;
    };
  }

  // ─── PATCH /admin/users/:id ─────────────────────────────────────────────────

  /**
   * Whitelist field admin được sửa trên tài khoản.
   *
   * Không có `accountType` (đổi loại tài khoản gãy toàn bộ dữ liệu liên quan),
   * `isBanned`/`isPlatformAdmin`/`suspended` (mỗi cái có endpoint + audit +
   * side-effect riêng), `passwordHash` (admin không được đặt mật khẩu người khác).
   * `adminRole` chỉ super được đổi — controller chặn trước khi gọi service.
   */
  static readonly USER_PATCH_KEYS = [
    'displayName',
    'username',
    'email',
    'phone',
    'bio',
    'internalNote',
    'adminRole',
  ] as const;

  async updateUser(id: string, patch: UpdateUserDto): Promise<UserDocument> {
    // Hồ sơ đã xoá mềm chỉ đọc (khôi phục trước rồi sửa) — đồng bộ với
    // updateBusiness. Nếu không, sửa một bản ghi "không tồn tại" là thao tác
    // vô hình với mọi trang khác.
    const existing = await this.userModel
      .findOne({ _id: id, deletedAt: null })
      .select('email username phone accountType')
      .lean();
    if (!existing) throw new NotFoundException('Không tìm thấy tài khoản đang hoạt động');

    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    for (const k of AdminService.USER_PATCH_KEYS) {
      const raw = (patch as Record<string, unknown>)[k];
      if (raw === undefined) continue;
      const value = typeof raw === 'string' ? raw.trim() : raw;
      // Chuỗi rỗng trên field unique = gửi null vào index unique → E11000.
      // `$unset` mới đúng nghĩa "xoá khỏi hồ sơ".
      if (
        value === '' &&
        (k === 'username' || k === 'phone' || k === 'email' || k === 'bio')
      ) {
        unset[k] = '';
        continue;
      }
      set[k] = k === 'username' || k === 'email' ? String(value).toLowerCase() : value;
    }

    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
      throw new BadRequestException('No updatable fields provided');
    }

    // Unique của schema là `email`/`phone`/`username` — kiểm tay để trả 409 đọc
    // được thay vì E11000 lộ ra dưới dạng 500.
    for (const field of ['email', 'phone', 'username'] as const) {
      const v = set[field];
      if (typeof v !== 'string' || !v) continue;
      const taken = await this.userModel.exists({
        _id: { $ne: id },
        [field]: v,
      });
      if (taken) {
        const label = field === 'email' ? 'Email' : field === 'phone' ? 'Số điện thoại' : 'Tên đăng nhập';
        throw new ConflictException(`${label} này đã được dùng cho tài khoản khác`);
      }
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;

    // Lọc deletedAt: null ở câu ghi luôn — hồ sơ có thể vừa bị xoá giữa lúc đọc
    // và lúc ghi (2 moderator cùng mở).
    const user = await this.userModel
      .findOneAndUpdate({ _id: id, deletedAt: null }, update, { new: true })
      .select(SAFE_PROJECTION)
      .lean();
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản đang hoạt động');

    // Đổi email = đổi danh tính đăng nhập. Thu hồi phiên để lần refresh sau
    // không mang email cũ trong JWT (token chứa email claim).
    if (set.email && set.email !== existing.email) {
      await this.revokeAllSessions(id);
    }

    return user as UserDocument;
  }

  // ─── DELETE /admin/users/:id (xoá mềm) ──────────────────────────────────────

  /**
   * Xoá mềm: set `deletedAt`, thu hồi mọi phiên, ẩn sản phẩm nếu là doanh nghiệp.
   * Không xoá cứng — đối soát/hoàn tác vẫn cần bản ghi, và report/audit trỏ vào id.
   */
  async softDeleteUser(id: string): Promise<{ message: string }> {
    const user = await this.userModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $set: { deletedAt: new Date(), isOnline: false } },
        { new: true },
      )
      .select('_id accountType')
      .lean();
    // Id sai định dạng → CastError 500; id đúng nhưng đã xoá → 404 (idempotent
    // theo nghĩa "không còn gì để xoá", UI hiện thông báo thay vì lỗi hệ thống).
    if (!user) {
      if (!Types.ObjectId.isValid(id)) throw new NotFoundException('User not found');
      const exists = await this.userModel.exists({ _id: id });
      throw new NotFoundException(exists ? 'Tài khoản đã bị xoá trước đó' : 'User not found');
    }

    await this.revokeAllSessions(id);
    if (user.accountType === 'business') {
      await this.sellerVisibility.syncSellers([id]);
    }
    return { message: 'User soft-deleted, sessions revoked' };
  }

  // ─── POST /admin/users/:id/restore ──────────────────────────────────────────

  async restoreUser(id: string): Promise<{ message: string }> {
    const user = await this.userModel
      .findOneAndUpdate(
        { _id: id, deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
        { new: true },
      )
      .select('_id accountType')
      .lean();
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản đã xoá để khôi phục');
    }
    // Đã bỏ cấm lúc xoá? Không — khôi phục trả về đúng trạng thái trước khi xoá,
    // kể cả isBanned. Người vận hành gỡ cấm riêng nếu cần.
    if (user.accountType === 'business') {
      await this.sellerVisibility.syncSellers([id]);
    }
    return { message: 'User restored' };
  }

  // ─── POST /admin/users/:id/revoke-sessions ──────────────────────────────────

  /**
   * Thu hồi toàn bộ refresh token — "đăng xuất mọi thiết bị".
   *
   * Dùng khi tài khoản bị chiếm đoạt nhưng chưa đủ căn cứ cấm, hoặc sau khi đổi
   * email/SĐT. Access token sống tối đa 1h nên không thu hồi được — UI phải nói
   * rõ điều đó thay vì hứa "đăng xuất ngay".
   */
  async revokeSessions(id: string): Promise<{ revoked: number }> {
    const user = await this.userModel.exists({ _id: id });
    if (!user) throw new NotFoundException('User not found');
    return { revoked: await this.revokeAllSessions(id) };
  }

  private async revokeAllSessions(userId: string): Promise<number> {
    const res = await this.refreshTokenModel.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    return res.modifiedCount ?? 0;
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
    // Hoa hồng đi cùng hồ sơ doanh nghiệp: đổi qua PATCH để luôn có audit.
    'commissionRate',
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

    // Đổi email liên hệ sang email của hồ sơ khác = 2 doanh nghiệp cùng địa chỉ,
    // phá luôn giả định "1 email ↔ 1 hồ sơ" mà createBusiness đang bảo vệ.
    if (typeof set.contactEmail === 'string') {
      const email = set.contactEmail as string;
      set.contactEmail = email.toLowerCase();
      if (email) {
        const taken = await this.userModel.exists({
          _id: { $ne: id },
          accountType: 'business',
          deletedAt: null,
          $or: [{ contactEmail: email.toLowerCase() }, { email: email.toLowerCase() }],
        });
        if (taken) {
          throw new ConflictException('Email này đã được dùng cho hồ sơ khác');
        }
      }
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

  // ─── POST /admin/businesses/:id/restore ────────────────────────────────────
  // Khôi phục hồ sơ đã xoá mềm. Về 'pending' (không phải 'verified'): hồ sơ
  // từng bị xoá phải được duyệt lại trước khi bán hàng, tránh khôi phục nhầm
  // một doanh nghiệp đã bị xử lý vì vi phạm.

  async restoreBusiness(id: string): Promise<UserDocument> {
    const business = await this.userModel
      .findOneAndUpdate(
        { _id: id, accountType: 'business', deletedAt: { $ne: null } },
        {
          $set: { deletedAt: null, verificationStatus: 'pending' },
          $unset: { rejectionReason: '' },
          $push: {
            verificationHistory: { status: 'restored', at: new Date() },
          },
        },
        { new: true },
      )
      .select(SAFE_PROJECTION);
    if (!business) throw new NotFoundException('Archived business not found');
    await this.sellerVisibility.syncSellers([id]);
    return business;
  }

  // ─── POST /admin/businesses/bulk-assign ────────────────────────────────────
  // Nhận hồ sơ về mình: 1 updateMany thay vì N request PATCH.

  async bulkAssignBusiness(
    ids: string[],
    assignee: string | null,
  ): Promise<{ modified: number }> {
    const update = assignee
      ? { $set: { assignee } }
      : { $unset: { assignee: '' } };
    const res = await this.userModel.updateMany(
      { _id: { $in: ids }, accountType: 'business', deletedAt: null },
      update,
    );
    return { modified: res.modifiedCount };
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
