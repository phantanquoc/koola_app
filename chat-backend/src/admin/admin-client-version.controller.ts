import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { User, UserDocument } from '../users/user.schema';

export interface ClientVersionBucket {
  platform: 'ios' | 'android' | 'web';
  version: string;
  /** Số tài khoản đang chạy đúng phiên bản này lần cuối. */
  users: number;
  /** Bao nhiêu tài khoản đã cập nhật trong 7 ngày qua (đang hoạt động). */
  recentlyActive: number;
}

/**
 * Phiên bản client đang chạy thật — nguồn dữ liệu duy nhất để chọn mốc ép cập
 * nhật.
 *
 * **Vì sao không lấy từ store**: repo chưa có app trên App Store/Play
 * (`itunes lookup` → 0 kết quả, Play Store → 404) và không có project `ios/`.
 * Không có gì để fetch. Dữ liệu ở đây do client tự khai qua header
 * `X-App-Platform`/`X-App-Version` (xem `ClientVersionInterceptor`) — cùng cách
 * Firebase Remote Config và Sentry releases làm.
 *
 * Chỉ đếm tài khoản sống (`deletedAt: null`) và bỏ qua hồ sơ chưa từng khai
 * phiên bản. Sắp xếp giảm dần theo số người để mốc đang phổ biến nhất lên đầu.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminClientVersionController {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  @Get('client-versions')
  @ApiOperation({
    summary: 'Phân bố phiên bản client đang chạy (client tự khai qua header)',
  })
  async list(): Promise<{
    data: ClientVersionBucket[];
    /** Số tài khoản đã từng khai phiên bản — mẫu số của phân bố. */
    reporters: number;
    /** Số tài khoản sống chưa từng khai — app cũ chưa gửi header. */
    unknown: number;
  }> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [grouped, reporters, unknown] = await Promise.all([
      this.userModel.aggregate<{
        _id: { platform: string; version: string };
        users: number;
        recentlyActive: number;
      }>([
        {
          $match: {
            deletedAt: null,
            lastAppVersion: { $ne: null },
            lastAppPlatform: { $ne: null },
          },
        },
        {
          $group: {
            _id: {
              platform: '$lastAppPlatform',
              version: '$lastAppVersion',
            },
            users: { $sum: 1 },
            recentlyActive: {
              $sum: {
                $cond: [{ $gte: ['$lastAppVersionAt', sevenDaysAgo] }, 1, 0],
              },
            },
          },
        },
        { $sort: { users: -1, '_id.version': -1 } },
      ]),
      this.userModel.countDocuments({
        deletedAt: null,
        lastAppVersion: { $ne: null },
      }),
      this.userModel.countDocuments({
        deletedAt: null,
        lastAppVersion: null,
      }),
    ]);

    return {
      data: grouped.map((g) => ({
        platform: g._id.platform as ClientVersionBucket['platform'],
        version: g._id.version,
        users: g.users,
        recentlyActive: g.recentlyActive,
      })),
      reporters,
      unknown,
    };
  }
}
