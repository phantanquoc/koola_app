import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../auth/refresh-token.schema';
import { MediaService } from '../media/media.service';
import { ListUsersDto } from './dto/list-users.dto';
import { PaginationDto } from './dto/pagination.dto';

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

  async listPendingBusinesses(dto: PaginationDto): Promise<{
    data: (UserDocument & { licenseImageUrl: string | null })[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: QueryFilter<UserDocument> = {
      accountType: 'business',
      verificationStatus: 'pending',
    };

    const [docs, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select(SAFE_PROJECTION)
        .sort({ createdAt: 1 })
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

  async approveBusiness(id: string): Promise<UserDocument> {
    const business = await this.userModel
      .findOneAndUpdate(
        { _id: id, accountType: 'business' },
        {
          $set: { verificationStatus: 'verified' },
          $unset: { rejectionReason: '' },
        },
        { new: true },
      )
      .select(SAFE_PROJECTION);

    if (!business) {
      throw new NotFoundException('Business account not found');
    }
    return business;
  }

  // ─── POST /admin/businesses/:id/reject ─────────────────────────────────────

  async rejectBusiness(
    id: string,
    rejectionReason: string,
  ): Promise<UserDocument> {
    if (!rejectionReason || rejectionReason.trim().length === 0) {
      throw new BadRequestException('rejectionReason is required');
    }

    const business = await this.userModel
      .findOneAndUpdate(
        { _id: id, accountType: 'business' },
        {
          $set: {
            verificationStatus: 'rejected',
            rejectionReason: rejectionReason.trim(),
          },
        },
        { new: true },
      )
      .select(SAFE_PROJECTION);

    if (!business) {
      throw new NotFoundException('Business account not found');
    }
    return business;
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
      const regex = new RegExp(dto.search.trim(), 'i');
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

  async banUser(id: string): Promise<{ message: string }> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: { isBanned: true } }, { new: true })
      .select('_id');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Revoke ALL refresh tokens for this user (D4)
    await this.refreshTokenModel.updateMany(
      { userId: id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );

    return { message: 'User banned and all refresh tokens revoked' };
  }

  // ─── POST /admin/users/:id/unban ────────────────────────────────────────────

  async unbanUser(id: string): Promise<{ message: string }> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: { isBanned: false } }, { new: true })
      .select('_id');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { message: 'User unbanned' };
  }
}
