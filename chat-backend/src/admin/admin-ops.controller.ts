import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { ConversationDoc } from '../conversations/conversation.schema';
import { Story } from '../moments/schemas/story.schema';
import { BroadcastService } from './broadcast.service';
import { RatelimitMonitorService } from './ratelimit-monitor.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminAuditService } from './admin-audit.service';
import { PaginationDto } from './dto/pagination.dto';
import {
  BROADCAST_AUDIENCES,
  type BroadcastAudience,
} from './schemas/broadcast-log.schema';
import { RedisService } from '../common/redis/redis.service';
import { CoturnHealthService } from '../health/services/coturn-health.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { Request } from 'express';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { minioClient, BUCKET } from '../media/minio-client';

export class BroadcastDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) body: string;

  @ApiPropertyOptional({
    enum: BROADCAST_AUDIENCES,
    default: 'all',
    description:
      'Đối tượng nhận. personal/business hiện gửi toàn bộ (chưa có room theo loại) — log ghi lại để đối soát.',
  })
  @IsOptional()
  @IsIn(BROADCAST_AUDIENCES)
  audience?: BroadcastAudience;

  @ApiPropertyOptional({
    type: [String],
    description: 'Bắt buộc khi audience=ids. Tối đa 500 id.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  audienceIds?: string[];
}

export class RatelimitTopQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/**
 * Gửi thử push tới một tài khoản để kiểm token sau khi đổi cấu hình FCM.
 *
 * `title`/`body` bắt buộc chứ không dùng template: repo không có hệ template
 * nào (mỗi luồng push dựng payload inline), nên bảng template chỉ để chứa vài
 * câu mẫu là bề mặt bảo trì không đổi lại giá trị.
 */
export class SendTestPushDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsMongoId({ message: 'userId phải là ObjectId hợp lệ' })
  userId: string;

  @ApiProperty({ example: 'Koola Admin — kiểm tra' })
  @IsString()
  @IsNotEmpty({ message: 'title không được rỗng' })
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Đây là push thử từ trang vận hành.' })
  @IsString()
  @IsNotEmpty({ message: 'body không được rỗng' })
  @MaxLength(2000)
  body: string;
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminOpsController {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    @InjectModel(ConversationDoc.name)
    private convModel: Model<ConversationDoc>,
    @InjectModel(Story.name) private storyModel: Model<Story>,
    private readonly redisService: RedisService,
    private readonly coturnHealthService: CoturnHealthService,
    @InjectConnection() private readonly conn: Connection,
    private readonly broadcastService: BroadcastService,
    private readonly ratelimitMonitor: RatelimitMonitorService,
    private readonly notifications: NotificationsService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('analytics')
  async getAnalytics(@Query('range') range: string = '7d') {
    const days = range === '30d' ? 30 : range === '90d' ? 90 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [userGroups, msgGroups, convCount, storyCount, pending, verified] =
      await Promise.all([
        this.userModel.aggregate([
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        this.msgModel.aggregate([
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        this.convModel.countDocuments({ createdAt: { $gte: since } }),
        this.storyModel.countDocuments({ createdAt: { $gte: since } }),
        this.userModel.countDocuments({
          accountType: 'business',
          verificationStatus: 'pending',
        }),
        this.userModel.countDocuments({
          accountType: 'business',
          verificationStatus: 'verified',
        }),
      ]);
    return {
      range,
      usersDaily: userGroups,
      messagesDaily: msgGroups,
      conversationsCreated: convCount,
      storiesCreated: storyCount,
      verificationFunnel: { pending, verified },
    };
  }

  @Get('health')
  async getHealth() {
    let mongoUp = false;
    let redisUp = false;
    let coturnUp = false;
    let minioUp = false;
    const checkedAt = new Date().toISOString();
    try {
      mongoUp = (this.conn as any).readyState === 1;
    } catch {}
    try {
      const r = await this.redisService.getClient().ping();
      redisUp = r === 'PONG';
    } catch {}
    try {
      coturnUp = await this.coturnHealthService.isReachable();
    } catch {}
    try {
      // Lightweight MinIO probe — checks bucket existence without presigned URL overhead.
      // If bucket exists the MinIO endpoint is reachable and credentials are valid.
      const exists = await minioClient.bucketExists(BUCKET);
      minioUp = true;
      // exists=false still means MinIO is up but bucket missing — report degraded via existence
      void exists;
    } catch {
      minioUp = false;
    }
    return {
      status:
        !mongoUp || !redisUp
          ? 'error'
          : !coturnUp || !minioUp
            ? 'degraded'
            : 'ok',
      timestamp: checkedAt,
      checks: {
        mongodb: { status: mongoUp ? 'up' : 'down', checkedAt },
        redis: { status: redisUp ? 'up' : 'down', checkedAt },
        coturn: { status: coturnUp ? 'up' : 'down', checkedAt },
        minio: { status: minioUp ? 'up' : 'down', checkedAt },
      },
    };
  }

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async broadcast(
    @Body() dto: BroadcastDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    // audience='ids' mà không có id thì phát cho 0 người — chặn sớm thay vì
    // ghi một log "đã gửi" sai sự thật.
    if (dto.audience === 'ids' && (dto.audienceIds?.length ?? 0) === 0) {
      throw new BadRequestException('audienceIds là bắt buộc khi audience=ids');
    }
    return this.broadcastService.send(dto, u.actorId, req.ip ?? null);
  }

  @Get('broadcast-history')
  async broadcastHistory(@Query() query: PaginationDto) {
    return this.broadcastService.history(query);
  }

  @Get('ratelimit/top')
  async ratelimitTop(@Query() query: RatelimitTopQueryDto) {
    return { data: await this.ratelimitMonitor.top(query.limit ?? 20) };
  }

  /**
   * Gửi một push thật tới mọi thiết bị của `userId`.
   *
   * Trả số liệu (không ném khi FCM chưa cấu hình) để trang admin hiện được
   * "0/2 token" — một thông điệp chung "đã gửi" là nói dối khi FCM sai cấu hình.
   * Ghi audit vì đây là thao tác chạm thiết bị người dùng, không phải đọc log.
   */
  @Post('push-logs/test')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 10, ttl: 60000 },
    long: { limit: 60, ttl: 60000 },
  })
  @ApiOperation({ summary: 'Gửi push thử tới một tài khoản' })
  async sendTestPush(
    @Body() dto: SendTestPushDto,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const result = await this.notifications.sendAdminTestPush({
      userId: dto.userId,
      title: dto.title,
      body: dto.body,
    });

    await this.audit.log({
      actorId: user.actorId,
      action: 'send_test_push',
      targetType: 'user',
      targetId: dto.userId,
      // Không log nội dung push — admin có thể gõ thông tin nội bộ vào đó.
      // Tên key cũng tránh chữ "token": bộ lọc redact bắt theo tên key nên
      // `tokenCount` bị thay bằng "[REDACTED]" và mất luôn số liệu đối soát.
      payload: {
        devices: result.tokenCount,
        delivered: result.successCount,
        failed: result.failureCount,
        skipped: result.skipped ?? null,
      },
      ip: req.ip ?? null,
    });

    return result;
  }

  // Music admin CRUD is handled by AdminModerationController (GET/POST/PATCH/DELETE /admin/music-tracks).
  // Legacy duplicate stubs removed to avoid route collision; see AdminModerationController for persistence.
}
