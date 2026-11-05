import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';

/**
 * 5 phút: đủ để admin đọc lại màn hình khiếu nại, đủ ngắn để token lọt ra
 * ngoài không dùng được lâu. Không có refresh token đi kèm — hết hạn là hết.
 */
export const IMPERSONATION_TTL_SECONDS = 5 * 60;

export interface ImpersonationGrant {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  /** Tài khoản đang bị xem thay — UI hiện banner để admin không quên. */
  target: { id: string; displayName: string };
}

/**
 * Cấp token chỉ-đọc để admin xem app như người dùng khi debug khiếu nại.
 * Token mang `act` (admin gốc) để audit không mất dấu người thật sự thao tác.
 */
@Injectable()
export class ImpersonationService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
  ) {}

  async start(targetId: string, adminId: string): Promise<ImpersonationGrant> {
    // Id hỏng → Mongoose CastError 500; người dùng không tồn tại → 404.
    if (!Types.ObjectId.isValid(targetId)) {
      throw new NotFoundException('User not found');
    }
    // Xem thay chính mình vô nghĩa và dễ khiến admin tưởng đã đổi quyền thật.
    if (targetId === adminId) {
      throw new BadRequestException('Không thể xem thay chính mình');
    }

    const target = await this.userModel
      .findById(targetId)
      .select('displayName isPlatformAdmin')
      .lean<{
        _id: unknown;
        displayName: string;
        isPlatformAdmin?: boolean;
      }>();
    if (!target) {
      throw new NotFoundException('User not found');
    }
    // Admin khác có quyền ghi: xem thay họ là mượn quyền quản trị, không phải debug.
    if (target.isPlatformAdmin) {
      throw new BadRequestException('Không thể xem thay tài khoản quản trị');
    }

    // Hợp đồng payload: sub = người bị xem thay, act = admin gốc (audit),
    // imp = cờ để JwtAuthGuard chặn mọi thao tác ghi.
    const accessToken = this.jwtService.sign(
      { sub: targetId, act: adminId, imp: true },
      {
        expiresIn: `${IMPERSONATION_TTL_SECONDS}s` as import('ms').StringValue,
      },
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: IMPERSONATION_TTL_SECONDS,
      target: { id: targetId, displayName: target.displayName },
    };
  }
}
