import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../auth/refresh-token.schema';

export interface AdminSessionItem {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Không xác định được phiên đang dùng từ token id — luôn false. */
  current: boolean;
}

const MAX_SESSIONS = 50;

/**
 * Phiên thiết bị của một tài khoản.
 * Chỉ đọc đúng 4 trường của refresh token — tokenHash là credential sống,
 * lộ ra là chiếm được phiên.
 */
@Injectable()
export class AdminSessionService {
  constructor(
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async list(userId: string): Promise<AdminSessionItem[]> {
    // Id sai định dạng → Mongoose CastError 500; user không tồn tại thì không
    // có phiên nào để liệt kê.
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('User not found');
    }
    const now = new Date();
    // Bỏ token vừa hết hạn vừa bị thu hồi: nó không còn ý nghĩa với moderator.
    const rows = await this.refreshTokenModel
      .find({
        userId,
        $or: [{ expiresAt: { $gt: now } }, { revokedAt: null }],
      })
      .sort({ createdAt: -1 })
      .limit(MAX_SESSIONS)
      .select('_id createdAt expiresAt revokedAt')
      .lean<
        Array<{
          _id: unknown;
          createdAt: Date;
          expiresAt: Date;
          revokedAt: Date | null;
        }>
      >();

    return rows.map((r) => ({
      id: String(r._id),
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      revokedAt: r.revokedAt ?? null,
      current: false,
    }));
  }

  async revokeOne(
    userId: string,
    tokenId: string,
  ): Promise<{ revoked: boolean }> {
    // ObjectId hỏng mà vẫn query sẽ ném CastError 500 — coi như không tồn tại.
    if (!Types.ObjectId.isValid(tokenId)) {
      throw new NotFoundException('Phiên không tồn tại');
    }
    // Lọc cả userId để admin không thu hồi chéo phiên của tài khoản khác.
    const res = await this.refreshTokenModel.updateOne(
      { _id: tokenId, userId },
      { $set: { revokedAt: new Date() } },
    );
    if (!res.matchedCount) {
      throw new NotFoundException('Phiên không tồn tại');
    }
    return { revoked: true };
  }
}
